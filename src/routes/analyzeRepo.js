import express from 'express';
import simpleGit from 'simple-git';
import { analyzeRepository } from '../services/repoAnalyzer.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

/**
 * POST /api/analyze-repo
 * Body: { repoUrl: string }
 * Clones a remote GitHub repo to a temp folder, analyzes it, then deletes it.
 */
router.post('/', async (req, res) => {
    const { repoUrl } = req.body;

    if (!repoUrl || !repoUrl.startsWith('https://github.com/')) {
        return res.status(400).json({ error: 'A valid GitHub URL is required (https://github.com/...)' });
    }

    const repoName = repoUrl.split('/').slice(-2).join('_').replace('.git', '');
    const tempPath = path.join(__dirname, '../../temp-repos', repoName);

    try {
        // Clean up if already exists
        if (fs.existsSync(tempPath)) {
            fs.rmSync(tempPath, { recursive: true, force: true });
        }
        fs.mkdirSync(tempPath, { recursive: true });

        console.log(`[RepoIngestion] Cloning ${repoUrl} to ${tempPath}...`);
        const git = simpleGit();

        // Shallow clone — fast, no history, just latest snapshot
        await git.clone(repoUrl, tempPath, ['--depth', '1']);
        console.log(`[RepoIngestion] Clone complete. Starting analysis...`);

        const analysis = analyzeRepository(tempPath);
        const repoBaseName = repoUrl.split('/').slice(-1)[0];

        // Save the analysis to the insights DB so ChatBot and Timeline can see it
        const io = req.app.get('io');
        const summaryText = `Repository Architecture Scan for ${repoBaseName}.\nFiles: ${analysis.metrics.files} | Endpoints: ${analysis.metrics.apiEndpoints} | Gaps: ${analysis.risks.length}`;
        const architecturalImpact = `Analyzed ${Object.keys(analysis.dependencies).length} dependencies and ${Object.keys(analysis.languageStats).length} languages.`;
        const securityRisks = analysis.risks.length > 0 ? analysis.risks.join('; ') : 'No immediate structural risks detected.';
        
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

            stmt.run(
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

            const insightPayload = {
                id: pseudoPrId,
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
            const { formatPRMessage, sendTelegramMessage } = await import('../services/telegramService.js');
            const telegramMsg = formatPRMessage(insightPayload, { 
                id: 'SCAN', 
                title: `Full Architecture Scan: ${repoBaseName}`,
                author: 'Repo X-Ray',
                repo: repoBaseName,
                html_url: repoUrl
            });
            sendTelegramMessage(telegramMsg).catch(err => console.error('[Telegram] Scan notification failed:', err));
        } catch (tgErr) {
            console.warn('[Telegram] Skipping scan notification:', tgErr.message);
        }

        // Securely delete after analysis — zero-footprint
        fs.rmSync(tempPath, { recursive: true, force: true });
        console.log(`[RepoIngestion] Temp folder deleted. Zero footprint maintained.`);

        res.status(200).json({ ...analysis, repoUrl, repoName: repoUrl.split('/').slice(-1)[0] });
    } catch (error) {
        console.error('[RepoIngestion] Failed:', error);
        // Ensure cleanup even on failure
        if (fs.existsSync(tempPath)) {
            fs.rmSync(tempPath, { recursive: true, force: true });
        }
        res.status(500).json({ error: `Failed to analyze repository: ${error.message}` });
    }
});

export default router;
