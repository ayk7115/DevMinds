import 'dotenv/config';
import db from '../config/db.js';
import { chat } from './chatService.js';
import { analyzeRepository } from './repoAnalyzer.js';
import { sendTelegramMessage } from './telegramService.js';
import path from 'path';
import fs from 'fs';
import simpleGit from 'simple-git';

/**
 * Telegram Bot Controller
 * Implements interactive commands via Long Polling.
 */

let lastUpdateId = 0;
let isPolling = false;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const startTelegramBot = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.warn('[TelegramBot] Bot Token missing. Interactive commands disabled.');
        return;
    }

    console.log('[TelegramBot] Strategic Agent listener starting...');
    isPolling = true;
    pollUpdates();
};

export const stopTelegramBot = () => {
    isPolling = false;
};

const pollUpdates = async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    while (isPolling) {
        try {
            const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
            const data = await response.json();

            if (data.ok && data.result.length > 0) {
                for (const update of data.result) {
                    lastUpdateId = update.update_id;
                    if (update.message) {
                        await handleMessage(update.message);
                    }
                }
            }
        } catch (error) {
            console.error('[TelegramBot] Polling error:', error.message);
            await sleep(5000); // Wait before retry
        }
    }
};

const handleMessage = async (message) => {
    const chatId = message.chat.id;
    const text = message.text || '';
    const userId = message.from?.username || message.from?.first_name || 'User';

    console.log(`[TelegramBot] Command from @${userId}: ${text}`);

    if (text === '/start') {
        return sendTelegramMessage(`🚀 <b>DevMind Strategic Agent Active</b>\n\nWelcome @${userId}. I am your repository intelligence officer.\n\n<b>Available Commands:</b>\n/status - Latest project health report\n/chat [query] - Ask AI about project architecture\n/xray [github_url] - Trigger deep repo scan\n/digest - Weekly PR velocity summary`, { chat_id: chatId });
    }

    if (text === '/status') {
        try {
            const rows = db.prepare('SELECT * FROM insights ORDER BY created_at DESC LIMIT 3').all();
            if (rows.length === 0) {
                return sendTelegramMessage('📭 <b>Intelligence Archive is empty.</b>\nNo PRs or Repo Scans have been processed yet.', { chat_id: chatId });
            }

            let report = '📊 <b>Latest Strategic Insights</b>\n\n';
            rows.forEach(row => {
                const emoji = row.readiness_score >= 80 ? '✅' : '⚠️';
                report += `${emoji} <b>${row.title}</b>\nScore: ${row.readiness_score}/100\nImpact: ${row.architectural_impact}\n\n`;
            });
            return sendTelegramMessage(report, { chat_id: chatId });
        } catch (err) {
            return sendTelegramMessage('❌ Error accessing insights database.', { chat_id: chatId });
        }
    }

    if (text.startsWith('/chat ')) {
        const query = text.replace('/chat ', '').trim();
        if (!query) return sendTelegramMessage('Please provide a question after /chat', { chat_id: chatId });

        await sendTelegramMessage('🧠 <i>Thinking...</i>', { chat_id: chatId });
        try {
            const response = await chat(query);
            return sendTelegramMessage(`💡 <b>DevMind AI Response:</b>\n\n${response}`, { chat_id: chatId });
        } catch (err) {
            return sendTelegramMessage(`❌ AI Query failed: ${err.message}`, { chat_id: chatId });
        }
    }

    if (text.startsWith('/xray ')) {
        const repoUrl = text.replace('/xray ', '').trim();
        if (!repoUrl.startsWith('https://github.com/')) {
            return sendTelegramMessage('❌ Please provide a valid GitHub URL (https://github.com/owner/repo)', { chat_id: chatId });
        }

        await sendTelegramMessage(`🏗️ <b>Starting Remote Repo X-Ray...</b>\nTarget: ${repoUrl}\n\n<i>This may take 30-60 seconds.</i>`, { chat_id: chatId });

        // Logic borrowed from analyzeRepo.js for consistency
        const repoName = repoUrl.split('/').slice(-2).join('_').replace('.git', '');
        const tempPath = path.join(path.resolve(), 'temp-repos', `bot_${repoName}_${Date.now()}`);

        try {
            fs.mkdirSync(tempPath, { recursive: true });
            
            const git = simpleGit();
            await git.clone(repoUrl, tempPath, ['--depth', '1']);
            
            const analysis = analyzeRepository(tempPath);
            fs.rmSync(tempPath, { recursive: true, force: true });

            const score = Math.max(10, 100 - (analysis.risks.length * 15));
            const report = `
✅ <b>Repo X-Ray Complete</b>
<b>Repo:</b> ${repoUrl.split('/').pop()}
<b>Readiness Score:</b> ${score}/100

<b>Metrics:</b>
- Files: ${analysis.metrics.files}
- API Endpoints: ${analysis.metrics.apiEndpoints}
- Dependencies: ${analysis.metrics.dependencies}

<b>Structural Risks:</b>
${analysis.risks.length > 0 ? analysis.risks.map(r => `• ${r}`).join('\n') : 'No major gaps detected.'}
            `.trim();

            return sendTelegramMessage(report, { chat_id: chatId });
        } catch (err) {
            console.error('[TelegramBot] X-Ray failed:', err);
            return sendTelegramMessage(`❌ X-Ray Failed: ${err.message}`, { chat_id: chatId });
        }
    }

    if (text === '/digest') {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        const isoDate = lastWeek.toISOString();

        try {
            const rows = db.prepare('SELECT readiness_score FROM insights WHERE created_at > ?').all(isoDate);
            if (rows.length === 0) return sendTelegramMessage('📅 No activity recorded in the last 7 days.', { chat_id: chatId });

            const avgScore = Math.round(rows.reduce((sum, r) => sum + r.readiness_score, 0) / rows.length);
            const report = `
📈 <b>Weekly Velocity Digest</b>
<b>Total Actions:</b> ${rows.length}
<b>Avg Readiness Score:</b> ${avgScore}/100
<b>Project Trajectory:</b> ${avgScore >= 80 ? 'Stable 🟢' : avgScore >= 50 ? 'Needs Attention 🟡' : 'High Risk 🔴'}

Run /status for details on latest PRs.
            `.trim();
            return sendTelegramMessage(report, { chat_id: chatId });
        } catch (err) {
            return sendTelegramMessage('❌ Error generating digest.', { chat_id: chatId });
        }
    }

    // Default response for unhandled text if it looks like a command
    if (text.startsWith('/')) {
        return sendTelegramMessage('❓ Unknown command. Use /start to see available options.', { chat_id: chatId });
    }
};
