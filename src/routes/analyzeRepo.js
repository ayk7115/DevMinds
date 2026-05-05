import express from 'express';
import simpleGit from 'simple-git';
import { analyzeRepository } from '../services/repoAnalyzer.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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
