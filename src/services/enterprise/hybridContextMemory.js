import db from '../../config/db.js';

const DEFAULT_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

const toBuffer = (embedding) => Buffer.from(new Float32Array(embedding).buffer);
const fromBuffer = (buffer) => Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT));

const cosineSimilarity = (a, b) => {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const embedText = async (text, model = DEFAULT_EMBED_MODEL) => {
    const payload = { model, prompt: text.slice(0, 12000) };
    let response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input: payload.prompt })
        });
    }

    if (!response.ok) throw new Error(`Ollama embedding failed: ${response.status}`);
    const json = await response.json();
    return json.embedding || json.embeddings?.[0] || [];
};

export const rememberPrInsight = async ({ prId, repoName, ticketKey, title, summary, metadata = {} }) => {
    const text = [title, summary, metadata.architecturalImpact, metadata.securityRisks].filter(Boolean).join('\n');
    const embedding = await embedText(text);

    db.prepare(`
        INSERT INTO pr_vectors
            (pr_id, repo_name, ticket_key, title, summary, embedding_model, embedding_dims, embedding, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        String(prId),
        repoName,
        ticketKey || null,
        title || '',
        summary || '',
        DEFAULT_EMBED_MODEL,
        embedding.length,
        toBuffer(embedding),
        JSON.stringify(metadata)
    );

    return { prId, embeddingDims: embedding.length };
};

export const searchSimilarPrs = async ({ query, repoName, limit = 5 }) => {
    const queryEmbedding = await embedText(query);
    const rows = db.prepare(`
        SELECT pr_id, repo_name, ticket_key, title, summary, embedding_model,
               embedding_dims, embedding, metadata_json, created_at
        FROM pr_vectors
        WHERE (? IS NULL OR repo_name = ?)
        ORDER BY created_at DESC
        LIMIT 400
    `).all(repoName || null, repoName || null);

    return rows
        .map(row => ({
            prId: row.pr_id,
            repoName: row.repo_name,
            ticketKey: row.ticket_key,
            title: row.title,
            summary: row.summary,
            metadata: JSON.parse(row.metadata_json || '{}'),
            createdAt: row.created_at,
            similarity: cosineSimilarity(queryEmbedding, fromBuffer(row.embedding))
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
};
