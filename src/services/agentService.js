import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../config/db.js';
import { sendTelegramMessage, formatPRMessage } from './telegramService.js';
import { chunkDiffForLlm } from './enterprise/smartDiffChunker.js';
import { scanDiffChunks } from './enterprise/sastScanner.js';
import { rememberPrInsight, searchSimilarPrs } from './enterprise/hybridContextMemory.js';
import { extractJiraKey, updateJiraFromInsight } from './enterprise/gerritJiraAdapters.js';
import { createRuntimeRunDir, runtimeConfig } from '../config/runtimeConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIFF_FETCH_ATTEMPTS = Number(process.env.DEVMIND_DIFF_FETCH_ATTEMPTS || 3);
const isWindowsHost = process.platform === 'win32';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const createRunId = (prData) => `pr-${prData.id}-${Date.now()}`;

const createAnalysisRun = (runId, prData) => {
    db.prepare(`
        INSERT OR REPLACE INTO analysis_runs
            (id, source_type, repo_name, external_id, title, status, current_stage)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        runId,
        prData.sourceType || 'github_pr',
        prData.repo,
        prData.id?.toString(),
        prData.title,
        'running',
        'initializing'
    );
};

const updateAnalysisRun = (runId, { status = 'running', stage, error = null, insightId = null } = {}) => {
    db.prepare(`
        UPDATE analysis_runs
        SET status = ?,
            current_stage = COALESCE(?, current_stage),
            error = ?,
            insight_id = COALESCE(?, insight_id),
            completed_at = CASE WHEN ? IN ('complete', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE id = ?
    `).run(status, stage, error, insightId, status, runId);
};

const appendRunLog = (runId, level, message) => {
    db.prepare(`
        INSERT INTO analysis_run_logs (run_id, level, message)
        VALUES (?, ?, ?)
    `).run(runId, level, message);
};

const fetchWithRetries = async (url, options = {}, attempts = DIFF_FETCH_ATTEMPTS) => {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await fetch(url, options);
        } catch (error) {
            lastError = error;
            console.warn(`[AgentService] Diff fetch attempt ${attempt}/${attempts} failed: ${error.message}`);
            if (attempt < attempts) {
                await sleep(750 * attempt);
            }
        }
    }

    throw lastError;
};

/**
 * Converts a Windows path to a WSL path
 * e.g., C:\Users\name -> /mnt/c/Users/name
 */
const toWslPath = (winPath) => {
    if (winPath.startsWith('/') || winPath.startsWith('~')) return winPath;
    const absolutePath = path.resolve(winPath).replace(/\\/g, '/');
    const driveMatch = absolutePath.match(/^([a-zA-Z]):/);
    if (driveMatch) {
        const drive = driveMatch[1].toLowerCase();
        return `/mnt/${drive}${absolutePath.substring(2)}`;
    }
    return absolutePath;
};

/**
 * Agent Service (Phase 2)
 * Orchestrates OpenClaw through the configured local project binary.
 */
export const processPullRequest = async (prData, io) => {
    const runId = prData.runId || createRunId(prData);
    console.log(`[AgentService] Initializing OpenClaw execution for PR: ${prData.title}`);
    createAnalysisRun(runId, prData);
    appendRunLog(runId, 'info', 'Analysis run initialized.');

    // Read prompt files directly
    const soulPath = path.join(__dirname, '../agent/SOUL.md');
    const skillPath = path.join(__dirname, '../agent/SKILL.md');
    const memoryPath = path.join(__dirname, '../agent/MEMORY.md');
    
    let repoData = { vulnerabilities: [], summary: '' };
    try {
        const { analyzeRepository } = await import('./repoAnalyzer.js');
        const rootPath = path.resolve();
        repoData = analyzeRepository(rootPath);
        const memoryContent = `This file contains persistent project context generated dynamically by the Repo X-Ray.\n\n${repoData.summary}`;
        fs.writeFileSync(memoryPath, memoryContent);
    } catch (err) {
        console.error('[AgentService] Failed to update MEMORY.md with Repo X-Ray', err);
    }

    const soulContent = fs.readFileSync(soulPath, 'utf-8');
    const skillContent = fs.readFileSync(skillPath, 'utf-8');
    const memoryContent = fs.readFileSync(memoryPath, 'utf-8');

    // Emit event to frontend
    if (io) {
        io.emit('agent:status', {
            runId,
            status: 'initializing',
            message: 'Waking up the Strategic Twin on Ubuntu...',
            prId: prData.id
        });
    }

    // Sovereign Hardening: Fetch diff locally so OpenClaw stays offline
    let diffContent = "Diff content unavailable";
    let prioritizedDiffContext = diffContent;
    let sastFindings = [];
    let similarPrs = [];
    try {
        updateAnalysisRun(runId, { stage: 'fetching_diff' });
        appendRunLog(runId, 'info', 'Fetching PR diff.');
        console.log(`[AgentService] Fetching raw diff securely using GITHUB_PAT`);
        const fetchOptions = process.env.GITHUB_PAT ? {
            headers: {
                'Authorization': `token ${process.env.GITHUB_PAT}`,
                'Accept': 'application/vnd.github.v3.diff'
            }
        } : {};
        
        const diffResponse = await fetchWithRetries(prData.diff_url, fetchOptions);
        if (diffResponse.ok) {
            diffContent = await diffResponse.text();
        } else {
            console.warn(`[AgentService] Failed to fetch diff: ${diffResponse.status}`);
        }
    } catch (fetchError) {
        console.error('[AgentService] Network error fetching diff:', fetchError);
        appendRunLog(runId, 'warn', `Diff fetch failed: ${fetchError.message}`);
    }

    try {
        updateAnalysisRun(runId, { stage: 'chunking_diff' });
        appendRunLog(runId, 'info', 'Chunking diff and scanning prioritized context.');
        const chunks = await chunkDiffForLlm(diffContent, {
            repoRoot: path.resolve(),
            maxChars: Number(process.env.DEVMIND_CHUNK_CHARS || 4600)
        });

        if (chunks.length > 0) {
            const insertChunk = db.prepare(`
                INSERT INTO diff_chunks
                    (pr_id, file_path, symbol_name, chunk_type, priority_score, token_estimate, content)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            for (const chunk of chunks.slice(0, 16)) {
                insertChunk.run(
                    prData.id.toString(),
                    chunk.filePath,
                    chunk.symbolName,
                    chunk.chunkType,
                    chunk.priorityScore,
                    chunk.tokenEstimate,
                    chunk.content
                );
            }

            sastFindings = scanDiffChunks({
                chunks,
                prId: prData.id.toString(),
                repoName: prData.repo
            });

            prioritizedDiffContext = chunks
                .slice(0, Number(process.env.DEVMIND_MAX_PROMPT_CHUNKS || 8))
                .map((chunk, index) => `## Chunk ${index + 1} (${chunk.filePath}${chunk.symbolName ? ` :: ${chunk.symbolName}` : ''}, priority ${chunk.priorityScore})\n${chunk.content}`)
                .join('\n\n')
                .slice(0, Number(process.env.DEVMIND_MAX_DIFF_CONTEXT || 14000));
        }
    } catch (chunkError) {
        console.error('[AgentService] Smart chunking failed, falling back to truncated raw diff:', chunkError);
        appendRunLog(runId, 'warn', `Smart chunking fallback used: ${chunkError.message}`);
        prioritizedDiffContext = diffContent.slice(0, 10000) + (diffContent.length > 10000 ? '\n...[TRUNCATED]' : '');
    }

    try {
        updateAnalysisRun(runId, { stage: 'searching_memory' });
        similarPrs = await searchSimilarPrs({
            query: `${prData.title}\n${prioritizedDiffContext.slice(0, 4000)}`,
            repoName: prData.repo,
            limit: 3
        });
    } catch (memoryError) {
        console.warn('[AgentService] Hybrid memory search skipped:', memoryError.message);
        appendRunLog(runId, 'warn', `Hybrid memory search skipped: ${memoryError.message}`);
    }

    return new Promise((resolve, reject) => {
        const openclawPath = runtimeConfig.openclawPath;
        const localModel = runtimeConfig.localModel;
        
        // Construct the full prompt context with RAW TEXT, not a URL
        const securityContext = sastFindings.length > 0
            ? sastFindings.map(f => `- ${f.severity.toUpperCase()} ${f.ruleId} in ${f.filePath}:${f.line}: ${f.message}`).join('\n')
            : 'No lightweight SAST findings detected in prioritized chunks.';

        const repoVulnerabilities = repoData.vulnerabilities && repoData.vulnerabilities.length > 0
            ? repoData.vulnerabilities.map(v => `- [${v.severity.toUpperCase()}] ${v.message} in ${v.filePath}`).join('\n')
            : 'No repository-wide vulnerabilities detected by Repo X-Ray.';

        const recurrenceContext = similarPrs.length > 0
            ? similarPrs.map(item => `- ${item.title} (${Math.round(item.similarity * 100)}% similar): ${item.summary}`).join('\n')
            : 'No similar historical PR pattern was found in local vector memory.';

        const fullPrompt = `${soulContent}\n\n${skillContent}\n\n${memoryContent}\n\n### STRATEGIC TASK\nAnalyze these prioritized PR diff chunks against the existing project architecture. 
DO NOT hallucinate files or structures that are not in the MEMORY.md.
Output a valid JSON object with: readinessScore, readinessScoreBreakdown (array of {category, score, rationale}), stakeholder_summary, engineer_changelog, architecturalImpact, and securityRisks.

PR Title: ${prData.title}

### DETECTED REPO VULNERABILITIES (FOR CONTEXT)
${repoVulnerabilities}

### LIGHTWEIGHT SAST SIGNALS (FROM DIFF)
${securityContext}

### RECURRING HISTORICAL PATTERNS
${recurrenceContext}

### PRIORITIZED DIFF CONTEXT
${prioritizedDiffContext}`;

        const runDir = createRuntimeRunDir(`pr-${prData.id}`);
        const promptFilePath = path.join(runDir, 'prompt.txt');
        const scriptFilePath = path.join(runDir, 'runner.sh');
        
        fs.writeFileSync(promptFilePath, fullPrompt, { mode: 0o600 });
        
        const bashScript = `#!/bin/bash
set -euo pipefail
PROMPT=$(cat "${isWindowsHost ? toWslPath(promptFilePath) : promptFilePath}")
export GROQ_API_KEY="${process.env.GROQ_API_KEY || ''}"
"${isWindowsHost ? toWslPath(openclawPath) : openclawPath}" infer model run --local --model "${localModel}" --prompt "$PROMPT"
`;
        fs.writeFileSync(scriptFilePath, bashScript, { mode: 0o700 });

        const args = isWindowsHost ? ['bash', toWslPath(scriptFilePath)] : [scriptFilePath];
        const command = isWindowsHost ? 'wsl' : 'bash';
        
        // Support isolated runner user if configured
        if (isWindowsHost && process.env.DEVMIND_WSL_USER) {
            args.unshift('-u', process.env.DEVMIND_WSL_USER);
        }

        console.log(`[AgentService] Spawning OpenClaw process: ${command} ${args.join(' ')}`);
        updateAnalysisRun(runId, { stage: 'running_local_model' });
        appendRunLog(runId, 'info', `OpenClaw started with model ${localModel}.`);

        const child = spawn(command, args, {
            cwd: runtimeConfig.projectRoot,
            env: process.env
        });

        let fullOutput = '';

        // Capture real-time stream from OpenClaw
        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            fullOutput += chunk;
            
            // Stream token-by-token to the frontend for a "typing" effect
            if (io) {
                io.emit('agent:stream', {
                    runId,
                    prId: prData.id,
                    chunk: chunk
                });
            }
        });

        child.stderr.on('data', (data) => {
            console.error(`[OpenClaw Error]: ${data}`);
        });

        child.on('close', (code) => {
            console.log(`[AgentService] OpenClaw process exited with code ${code}`);

            if (code !== 0) {
                updateAnalysisRun(runId, { status: 'failed', stage: 'local_model_failed', error: `OpenClaw exited with code ${code}` });
                appendRunLog(runId, 'error', `OpenClaw exited with code ${code}.`);
                if (io) io.emit('agent:error', { runId, message: 'OpenClaw execution failed.', prId: prData.id });
                return reject(new Error(`OpenClaw exited with code ${code}`));
            }

            updateAnalysisRun(runId, { stage: 'parsing_model_output' });
            // Extract JSON from OpenClaw output
            let insight;
            try {
                const jsonMatch = fullOutput.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    insight = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No JSON block found in output');
                }
            } catch (parseError) {
                console.error('[AgentService] Failed to parse OpenClaw output. Falling back to recovery mode.', parseError);
                insight = {
                    readinessScore: 50,
                    stakeholder_summary: "Analysis failed to parse correctly, but the process completed.",
                    engineer_changelog: "Raw output could not be parsed as structured JSON.",
                    architecturalImpact: "Unknown",
                    securityRisks: "Unknown",
                };
            }

            insight.rawOutput = fullOutput;

            // Persist the results to SQLite
            try {
                const stmt = db.prepare(`
                    INSERT INTO insights (pr_id, repo_name, author, title, readiness_score, summary, architectural_impact, security_risks, raw_output)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                // We map stakeholder_summary to the legacy 'summary' column, and append the changelog to 'raw_output' for persistence
                const persistedRawOutput = JSON.stringify({
                    changelog: insight.engineer_changelog,
                    breakdown: insight.readinessScoreBreakdown,
                    raw: fullOutput
                });

                const saved = stmt.run(
                    prData.id.toString(), 
                    prData.repo, 
                    prData.author, 
                    prData.title, 
                    insight.readinessScore, 
                    insight.stakeholder_summary || "No summary provided", 
                    insight.architecturalImpact, 
                    insight.securityRisks, 
                    persistedRawOutput
                );
                insight.id = saved.lastInsertRowid;
                insight.runId = runId;
                updateAnalysisRun(runId, { status: 'complete', stage: 'complete', insightId: saved.lastInsertRowid });
                appendRunLog(runId, 'info', 'Insight persisted and run completed.');
                console.log('[Database] Insight persisted for PR:', prData.id);

                const ticketKey = prData.ticketKey || extractJiraKey(prData.title, prData.body);
                rememberPrInsight({
                    prId: prData.id.toString(),
                    repoName: prData.repo,
                    ticketKey,
                    title: prData.title,
                    summary: insight.stakeholder_summary || insight.engineer_changelog || '',
                    metadata: {
                        readinessScore: insight.readinessScore,
                        architecturalImpact: insight.architecturalImpact,
                        securityRisks: insight.securityRisks
                    }
                }).catch(err => {
                    console.warn('[HybridMemory] Embedding persistence skipped:', err.message);
                });

                if (ticketKey && process.env.DEVMIND_AUTO_JIRA === 'true') {
                    updateJiraFromInsight({ ticketKey, insight, dryRun: false }).catch(err => {
                        console.error('[JiraAdapter] Automatic Jira sync failed:', err.message);
                    });
                }

                // Send Telegram Notification (Phase 3 Integration)
                const telegramMsg = formatPRMessage(insight, prData);
                sendTelegramMessage(telegramMsg, { parseMode: 'HTML' }).catch(err => {
                    console.error('[TelegramService] Delivery failed:', err);
                });
            } catch (dbError) {
                console.error('[Database] Error saving insight:', dbError);
            }

            // Emit final completion event
            if (io) {
                io.emit('agent:complete', {
                    runId,
                    status: 'complete',
                    prId: prData.id,
                    insights: insight
                });
            }

            resolve(insight);
        });

        child.on('error', (err) => {
            console.error('[AgentService] Failed to start OpenClaw process:', err);
            updateAnalysisRun(runId, { status: 'failed', stage: 'spawn_failed', error: err.message });
            appendRunLog(runId, 'error', `Failed to start OpenClaw: ${err.message}`);
            reject(err);
        });
    });
};
