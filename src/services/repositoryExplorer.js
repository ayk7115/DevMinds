import fs from 'fs';
import path from 'path';
import { analyzeRepository } from './repoAnalyzer.js';

const MAX_FILE_BYTES = 300000;

const normalizeRepoPath = (requestedPath = '') => requestedPath.replace(/\\/g, '/').replace(/^\/+/, '');

const resolveInsideRoot = (rootPath, requestedPath = '') => {
    const absoluteRoot = path.resolve(rootPath);
    const normalized = normalizeRepoPath(requestedPath);
    const resolved = path.resolve(absoluteRoot, normalized);

    if (resolved !== absoluteRoot && !resolved.startsWith(`${absoluteRoot}${path.sep}`)) {
        const error = new Error('Requested path is outside the repository.');
        error.status = 400;
        throw error;
    }

    return { absoluteRoot, normalized, resolved };
};

const languageFromPath = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        '.js': 'JavaScript',
        '.jsx': 'React JSX',
        '.ts': 'TypeScript',
        '.tsx': 'React TSX',
        '.css': 'CSS',
        '.html': 'HTML',
        '.json': 'JSON',
        '.md': 'Markdown',
        '.yml': 'YAML',
        '.yaml': 'YAML'
    };
    return map[ext] || 'Text';
};

export const getRepositoryOverview = (rootPath = process.cwd()) => analyzeRepository(rootPath);

export const getRepositoryFileList = (rootPath = process.cwd()) => {
    const analysis = analyzeRepository(rootPath);
    return {
        repoName: analysis.repoName,
        generatedAt: analysis.generatedAt,
        files: analysis.codeFiles,
        structure: analysis.structure,
        metrics: analysis.metrics
    };
};

export const readRepositoryFile = (rootPath = process.cwd(), requestedPath = '') => {
    const { normalized, resolved } = resolveInsideRoot(rootPath, requestedPath);
    const stat = fs.statSync(resolved);

    if (!stat.isFile()) {
        const error = new Error('Requested path is not a file.');
        error.status = 400;
        throw error;
    }

    if (stat.size > MAX_FILE_BYTES) {
        const error = new Error(`File is too large to display safely (${Math.round(stat.size / 1024)} KB).`);
        error.status = 413;
        throw error;
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    return {
        path: normalized,
        name: path.basename(normalized),
        language: languageFromPath(normalized),
        size: stat.size,
        lines: content.split(/\r?\n/).length,
        content
    };
};

export const explainRepositoryFile = (rootPath = process.cwd(), requestedPath = '') => {
    const file = readRepositoryFile(rootPath, requestedPath);
    const analysis = analyzeRepository(rootPath);
    const metadata = analysis.codeFiles.find(item => item.path === file.path);
    const imports = analysis.imports.filter(item => item.from === file.path).map(item => item.import);
    const endpoints = analysis.apiEndpoints.filter(endpoint => endpoint.file === file.path);
    const vulnerabilities = analysis.vulnerabilities.filter(finding => finding.filePath === file.path);

    const sections = [
        `${file.name} is a ${metadata?.role || 'source'} file in this repository.`,
        metadata?.explanation || 'It supports the application implementation.',
        imports.length > 0
            ? `It imports ${imports.slice(0, 8).join(', ')}${imports.length > 8 ? ', and more' : ''}.`
            : 'It has no static imports detected by the repository scanner.',
        endpoints.length > 0
            ? `It exposes API routes: ${endpoints.map(endpoint => `${endpoint.method} ${endpoint.path}`).join(', ')}.`
            : 'It does not expose Express routes directly.',
        vulnerabilities.length > 0
            ? `Security notes: ${vulnerabilities.map(finding => `${finding.severity} ${finding.id} on line ${finding.line}`).join('; ')}.`
            : 'No file-specific static security findings were detected.'
    ];

    return {
        path: file.path,
        language: file.language,
        lines: file.lines,
        explanation: sections.join('\n\n'),
        imports,
        endpoints,
        vulnerabilities
    };
};

