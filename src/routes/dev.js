import express from 'express';
import { processPullRequest } from '../services/agentService.js';

const router = express.Router();

/**
 * POST /api/dev/mock-pr
 * Triggers a mock PR analysis flow for demo and onboarding purposes.
 */
router.post('/mock-pr', async (req, res) => {
    try {
        const io = req.app.get('io');
        const mockPrData = {
            id: 'demo-' + Date.now().toString().slice(-6),
            repo: 'demo-local-repo',
            author: 'demo-user',
            title: 'Refactor authentication module to use JWT',
            body: 'This PR replaces the old session-based authentication with a secure JWT implementation to support upcoming mobile clients.',
            sourceType: 'mock_pr',
            diff_url: 'https://raw.githubusercontent.com/expressjs/express/master/package.json' // Just a dummy safe URL for now to prevent fetch crashes
        };

        // We process it asynchronously so the endpoint returns immediately
        processPullRequest(mockPrData, io).catch(err => {
            console.error('[MockPR] Background analysis failed:', err);
        });

        res.status(202).json({ message: 'Demo PR analysis triggered.', prId: mockPrData.id });
    } catch (error) {
        console.error('[MockPR] Failed to trigger mock PR:', error);
        res.status(500).json({ error: 'Failed to trigger mock PR.' });
    }
});

export default router;
