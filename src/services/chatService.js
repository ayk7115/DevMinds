import Groq from 'groq-sdk';
import db from '../config/db.js';

const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';

const isUsableSecret = (value) => {
    if (!value || typeof value !== 'string') return false;
    const trimmed = value.trim();
    return trimmed.length > 12 && !/^your_|replace_|changeme/i.test(trimmed);
};

const getGroqApiKey = () => process.env.GROQ_API_KEY?.trim();
const getGroqModel = () => process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;

const getGroqClient = () => {
    const apiKey = getGroqApiKey();

    if (!isUsableSecret(apiKey)) {
        const error = new Error('GROQ_API_KEY is missing or still set to a placeholder.');
        error.code = 'GROQ_NOT_CONFIGURED';
        throw error;
    }

    return new Groq({ apiKey });
};

export const getChatStatus = () => ({
    configured: isUsableSecret(getGroqApiKey()),
    model: getGroqModel(),
    privacy: 'Only sanitized PR metadata from SQLite is sent to Groq. Raw source code is not sent.'
});

const loadHistoryContext = () => {
    try {
        const rows = db.prepare(`
            SELECT title, author, repo_name, readiness_score, summary,
                   architectural_impact, security_risks, created_at
            FROM insights
            ORDER BY created_at DESC
            LIMIT 20
        `).all();

        if (rows.length === 0) {
            return 'No PR history is available yet.';
        }

        return rows.map((row, index) => {
            const isScan = row.author === 'Repo X-Ray';
            const typeLabel = isScan ? 'Repo Scan' : 'PR';
            return `${typeLabel} ${index + 1}: "${row.title}" by ${row.author} in ${row.repo_name}
- Score: ${row.readiness_score}/100
- Summary: ${row.summary}
- Architecture Impact: ${row.architectural_impact}
- Security: ${row.security_risks}
- Date: ${row.created_at}`;
        }).join('\n\n');
    } catch (error) {
        console.error('[ChatService] Failed to load history:', error);
        return 'PR history could not be loaded from SQLite.';
    }
};

/**
 * Chat Service (Tier 2 Intelligence)
 * Uses Groq for fast chat queries against sanitized PR metadata.
 * Raw code never leaves the local machine through this path.
 */
export const chat = async (userMessage) => {
    const groq = getGroqClient();
    const model = getGroqModel();
    const historyContext = loadHistoryContext();

    const systemPrompt = `You are DevMind AI, the chat layer inside a local-first PR intelligence platform.
You help developers, managers, and stakeholders understand pull request health, delivery risk, and repository activity.
You also have access to recent Repository Architecture Scans. When a user asks about a repository, refer to the most recent Repo Scan in your history.

Privacy rule:
- You may use only sanitized metadata (PRs and Repo Scans) from SQLite.
- You must not claim to inspect raw source code unless that source code appears in the provided context.
- If the user asks for code-level details that are not available, say the local analyzer must run first.

Available history (PRs and Repo Scans):
${historyContext}

Answer clearly and practically. Prefer short sections and concrete next steps.`;

    try {
        const completion = await groq.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.4,
            max_tokens: 900
        });

        return completion.choices[0]?.message?.content || 'I was unable to generate a response.';
    } catch (error) {
        error.code = error.code || 'GROQ_REQUEST_FAILED';
        console.error('[ChatService] Groq request failed:', error);
        throw error;
    }
};
