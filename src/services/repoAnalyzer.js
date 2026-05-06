import fs from 'fs';
import path from 'path';

const IGNORE_DIRS = new Set([
    '.git',
    '.gemini',
    'node_modules',
    'dist',
    'build',
    'coverage',
    'temp-repos',
    '.next',
    '.vite'
]);

const IGNORE_FILES = new Set([
    'package-lock.json',
    'devmind.db',
    'backend_out.log',
    'backend_err.log'
]);

const TEXT_EXTENSIONS = new Set([
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.json',
    '.md',
    '.css',
    '.html',
    '.py',
    '.java',
    '.cpp',
    '.c',
    '.h',
    '.yml',
    '.yaml',
    '.env',
    '.example'
]);

const LANGUAGE_BY_EXTENSION = {
    '.js': 'JavaScript',
    '.jsx': 'React JSX',
    '.ts': 'TypeScript',
    '.tsx': 'React TSX',
    '.css': 'CSS',
    '.html': 'HTML',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.py': 'Python',
    '.java': 'Java',
    '.cpp': 'C++',
    '.c': 'C',
    '.h': 'C/C++ Header',
    '.yml': 'YAML',
    '.yaml': 'YAML',
    '.sql': 'SQL'
};

const safeRead = (filePath) => {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
};

const relativePath = (rootPath, filePath) => path.relative(rootPath, filePath).replace(/\\/g, '/');

const shouldSkip = (name) => IGNORE_DIRS.has(name) || IGNORE_FILES.has(name);

const createNode = (id, label, type, details = {}) => ({
    id,
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label, type, details },
    style: {
        background: type === 'root' ? 'var(--accent-primary)' : 'rgba(16, 20, 32, 0.95)',
        border: type === 'risk' ? '1px solid rgba(239,68,68,0.55)' : '1px solid rgba(76,201,240,0.25)',
        color: type === 'root' ? '#000' : '#fff',
        borderRadius: '8px',
        padding: '10px',
        fontWeight: type === 'root' ? '700' : '500'
    }
});

const createEdge = (source, target, label = '') => ({
    id: `e_${source}_${target}`,
    source,
    target,
    label,
    animated: false,
    style: { stroke: 'rgba(76,201,240,0.35)' }
});

const collectFiles = (rootPath) => {
    const files = [];
    const directories = [];

    const walk = (dir, depth = 0) => {
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (shouldSkip(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);
            const rel = relativePath(rootPath, fullPath);

            if (entry.isDirectory()) {
                directories.push({ path: rel, depth });
                walk(fullPath, depth + 1);
                continue;
            }

            const ext = path.extname(entry.name).toLowerCase();
            const stat = fs.statSync(fullPath);
            files.push({
                path: rel,
                name: entry.name,
                ext,
                size: stat.size,
                depth,
                fullPath
            });
        }
    };

    walk(rootPath);
    return { files, directories };
};

const readPackageJson = (rootPath, file) => {
    try {
        const pkg = JSON.parse(safeRead(path.join(rootPath, file.path)));
        return {
            path: file.path,
            name: pkg.name || path.dirname(file.path) || 'root',
            scripts: pkg.scripts || {},
            dependencies: pkg.dependencies || {},
            devDependencies: pkg.devDependencies || {}
        };
    } catch {
        return null;
    }
};

const extractApiEndpoints = (content, filePath) => {
    const endpoints = [];
    const routeRegex = /\b(?:app|router)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = routeRegex.exec(content))) {
        endpoints.push({
            method: match[1].toUpperCase(),
            path: match[2],
            file: filePath
        });
    }

    return endpoints;
};

const extractImports = (content) => {
    const imports = [];
    const importRegex = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
    const requireRegex = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;

    while ((match = importRegex.exec(content))) imports.push(match[1]);
    while ((match = requireRegex.exec(content))) imports.push(match[1]);

    return imports;
};

const classifyFile = (file) => {
    const normalized = file.path.toLowerCase();
    if (normalized.includes('/routes/') || normalized.includes('\\routes\\')) return 'route';
    if (normalized.includes('/services/') || normalized.includes('\\services\\')) return 'service';
    if (normalized.includes('/components/') || normalized.includes('\\components\\')) return 'component';
    if (normalized.includes('/pages/') || normalized.includes('\\pages\\')) return 'page';
    if (normalized.includes('/config/') || normalized.includes('\\config\\')) return 'config';
    if (['index.js', 'main.jsx', 'app.jsx', 'server.js'].includes(file.name.toLowerCase())) return 'entry';
    if (file.name.toLowerCase().includes('test')) return 'test';
    return 'source';
};

const buildLogicalGraph = (analysis) => {
    const nodes = [
        createNode('repo', analysis.repoName, 'root', { summary: 'Repository root' })
    ];
    const edges = [];

    // Layer-based dynamic nodes
    if (analysis.moduleGroups.backend.length > 0) {
        nodes.push(createNode('backend', 'Backend Services', 'area', { count: analysis.moduleGroups.backend.length }));
        edges.push(createEdge('repo', 'backend', 'core'));
    }

    if (analysis.moduleGroups.frontend.length > 0) {
        nodes.push(createNode('frontend', 'Frontend Interface', 'area', { count: analysis.moduleGroups.frontend.length }));
        edges.push(createEdge('repo', 'frontend', 'ui'));
    }

    if (analysis.moduleGroups.routes.length > 0) {
        nodes.push(createNode('api', 'API Layer', 'service', { endpoints: analysis.apiEndpoints.length }));
        if (analysis.moduleGroups.backend.length > 0) {
            edges.push(createEdge('backend', 'api', 'exposes'));
        } else {
            edges.push(createEdge('repo', 'api', 'exposes'));
        }
    }

    if (analysis.databaseTables.length > 0) {
        nodes.push(createNode('database', 'Data Layer', 'data', { tables: analysis.databaseTables.length }));
        const parent = analysis.moduleGroups.backend.length > 0 ? 'backend' : 'repo';
        edges.push(createEdge(parent, 'database', 'persists'));
    }

    // Dynamic services based on module groups
    if (analysis.moduleGroups.services.length > 0) {
        nodes.push(createNode('business_logic', 'Business Logic', 'service', { modules: analysis.moduleGroups.services.length }));
        const parent = analysis.moduleGroups.backend.length > 0 ? 'backend' : 'repo';
        edges.push(createEdge(parent, 'business_logic', 'processes'));
    }

    // Map specific capabilities if detected
    if (analysis.capabilities.realtime) {
        nodes.push(createNode('realtime', 'Real-time Comms', 'integration', { type: 'WebSocket/Socket.io' }));
        const parent = analysis.moduleGroups.backend.length > 0 ? 'backend' : 'repo';
        edges.push(createEdge(parent, 'realtime', 'streams'));
    }

    if (analysis.risks.length > 0) {
        nodes.push(createNode('risks', 'Observed Gaps', 'risk', { count: analysis.risks.length }));
        edges.push(createEdge('repo', 'risks', 'vulnerabilities'));
    }

    return { nodes, edges };
};

export const analyzeRepository = (rootPath) => {
    const absoluteRoot = path.resolve(rootPath);
    const repoName = path.basename(absoluteRoot);
    console.log(`[RepoAnalyzer] Starting analysis for: ${absoluteRoot}`);

    const { files, directories } = collectFiles(absoluteRoot);
    const packageFiles = files.filter(file => file.name === 'package.json');
    const packageManifests = packageFiles.map(file => readPackageJson(absoluteRoot, file)).filter(Boolean);

    const dependencies = {};
    const dependencyGroups = {};
    for (const manifest of packageManifests) {
        const merged = { ...manifest.dependencies, ...manifest.devDependencies };
        dependencyGroups[manifest.path] = merged;
        Object.assign(dependencies, merged);
    }

    const languageStats = {};
    const moduleGroups = {
        backend: [],
        frontend: [],
        routes: [],
        services: [],
        components: [],
        pages: [],
        config: [],
        tests: []
    };
    const apiEndpoints = [];
    const imports = [];
    const entryPoints = [];
    const configFiles = [];
    const largestFiles = [];

    for (const file of files) {
        const language = LANGUAGE_BY_EXTENSION[file.ext] || 'Other';
        languageStats[language] = (languageStats[language] || 0) + 1;

        const lower = file.path.toLowerCase();
        if (lower.startsWith('src/')) moduleGroups.backend.push(file.path);
        if (lower.startsWith('frontend/src/')) moduleGroups.frontend.push(file.path);

        const classification = classifyFile(file);
        if (classification === 'route') moduleGroups.routes.push(file.path);
        if (classification === 'service') moduleGroups.services.push(file.path);
        if (classification === 'component') moduleGroups.components.push(file.path);
        if (classification === 'page') moduleGroups.pages.push(file.path);
        if (classification === 'config') moduleGroups.config.push(file.path);
        if (classification === 'test') moduleGroups.tests.push(file.path);
        if (classification === 'entry') entryPoints.push(file.path);
        if (/(\.env\.example|vite\.config|eslint\.config|package\.json|\.gitignore)$/i.test(file.path)) configFiles.push(file.path);

        largestFiles.push({ path: file.path, size: file.size });

        if (TEXT_EXTENSIONS.has(file.ext) && file.size < 300000) {
            const content = safeRead(file.fullPath);
            apiEndpoints.push(...extractApiEndpoints(content, file.path));
            for (const imported of extractImports(content)) {
                imports.push({ from: file.path, import: imported });
            }
        }
    }

    largestFiles.sort((a, b) => b.size - a.size);

    const databaseTables = [];
    const dbFile = files.find(file => file.path === 'src/config/db.js');
    if (dbFile) {
        const dbContent = safeRead(dbFile.fullPath);
        const tableRegex = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)/g;
        let match;
        while ((match = tableRegex.exec(dbContent))) databaseTables.push(match[1]);
    }

    const integrations = {
        groq: Object.keys(dependencies).some(d => d.includes('groq')),
        telegram: Object.keys(dependencies).some(d => d.includes('telegram')),
        github: Object.keys(dependencies).some(d => d.includes('github') || d.includes('octokit')),
        ollama: Object.keys(dependencies).some(d => d.includes('ollama')),
        jira: Object.keys(dependencies).some(d => d.includes('jira'))
    };

    const capabilities = {
        realtime: Object.keys(dependencies).some(d => d.includes('socket.io') || d.includes('ws')) || files.some(file => file.path.includes('socket')),
        repoIngestion: files.some(file => file.path.includes('clone') || file.path.includes('git')),
        webhookProcessing: files.some(file => file.path.includes('webhook')),
        chat: Object.keys(dependencies).some(d => d.includes('ai') || d.includes('llm') || d.includes('openai') || d.includes('groq')),
        database: Object.keys(dependencies).some(d => d.includes('sql') || d.includes('mongo') || d.includes('db') || d.includes('orm'))
    };

    const risks = [];
    if (moduleGroups.tests.length === 0) risks.push('No automated test suite was detected.');
    if (apiEndpoints.length === 0 && moduleGroups.routes.length === 0) risks.push('No API endpoints or routes were detected.');
    if (packageManifests.length > 1 && !files.some(file => file.name.includes('workspace'))) {
        risks.push('Multiple package.json files exist without a workspace manifest.');
    }
    if (Object.keys(dependencies).length > 50 && moduleGroups.services.length < 5) {
        risks.push('High dependency count with low modularity (lack of services).');
    }

    const structure = directories
        .filter(dir => dir.depth <= 2)
        .slice(0, 120)
        .map(dir => `${'  '.repeat(dir.depth)}${dir.path}/`);

    const analysis = {
        repoName,
        rootPath: absoluteRoot,
        generatedAt: new Date().toISOString(),
        metrics: {
            files: files.length,
            directories: directories.length,
            packageManifests: packageManifests.length,
            apiEndpoints: apiEndpoints.length,
            dependencies: Object.keys(dependencies).length,
            databaseTables: databaseTables.length
        },
        dependencies,
        dependencyGroups,
        packageManifests,
        languageStats,
        entryPoints,
        coreFiles: entryPoints.map(file => `${file} (entry point)`),
        configFiles,
        apiEndpoints,
        databaseTables,
        moduleGroups,
        imports: imports.slice(0, 250),
        largestFiles: largestFiles.slice(0, 10),
        integrations,
        capabilities,
        risks,
        structure,
        summary: ''
    };

    const graph = buildLogicalGraph(analysis);
    analysis.flowNodes = graph.nodes;
    analysis.flowEdges = graph.edges;
    analysis.summary = `Repository: ${repoName}
Files: ${analysis.metrics.files}
Directories: ${analysis.metrics.directories}
Languages: ${Object.entries(languageStats).map(([name, count]) => `${name} ${count}`).join(', ')}
Entry points: ${entryPoints.join(', ') || 'None detected'}
API endpoints: ${apiEndpoints.map(endpoint => `${endpoint.method} ${endpoint.path}`).join(', ') || 'None detected'}
Database tables: ${databaseTables.join(', ') || 'None detected'}
Frontend components: ${moduleGroups.components.length}
Backend services: ${moduleGroups.services.length}
Detected risks: ${risks.join('; ') || 'No major structural gaps detected.'}`;

    return analysis;
};
