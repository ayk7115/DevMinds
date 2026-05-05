import fs from 'fs';
import path from 'path';
import db from '../../config/db.js';

const LANGUAGE_PACKAGES = {
    '.cpp': { name: 'cpp', pkg: 'tree-sitter-cpp' },
    '.cc': { name: 'cpp', pkg: 'tree-sitter-cpp' },
    '.cxx': { name: 'cpp', pkg: 'tree-sitter-cpp' },
    '.hpp': { name: 'cpp', pkg: 'tree-sitter-cpp' },
    '.h': { name: 'cpp', pkg: 'tree-sitter-cpp' },
    '.java': { name: 'java', pkg: 'tree-sitter-java' },
    '.py': { name: 'python', pkg: 'tree-sitter-python' }
};

const SYMBOL_TYPES = new Set([
    'class_declaration',
    'class_definition',
    'function_definition',
    'method_declaration',
    'constructor_declaration',
    'interface_declaration'
]);

let parserModuleCache;
const languageCache = new Map();

const optionalImport = async (pkg) => {
    try {
        return await import(pkg);
    } catch {
        return null;
    }
};

const getParser = async (ext) => {
    const config = LANGUAGE_PACKAGES[ext];
    if (!config) return null;

    parserModuleCache ||= await optionalImport('tree-sitter');
    if (!parserModuleCache) return null;

    if (!languageCache.has(config.pkg)) {
        const languageModule = await optionalImport(config.pkg);
        languageCache.set(config.pkg, languageModule?.default || languageModule || null);
    }

    const Language = languageCache.get(config.pkg);
    if (!Language) return null;

    const Parser = parserModuleCache.default || parserModuleCache;
    const parser = new Parser();
    parser.setLanguage(Language);
    return { parser, language: config.name };
};

const nodeText = (source, node) => source.slice(node.startIndex, node.endIndex);

const findName = (source, node) => {
    const direct = node.childForFieldName?.('name');
    if (direct) return nodeText(source, direct);

    for (let i = 0; i < node.namedChildCount; i += 1) {
        const child = node.namedChild(i);
        if (child.type === 'identifier' || child.type === 'type_identifier') {
            return nodeText(source, child);
        }
        const nested = child.childForFieldName?.('declarator')?.childForFieldName?.('declarator');
        if (nested) return nodeText(source, nested);
    }

    return '<anonymous>';
};

const estimateComplexity = (source, node) => {
    const text = nodeText(source, node);
    const branches = text.match(/\b(if|else if|for|while|case|catch|except|elif)\b|\?|&&|\|\|/g);
    return 1 + (branches?.length || 0);
};

const fallbackSymbols = (source, language) => {
    const lines = source.split(/\r?\n/);
    return lines.flatMap((line, index) => {
        const match = line.match(/^\s*(class|def|function|public|private|protected|static|void|int|String|boolean|auto)\s+([A-Za-z_][\w]*)/);
        if (!match) return [];
        return [{
            name: match[2],
            type: match[1] === 'class' ? 'class' : 'function',
            language,
            startLine: index + 1,
            endLine: index + 1,
            complexity: 1
        }];
    });
};

export const parseSourceFile = async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const config = LANGUAGE_PACKAGES[ext];
    if (!config || !fs.existsSync(filePath)) return null;

    const source = fs.readFileSync(filePath, 'utf-8');
    const parserConfig = await getParser(ext);
    if (!parserConfig) {
        return {
            filePath,
            language: config.name,
            parser: 'fallback-regex',
            symbols: fallbackSymbols(source, config.name)
        };
    }

    const tree = parserConfig.parser.parse(source);
    const symbols = [];
    const visit = (node) => {
        if (SYMBOL_TYPES.has(node.type)) {
            symbols.push({
                name: findName(source, node),
                type: node.type,
                language: parserConfig.language,
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                complexity: estimateComplexity(source, node)
            });
        }
        for (let i = 0; i < node.namedChildCount; i += 1) visit(node.namedChild(i));
    };

    visit(tree.rootNode);
    return { filePath, language: parserConfig.language, parser: 'tree-sitter', symbols };
};

export const persistAstDigest = async ({ repoName, rootPath, filePaths }) => {
    const insert = db.prepare(`
        INSERT INTO ast_symbols
            (repo_name, file_path, language, symbol_name, symbol_type, start_line, end_line, complexity_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repo_name, file_path, symbol_name, start_line)
        DO UPDATE SET
            end_line = excluded.end_line,
            complexity_score = excluded.complexity_score,
            updated_at = CURRENT_TIMESTAMP
    `);

    const results = [];
    for (const filePath of filePaths) {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(rootPath, filePath);
        const digest = await parseSourceFile(absolutePath);
        if (!digest) continue;

        const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, '/');
        for (const symbol of digest.symbols) {
            insert.run(
                repoName,
                relativePath,
                digest.language,
                symbol.name,
                symbol.type,
                symbol.startLine,
                symbol.endLine,
                symbol.complexity
            );
        }
        results.push({ ...digest, filePath: relativePath });
    }

    return results;
};

export const findSymbolForLine = (repoName, filePath, line) => db.prepare(`
    SELECT symbol_name, symbol_type, start_line, end_line, complexity_score
    FROM ast_symbols
    WHERE repo_name = ? AND file_path = ? AND start_line <= ? AND end_line >= ?
    ORDER BY (end_line - start_line) ASC
    LIMIT 1
`).get(repoName, filePath.replace(/\\/g, '/'), line, line);
