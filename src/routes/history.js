import express from 'express';
import db from '../config/db.js';

const router = express.Router();

/**
 * GET /api/history
 * Returns all stored PR insights sorted by date descending.
 */
router.get('/', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, pr_id, repo_name, author, title, readiness_score, summary,
                   architectural_impact, security_risks, raw_output, created_at
            FROM insights
            ORDER BY created_at DESC
            LIMIT 50
        `).all();
        res.status(200).json(rows);
    } catch (error) {
        console.error('[HistoryRoute] Failed to load history:', error);
        res.status(500).json({ error: 'Failed to load history.' });
    }
});

export default router;
