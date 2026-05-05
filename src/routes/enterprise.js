import express from 'express';
import path from 'path';
import db from '../config/db.js';
import { processPullRequest } from '../services/agentService.js';
import { chunkDiffForLlm } from '../services/enterprise/smartDiffChunker.js';
import { normalizeGerritPatchset, persistIntegrationEvent, updateJiraFromInsight } from '../services/enterprise/gerritJiraAdapters.js';
import { recordDebtSnapshot, getDebtHotspots } from '../services/enterprise/technicalDebtModel.js';
import { rememberPrInsight, searchSimilarPrs } from '../services/enterprise/hybridContextMemory.js';
import { persistAstDigest } from '../services/enterprise/treeSitterParser.js';
import { scanDiffChunks } from '../services/enterprise/sastScanner.js';

const router = express.Router();

router.post('/gerrit', async (req, res) => {
    const event = normalizeGerritPatchset(req.body);
    persistIntegrationEvent(event);
    res.status(202).json({ accepted: true, eventId: event.id, ticketKey: event.ticketKey });

    const io = req.app.get('io');
    processPullRequest(event, io).catch(error => {
        console.error('[Enterprise:Gerrit] Processing failed:', error);
    });
});

router.post('/jira/sync', async (req, res) => {
    const { ticketKey, insightId, insight, dryRun = true } = req.body;
    const resolvedInsight = insight || db.prepare('SELECT * FROM insights WHERE id = ?').get(insightId);
    if (!ticketKey || !resolvedInsight) {
        return res.status(400).json({ error: 'ticketKey and insight or insightId are required.' });
    }

    const result = await updateJiraFromInsight({ ticketKey, insight: resolvedInsight, dryRun });
    res.json(result);
});

router.post('/ast/index', async (req, res) => {
    const rootPath = path.resolve(req.body.rootPath || process.cwd());
    const repoName = req.body.repoName || path.basename(rootPath);
    const filePaths = req.body.filePaths || [];

    const digests = await persistAstDigest({ repoName, rootPath, filePaths });
    res.json({ repoName, indexedFiles: digests.length, digests });
});

router.post('/diff/chunk', async (req, res) => {
    const chunks = await chunkDiffForLlm(req.body.diff || '', {
        repoRoot: req.body.repoRoot,
        maxChars: req.body.maxChars
    });
    const findings = scanDiffChunks({
        chunks,
        prId: req.body.prId || 'adhoc',
        repoName: req.body.repoName || 'unknown'
    });

    res.json({ chunks, findings });
});

router.post('/debt/snapshot', (req, res) => {
    const prediction = recordDebtSnapshot(req.body);
    res.status(201).json(prediction);
});

router.get('/debt/hotspots', (req, res) => {
    res.json(getDebtHotspots({ repoName: req.query.repoName, limit: Number(req.query.limit || 20) }));
});

router.post('/memory/remember', async (req, res) => {
    const result = await rememberPrInsight(req.body);
    res.status(201).json(result);
});

router.post('/memory/search', async (req, res) => {
    const results = await searchSimilarPrs({
        query: req.body.query || '',
        repoName: req.body.repoName,
        limit: Number(req.body.limit || 5)
    });
    res.json(results);
});

export default router;
