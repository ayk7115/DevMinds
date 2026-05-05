import express from 'express';
import { chat } from '../services/chatService.js';

const router = express.Router();

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

    try {
        const reply = await chat(message.trim());
        res.status(200).json({ reply });
    } catch (error) {
        console.error('[ChatRoute] Groq chat error:', error);
        res.status(500).json({ error: `Chat service error: ${error.message}` });
    }
});

export default router;
