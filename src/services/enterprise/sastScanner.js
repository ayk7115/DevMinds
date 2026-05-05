import db from '../../config/db.js';

const RULES = [
    {
        id: 'cpp.unchecked-buffer-copy',
        language: ['cpp', 'c'],
        severity: 'high',
        pattern: /\b(strcpy|strcat|sprintf|gets|memcpy)\s*\(/,
        message: 'Unchecked buffer operation can overflow or corrupt memory.'
    },
    {
        id: 'cpp.overlapping-block-copy',
        language: ['cpp', 'c'],
        severity: 'medium',
        pattern: /\bmemcpy\s*\([^,]+,\s*[^,]+,\s*[^)]+\)/,
        message: 'memcpy is unsafe when source and destination memory blocks overlap; prefer memmove when overlap is possible.'
    },
    {
        id: 'java.unsafe-deserialization',
        language: ['java'],
        severity: 'high',
        pattern: /\bObjectInputStream\s*\(|\.readObject\s*\(/,
        message: 'Unsafe Java deserialization can lead to remote code execution.'
    },
    {
        id: 'python.shell-injection',
        language: ['python'],
        severity: 'high',
        pattern: /\b(subprocess|os\.system|popen)\b.*shell\s*=\s*True/,
        message: 'Shell execution with shell=True can allow command injection.'
    },
    {
        id: 'generic.secret-literal',
        language: ['*'],
        severity: 'medium',
        pattern: /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{12,}/i,
        message: 'Possible hard-coded credential detected.'
    }
];

const languageForPath = (filePath) => {
    if (/\.(cpp|cc|cxx|hpp|h)$/.test(filePath)) return 'cpp';
    if (/\.java$/.test(filePath)) return 'java';
    if (/\.py$/.test(filePath)) return 'python';
    if (/\.(js|jsx|ts|tsx)$/.test(filePath)) return 'javascript';
    return 'unknown';
};

export const scanTextForVulnerabilities = ({ filePath, content, prId = null, repoName = null }) => {
    const language = languageForPath(filePath);
    const findings = [];

    content.split(/\r?\n/).forEach((line, index) => {
        for (const rule of RULES) {
            if (!rule.language.includes('*') && !rule.language.includes(language)) continue;
            if (!rule.pattern.test(line)) continue;
            findings.push({
                prId,
                repoName,
                filePath,
                line: index + 1,
                severity: rule.severity,
                ruleId: rule.id,
                message: rule.message,
                evidence: line.trim().slice(0, 240)
            });
        }
    });

    return findings;
};

export const persistSastFindings = (findings) => {
    const stmt = db.prepare(`
        INSERT INTO sast_findings
            (pr_id, repo_name, file_path, line, severity, rule_id, message, evidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const finding of findings) {
        stmt.run(
            finding.prId,
            finding.repoName,
            finding.filePath,
            finding.line,
            finding.severity,
            finding.ruleId,
            finding.message,
            finding.evidence
        );
    }
};

export const scanDiffChunks = ({ chunks, prId, repoName }) => {
    const findings = chunks.flatMap(chunk =>
        scanTextForVulnerabilities({
            filePath: chunk.filePath,
            content: chunk.content,
            prId,
            repoName
        })
    );

    persistSastFindings(findings);
    return findings;
};
