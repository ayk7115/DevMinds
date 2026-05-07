import express from 'express';
import simpleGit from 'simple-git';
import { analyzeRepository } from '../services/repoAnalyzer.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();
const CLONE_TIMEOUT_MS = Number(process.env.DEVMIND_CLONE_TIMEOUT_MS || 90000);
const tempReposRoot = path.resolve(__dirname, '../../temp-repos');
const MAX_FILE_CONTENT_BYTES = Number(process.env.DEVMIND_SCAN_FILE_BYTES || 120000);
const MAX_TOTAL_CONTENT_BYTES = Number(process.env.DEVMIND_SCAN_TOTAL_BYTES || 2000000);
const MAX_CONTENT_FILES = Number(process.env.DEVMIND_SCAN_CONTENT_FILES || 120);

const parseGitHubRepoUrl = (repoUrl) => {
    try {
        const url = new URL(repoUrl);
        const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
        const owner = segments[0];
        const repo = segments[1]?.replace(/\.git$/i, '');

        if (url.protocol !== 'https:' || url.hostname !== 'github.com' || segments.length !== 2 || !owner || !repo) {
            return null;
        }
        if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) {
            return null;
        }

        return {
            owner,
            repo,
            safeCloneUrl: `https://github.com/${owner}/${repo}.git`,
            displayUrl: `https://github.com/${owner}/${repo}`
        };
    } catch {
        return null;
    }
};

const ensureInsideTempRoot = (targetPath) => {
    const resolved = path.resolve(targetPath);
    if (!resolved.startsWith(`${tempReposRoot}${path.sep}`)) {
        throw new Error('Resolved temp path escaped the repository temp directory.');
    }
    return resolved;
};

const cleanupTempPath = (targetPath) => {
    const safePath = ensureInsideTempRoot(targetPath);
    if (fs.existsSync(safePath)) {
        fs.rmSync(safePath, { recursive: true, force: true });
    }
};

const withTimeout = (promise, timeoutMs, label) => {
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
};

const collectDisplayFileContents = (rootPath, codeFiles = []) => {
    const contents = {};
    let totalBytes = 0;
    let included = 0;

    for (const file of codeFiles) {
        if (included >= MAX_CONTENT_FILES) break;
        if (!file.path || file.size > MAX_FILE_CONTENT_BYTES) continue;
        if (totalBytes + file.size > MAX_TOTAL_CONTENT_BYTES) break;

        const resolved = path.resolve(rootPath, file.path);
        const root = path.resolve(rootPath);
        if (!resolved.startsWith(`${root}${path.sep}`)) continue;

        try {
            contents[file.path] = {
                content: fs.readFileSync(resolved, 'utf-8'),
                truncated: false
            };
            totalBytes += file.size;
            included += 1;
        } catch {
            contents[file.path] = {
                content: '',
                truncated: true
            };
        }
    }

    return {
        files: contents,
        meta: {
            included,
            maxFiles: MAX_CONTENT_FILES,
            maxFileBytes: MAX_FILE_CONTENT_BYTES,
            maxTotalBytes: MAX_TOTAL_CONTENT_BYTES,
            totalBytes
        }
    };
};

/**
 * POST /api/analyze-repo
 * Body: { repoUrl: string }
 * Clones a remote GitHub repo to a temp folder, analyzes it, then deletes it.
 */
router.post('/', async (req, res) => {
    const { repoUrl } = req.body;
    const parsedRepo = parseGitHubRepoUrl(repoUrl);

    if (!parsedRepo) {
        return res.status(400).json({ error: 'A valid GitHub URL is required (https://github.com/...)' });
    }

    const repoName = `${parsedRepo.owner}_${parsedRepo.repo}`;
    const runId = `scan-${Date.now()}`;
    // Use a unique temp path per run to prevent git 'existing refs' bugs on Windows
    const tempPath = ensureInsideTempRoot(path.join(tempReposRoot, `${repoName}_${runId}`));

    try {
        db.prepare(`
            INSERT OR REPLACE INTO analysis_runs
                (id, source_type, repo_name, external_id, title, status, current_stage)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(runId, 'repo_scan', repoName, parsedRepo.displayUrl, `Repository Scan: ${repoName}`, 'running', 'cloning_repository');

        fs.mkdirSync(tempPath, { recursive: true });

        console.log(`[RepoIngestion] Cloning ${parsedRepo.displayUrl} to ${tempPath}...`);
        const git = simpleGit();

        // Shallow clone — fast, no history, just latest snapshot
        await withTimeout(git.clone(parsedRepo.safeCloneUrl, tempPath, ['--depth', '1', '--single-branch']), CLONE_TIMEOUT_MS, 'Repository clone');
        console.log(`[RepoIngestion] Clone complete. Starting analysis...`);
        db.prepare(`UPDATE analysis_runs SET current_stage = ? WHERE id = ?`).run('analyzing_repository', runId);

        const analysis = analyzeRepository(tempPath);
        const displayContents = collectDisplayFileContents(tempPath, analysis.codeFiles || []);
        const repoBaseName = parsedRepo.repo;

        // Save the analysis to the insights DB so ChatBot and Timeline can see it
        const io = req.app.get('io');
        const summaryText = `Repository Architecture Scan for ${repoBaseName}.\nFiles: ${analysis.metrics.files} | Endpoints: ${analysis.metrics.apiEndpoints} | Gaps: ${analysis.risks.length}`;
        const architecturalImpact = `Analyzed ${Object.keys(analysis.dependencies).length} dependencies and ${Object.keys(analysis.languageStats).length} languages.`;
        const securityRisks = analysis.risks.length > 0 ? analysis.risks.join('; ') : 'No immediate structural risks detected.';
        let insightPayload = null;
        
        try {
            const stmt = db.prepare(`
                INSERT INTO insights (pr_id, repo_name, author, title, readiness_score, summary, architectural_impact, security_risks, raw_output)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const rawOutputObj = {
                type: 'repo_scan',
                changelog: analysis.summary,
                raw: JSON.stringify(analysis)
            };
            
            const pseudoPrId = 'SCAN-' + Date.now();
            const score = Math.max(10, 100 - (analysis.risks.length * 15));

            const saved = stmt.run(
                pseudoPrId,
                repoBaseName,
                'Repo X-Ray',
                `Repository Scan: ${repoBaseName}`,
                score,
                summaryText,
                architecturalImpact,
                securityRisks,
                JSON.stringify(rawOutputObj)
            );
            db.prepare(`
                UPDATE analysis_runs
                SET status = ?, current_stage = ?, insight_id = ?, completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run('complete', 'complete', saved.lastInsertRowid, runId);

            insightPayload = {
                id: pseudoPrId,
                runId,
                prId: pseudoPrId,
                readinessScore: score,
                stakeholder_summary: summaryText,
                summary: summaryText,
                engineer_changelog: analysis.summary,
                architecturalImpact: architecturalImpact,
                securityRisks: securityRisks,
                rawOutput: JSON.stringify(analysis)
            };

            if (io) {
                io.emit('agent:complete', {
                    runId,
                    status: 'complete',
                    prId: pseudoPrId,
                    type: 'repo_scan',
                    insights: insightPayload
                });
            }
        } catch (dbError) {
            console.error('[RepoIngestion] Failed to persist scan to DB:', dbError);
        }

        // Send Telegram Notification
        try {
            if (!insightPayload) throw new Error('Scan insight payload was not created.');
            const { formatPRMessage, sendTelegramMessage } = await import('../services/telegramService.js');
            const telegramMsg = formatPRMessage(insightPayload, { 
                id: 'SCAN', 
                title: `Full Architecture Scan: ${repoBaseName}`,
                author: 'Repo X-Ray',
                repo: repoBaseName,
                html_url: parsedRepo.displayUrl
            });
            sendTelegramMessage(telegramMsg).catch(err => console.error('[Telegram] Scan notification failed:', err));
        } catch (tgErr) {
            console.warn('[Telegram] Skipping scan notification:', tgErr.message);
        }

        // Securely delete after analysis — zero-footprint
        cleanupTempPath(tempPath);
        console.log(`[RepoIngestion] Temp folder deleted. Zero footprint maintained.`);

        res.status(200).json({
            ...analysis,
            fileContents: displayContents.files,
            fileContentMeta: displayContents.meta,
            repoUrl: parsedRepo.displayUrl,
            repoName: parsedRepo.repo
        });
    } catch (error) {
        console.error('[RepoIngestion] Failed:', error);
        db.prepare(`
            UPDATE analysis_runs
            SET status = ?, current_stage = ?, error = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run('failed', 'failed', error.message, runId);
        // Ensure cleanup even on failure
        cleanupTempPath(tempPath);
        res.status(500).json({ error: `Failed to analyze repository: ${error.message}` });
    }
});

export default router;
