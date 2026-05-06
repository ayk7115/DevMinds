import 'dotenv/config';

/**
 * Telegram Service
 * Handles notification delivery and formatting.
 */

export const getTelegramStatus = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    return {
        configured: Boolean(token && chatId),
        hasToken: Boolean(token),
        hasChatId: Boolean(chatId)
    };
};

export const sendTelegramMessage = async (text, options = {}) => {
    const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn('[TelegramService] Delivery skipped: Not configured.');
        return { ok: false, error: 'Not configured' };
    }

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text,
                parse_mode: options.parseMode || 'HTML',
                ...options
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.description || 'Telegram API Error');
        return data;
    } catch (error) {
        console.error('[TelegramService] Failed to send message:', error.message);
        return { ok: false, error: error.message };
    }
};

export const sendTelegramTestMessage = async () => {
    const testMsg = `🛠️ <b>DevMind Integration Test</b>\nYour Telegram alerts are now active. You will receive PR insights here.`;
    return sendTelegramMessage(testMsg);
};

export const formatPRMessage = (insight, prData) => {
    const scoreEmoji = insight.readinessScore >= 80 ? '✅' : insight.readinessScore >= 50 ? '⚠️' : '❌';
    const impactEmoji = insight.architecturalImpact === 'High' || insight.architecturalImpact === 'Critical' ? '🏗️' : '🔹';
    
    return `
${scoreEmoji} <b>DevMind PR Analysis: #${prData.id}</b>
<b>Title:</b> ${prData.title}
<b>Author:</b> @${prData.author}

<b>Deployment Readiness:</b> ${insight.readinessScore}/100
<b>Architectural Impact:</b> ${impactEmoji} ${insight.architecturalImpact}
<b>Security Risks:</b> ${insight.securityRisks === 'None' ? '🛡️ None' : '⚠️ ' + insight.securityRisks}

<b>Summary:</b>
${insight.stakeholder_summary || insight.summary || 'No summary provided.'}

<a href="${prData.html_url || '#'}">View Pull Request</a>
    `.trim();
};
