import fs from 'fs';
import path from 'path';
import { parseSourceFile } from './treeSitterParser.js';

const BOILERPLATE_PATTERNS = [
    /^\s*import\s+/,
    /^\s*from\s+.*\s+import\s+/,
    /^\s*package\s+/,
    /^\s*#include\s+/,
    /^\s*\/\/\s*generated/i,
    /^\s*\/\*\s*generated/i,
    /^\s*[\]}),;]*\s*$/
];

const estimateTokens = (text) => Math.ceil(text.length / 4);

const scoreLine = (line) => {
    const normalized = line.replace(/^[+-]/, '').trim();
    if (!normalized) return 0;
    if (BOILERPLATE_PATTERNS.some(pattern => pattern.test(normalized))) return 0.1;
    if (/\b(auth|token|password|secret|buffer|malloc|memcpy|strcpy|sql|exec|permission)\b/i.test(normalized)) return 3;
    if (/\b(if|for|while|switch|catch|except|return|throw|await|async|transaction)\b/.test(normalized)) return 2;
    return 1;
};

export const parseUnifiedDiff = (diffText) => {
    const files = [];
    let currentFile = null;
    let currentHunk = null;

    for (const line of diffText.split(/\r?\n/)) {
        if (line.startsWith('diff --git ')) {
            currentFile = { filePath: '', hunks: [] };
            files.push(currentFile);
            currentHunk = null;
            continue;
        }

        if (currentFile && line.startsWith('+++ b/')) {
            currentFile.filePath = line.slice(6);
            continue;
        }

        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@(.*)$/);
        if (currentFile && hunkMatch) {
            currentHunk = {
                startLine: Number(hunkMatch[1]),
                length: Number(hunkMatch[2] || 1),
                header: hunkMatch[3].trim(),
                lines: []
            };
            currentFile.hunks.push(currentHunk);
            continue;
        }

        if (currentHunk) currentHunk.lines.push(line);
    }

    return files.filter(file => file.filePath);
};

const symbolDigestForFile = async (repoRoot, filePath) => {
    if (!repoRoot) return null;
    const absolutePath = path.join(repoRoot, filePath);
    if (!fs.existsSync(absolutePath)) return null;
    return parseSourceFile(absolutePath);
};

const symbolForHunk = (digest, hunkStart) => {
    if (!digest?.symbols?.length) return null;
    return digest.symbols
        .filter(symbol => symbol.startLine <= hunkStart && symbol.endLine >= hunkStart)
        .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0] || null;
};

export const chunkDiffForLlm = async (diffText, options = {}) => {
    const {
        repoRoot,
        maxChars = 4600,
        minPriority = 0.4
    } = options;

    const chunks = [];
    const files = parseUnifiedDiff(diffText);

    for (const file of files) {
        const digest = await symbolDigestForFile(repoRoot, file.filePath);

        for (const hunk of file.hunks) {
            const symbol = symbolForHunk(digest, hunk.startLine);
            const importantLines = hunk.lines.filter(line => scoreLine(line) >= minPriority);
            const rawContent = [`File: ${file.filePath}`, symbol ? `Symbol: ${symbol.name}` : null, hunk.header, ...importantLines]
                .filter(Boolean)
                .join('\n');

            for (let offset = 0; offset < rawContent.length; offset += maxChars) {
                const content = rawContent.slice(offset, offset + maxChars);
                const priority = importantLines.reduce((sum, line) => sum + scoreLine(line), 0) / Math.max(importantLines.length, 1);
                chunks.push({
                    filePath: file.filePath,
                    symbolName: symbol?.name || null,
                    chunkType: symbol ? 'ast-symbol-hunk' : 'diff-hunk',
                    priorityScore: Number(priority.toFixed(2)),
                    tokenEstimate: estimateTokens(content),
                    content
                });
            }
        }
    }

    return chunks.sort((a, b) => b.priorityScore - a.priorityScore);
};
