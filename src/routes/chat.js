import express from 'express';
import { chat, getChatStatus } from '../services/chatService.js';

const router = express.Router();

router.get('/status', (req, res) => {
    res.status(200).json(getChatStatus());
});

/**
 * POST /api/chat
 * Body: { message: string }
 * Returns: { reply: string }
 */
router.post('/', async (req, res) => {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required.' });
    }
    if (message.length > 2000) {
        return res.status(413).json({ error: 'Message is too long. Please keep chat requests under 2,000 characters.' });
    }

    try {
        const reply = await chat(message.trim());
        res.status(200).json({ reply });
    } catch (error) {
        console.error('[ChatRoute] Groq chat error:', error);
        const status = error.code === 'GROQ_NOT_CONFIGURED' ? 503 : 502;
        res.status(status).json({
            error: error.message || 'Groq chat request failed.',
            code: error.code || 'GROQ_REQUEST_FAILED',
            model: getChatStatus().model
        });
    }
});

export default router;
