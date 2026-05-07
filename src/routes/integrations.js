import express from 'express';
import fs from 'fs';
import { getChatStatus } from '../services/chatService.js';
import { getTelegramStatus, sendTelegramTestMessage } from '../services/telegramService.js';
import { runtimeConfig } from '../config/runtimeConfig.js';

const router = express.Router();

router.get('/status', (req, res) => {
    res.status(200).json({
        groq: getChatStatus(),
        telegram: getTelegramStatus(),
        github: {
            hasWebhookSecret: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
            hasPersonalAccessToken: Boolean(process.env.GITHUB_PAT)
        },
        ollama: {
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
            embedModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'
        },
        localAi: {
            openclawPath: runtimeConfig.openclawPath,
            openclawExists: (runtimeConfig.openclawPath.startsWith('/') || runtimeConfig.openclawPath.startsWith('~')) 
                ? true // Assume true for remote/WSL paths to avoid blocking the UI, or we could use wsl test -f
                : fs.existsSync(runtimeConfig.openclawPath),
            model: runtimeConfig.localModel,
            runtimeDir: runtimeConfig.runtimeDir,
            databasePath: runtimeConfig.databasePath
        }
    });
});

router.post('/telegram/test', async (req, res) => {
    try {
        const status = getTelegramStatus();
        if (!status.configured) {
            return res.status(503).json({
                error: 'Telegram is not fully configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.',
                status
            });
        }

        const result = await sendTelegramTestMessage();
        if (!result?.ok) {
            return res.status(502).json({
                error: result?.description || result?.error?.message || 'Telegram test delivery failed.',
                result
            });
        }

        res.status(200).json({ ok: true, message: 'Telegram test message sent.' });
    } catch (error) {
        console.error('[IntegrationsRoute] Telegram test failed:', error);
        res.status(502).json({ error: error.message || 'Telegram test failed.' });
    }
});

export default router;
