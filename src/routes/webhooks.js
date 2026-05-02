import express from 'express';
import crypto from 'crypto';
import { processPullRequest } from '../services/agentService.js';

const router = express.Router();

// A placeholder for your GitHub Webhook Secret
// In production, this MUST come from environment variables (e.g., process.env.GITHUB_WEBHOOK_SECRET)
const GITHUB_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'devmind_secret_placeholder';

/**
 * Middleware to verify GitHub Webhook Signatures
 * Security is a priority to prevent spoofed payloads triggering expensive local AI processing.
 */
const verifyGitHubSignature = (req, res, next) => {
    const signature = req.headers['x-hub-signature-256'];
    
    if (!signature) {
        console.warn('[Webhook] Missing signature in request headers.');
        return res.status(401).send('Signature missing');
    }

    if (!req.rawBody) {
        console.warn('[Webhook] Missing raw body for signature verification.');
        return res.status(500).send('Internal Server Error');
    }

    try {
        const hmac = crypto.createHmac('sha256', GITHUB_SECRET);
        const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');
        
        if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
            return next();
        } else {
            console.warn('[Webhook] Signature mismatch.');
            return res.status(401).send('Signature mismatch');
        }
    } catch (error) {
        console.error('[Webhook] Error verifying signature:', error);
        return res.status(500).send('Error verifying signature');
    }
};

/**
 * POST /api/webhooks/github
 * Ingests GitHub webhook events, verifies them, and passes PRs to the local AI.
 */
router.post('/github', verifyGitHubSignature, (req, res) => {
    const event = req.headers['x-github-event'];
    
    // We only care about pull request events
    if (event !== 'pull_request') {
        console.log(`[Webhook] Ignored event type: ${event}`);
        return res.status(200).send('Event ignored');
    }

    const { action, pull_request, repository } = req.body;

    // Only process specific actions (e.g., opened, synchronize for updates)
    if (['opened', 'synchronize', 'reopened'].includes(action)) {
        
        // Extract relevant details
        const prData = {
            id: pull_request.id,
            action: action,
            title: pull_request.title,
            body: pull_request.body,
            author: pull_request.user.login,
            diff_url: pull_request.diff_url,
            repo: repository.full_name,
            timestamp: new Date().toISOString()
        };

        console.log(`[Webhook] Processing PR #${pull_request.number} from ${prData.author}`);

        // Acknowledge the webhook immediately to prevent GitHub timeout
        res.status(202).send('Accepted for processing');

        // Pass the io instance to the service if needed (for real-time streaming)
        const io = req.app.get('io');

        // Asynchronously process the PR data via our Agent Service
        processPullRequest(prData, io).catch(err => {
            console.error(`[AgentService] Error processing PR:`, err);
        });

    } else {
        console.log(`[Webhook] Ignored PR action: ${action}`);
        res.status(200).send('Action ignored');
    }
});

export default router;
