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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIFF_FETCH_ATTEMPTS = Number(process.env.DEVMIND_DIFF_FETCH_ATTEMPTS || 3);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
 * Orchestrates the execution of OpenClaw on Ubuntu via WSL.
 */
export const processPullRequest = async (prData, io) => {
    console.log(`[AgentService] Initializing OpenClaw execution for PR: ${prData.title}`);

    // Read prompt files directly
    const soulPath = path.join(__dirname, '../agent/SOUL.md');
    const skillPath = path.join(__dirname, '../agent/SKILL.md');
    const memoryPath = path.join(__dirname, '../agent/MEMORY.md');
    
    // Auto Handover Docs: Inject fresh architecture into MEMORY.md
    try {
        const { analyzeRepository } = await import('./repoAnalyzer.js');
        const rootPath = path.resolve();
        const repoData = analyzeRepository(rootPath);
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
    }

    try {
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
        prioritizedDiffContext = diffContent.slice(0, 10000) + (diffContent.length > 10000 ? '\n...[TRUNCATED]' : '');
    }

    try {
        similarPrs = await searchSimilarPrs({
            query: `${prData.title}\n${prioritizedDiffContext.slice(0, 4000)}`,
            repoName: prData.repo,
            limit: 3
        });
    } catch (memoryError) {
        console.warn('[AgentService] Hybrid memory search skipped:', memoryError.message);
    }

    return new Promise((resolve, reject) => {
        const nodePath = '/home/aadi/.nvm/versions/node/v22.22.2/bin/node';
        const openclawPath = '/home/aadi/.nvm/versions/node/v22.22.2/bin/openclaw';
        
        // Construct the full prompt context with RAW TEXT, not a URL
        const securityContext = sastFindings.length > 0
            ? sastFindings.map(f => `- ${f.severity.toUpperCase()} ${f.ruleId} in ${f.filePath}:${f.line}: ${f.message}`).join('\n')
            : 'No lightweight SAST findings detected in prioritized chunks.';

        const recurrenceContext = similarPrs.length > 0
            ? similarPrs.map(item => `- ${item.title} (${Math.round(item.similarity * 100)}% similar): ${item.summary}`).join('\n')
            : 'No similar historical PR pattern was found in local vector memory.';

        const fullPrompt = `${soulContent}\n\n${skillContent}\n\n${memoryContent}\n\nAnalyze these prioritized PR diff chunks and output a readinessScore, readinessScoreBreakdown, stakeholder_summary, engineer_changelog, architecturalImpact, and securityRisks in JSON format.\nPR Title: ${prData.title}\n\nLightweight SAST Signals:\n${securityContext}\n\nRecurring Historical Patterns:\n${recurrenceContext}\n\nPrioritized Diff Context:\n${prioritizedDiffContext}`;

        // To prevent Windows WSL from treating newlines as separate commands,
        // we write the prompt and a runner script to disk, then execute the script.
        const promptFilePath = path.join(__dirname, '../agent/temp_prompt.txt');
        const scriptFilePath = path.join(__dirname, '../agent/temp_runner.sh');
        
        fs.writeFileSync(promptFilePath, fullPrompt);
        
        const bashScript = `#!/bin/bash
PROMPT=$(cat "${toWslPath(promptFilePath)}")
"${nodePath}" "${openclawPath}" infer model run --local --model ollama/llama3 --prompt "$PROMPT"
`;
        fs.writeFileSync(scriptFilePath, bashScript);

        const args = ['bash', toWslPath(scriptFilePath)];

        console.log(`[AgentService] Spawning WSL process: wsl ${args.join(' ')}`);

        const child = spawn('wsl', args);

        let fullOutput = '';

        // Capture real-time stream from OpenClaw
        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            fullOutput += chunk;
            
            // Stream token-by-token to the frontend for a "typing" effect
            if (io) {
                io.emit('agent:stream', {
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
                if (io) io.emit('agent:error', { message: 'OpenClaw execution failed.', prId: prData.id });
                return reject(new Error(`OpenClaw exited with code ${code}`));
            }

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
                    status: 'complete',
                    prId: prData.id,
                    insights: insight
                });
            }

            resolve(insight);
        });

        child.on('error', (err) => {
            console.error('[AgentService] Failed to start WSL process:', err);
            reject(err);
        });
    });
};
