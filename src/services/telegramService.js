/**
 * Telegram Service
 * Handles delivery of PR insights and weekly digests to stakeholders.
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_MESSAGE_LIMIT = 4096;

const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
};

export const escapeTelegramHtml = (value = '') => {
    return String(value ?? '').replace(/[&<>]/g, char => HTML_ESCAPE_MAP[char]);
};

const truncateMessage = (text) => {
    const value = String(text ?? '');
    if (value.length <= TELEGRAM_MESSAGE_LIMIT) return value;
    return `${value.slice(0, TELEGRAM_MESSAGE_LIMIT - 32)}\n\n[message truncated]`;
};

const htmlToPlainText = (html) => {
    return String(html ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<a\b[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
};

/**
 * Sends a message to the configured Telegram chat.
 * Callers can pass parseMode: 'HTML' only after escaping dynamic values.
 */
export const sendTelegramMessage = async (text, options = {}) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn('[TelegramService] Missing credentials. Skipping message delivery.');
        return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: TELEGRAM_CHAT_ID,
        text: truncateMessage(text),
        disable_web_page_preview: options.disableWebPagePreview ?? true
    };

    if (options.parseMode) {
        payload.parse_mode = options.parseMode;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('[TelegramService] Telegram API error:', data.description);

            if (options.parseMode && /parse entities|entity/i.test(data.description || '')) {
                const retryResponse = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: truncateMessage(htmlToPlainText(text)),
                        disable_web_page_preview: true
                    })
                });
                const retryData = await retryResponse.json();

                if (!retryData.ok) {
                    console.error('[TelegramService] Plain-text retry failed:', retryData.description);
                } else {
                    console.log('[TelegramService] Message sent successfully as plain text fallback.');
                }

                return retryData;
            }
        } else {
            console.log('[TelegramService] Message sent successfully.');
        }

        return data;
    } catch (error) {
        console.error('[TelegramService] Network error:', error);
        return { ok: false, error };
    }
};

/**
 * Formats a PR insight for Telegram delivery (Business View).
 */
export const formatPRMessage = (insight, prData) => {
    const title = escapeTelegramHtml(prData.title);
    const author = escapeTelegramHtml(prData.author);
    const repo = escapeTelegramHtml(prData.repo);
    const readinessScore = escapeTelegramHtml(insight.readinessScore ?? 'N/A');
    const architecturalImpact = escapeTelegramHtml(insight.architecturalImpact || 'Unknown');
    const securityRisks = escapeTelegramHtml(insight.securityRisks || 'Unknown');
    const summary = escapeTelegramHtml(insight.stakeholder_summary || insight.summary || 'Summary not provided');
    const diffUrl = escapeTelegramHtml(prData.diff_url || '');

    return `
<b>New PR Insight:</b> ${title}
<b>Author:</b> ${author}
<b>Repo:</b> ${repo}

<b>Readiness Score:</b> ${readinessScore}/100
<b>Arch Impact:</b> ${architecturalImpact}
<b>Security Risk:</b> ${securityRisks}

<b>Summary:</b>
${summary}

${diffUrl ? `<a href="${diffUrl}">View PR Diff</a>` : 'PR diff link unavailable'}
    `.trim();
};
