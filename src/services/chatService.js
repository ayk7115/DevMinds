import Groq from 'groq-sdk';
import db from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config(); // Force reload of .env to pick up new keys dynamically
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Chat Service (Tier 2 Intelligence)
 * Uses Groq LPU for lightning-fast chat queries against sanitized PR metadata.
 * NEVER sends raw code to Groq — only summaries and scores from SQLite.
 */
export const chat = async (userMessage) => {
    // Fetch last 20 PR summaries from SQLite — these are sanitized, no raw code
    let historyContext = 'No PR history available yet.';
    try {
        const rows = db.prepare(`
            SELECT title, author, repo_name, readiness_score, summary, architectural_impact, security_risks, created_at
            FROM insights ORDER BY created_at DESC LIMIT 20
        `).all();

        if (rows.length > 0) {
            historyContext = rows.map((r, i) =>
                `PR #${i + 1}: "${r.title}" by ${r.author} in ${r.repo_name}
  - Score: ${r.readiness_score}/100
  - Summary: ${r.summary}
  - Architecture Impact: ${r.architectural_impact}
  - Security: ${r.security_risks}
  - Date: ${r.created_at}`
            ).join('\n\n');
        }
    } catch (err) {
        console.error('[ChatService] Failed to load history:', err);
    }

    const systemPrompt = `You are DevMind AI, a strategic AI assistant built into the DevMind sovereign platform.
You help developers, managers, and stakeholders understand their codebase activity and PR health.
You have access to the following PR analysis history (sanitized metadata only — no raw code is shared):

--- PR HISTORY ---
${historyContext}
--- END HISTORY ---

Answer questions clearly, concisely, and professionally. 
If asked about code specifics you cannot see, explain that raw code stays on the local sovereign machine for privacy.
Always be helpful and constructive.`;

    const completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ],
        temperature: 0.6,
        max_tokens: 1024,
    });

    return completion.choices[0]?.message?.content || 'I was unable to generate a response.';
};
