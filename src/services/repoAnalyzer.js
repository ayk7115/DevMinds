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
    '.mjs',
    '.cjs',
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
    '.mjs': 'JavaScript',
    '.cjs': 'JavaScript',
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

const countLines = (content) => content ? content.split(/\r?\n/).length : 0;

const explainFileRole = (file, content = '') => {
    const classification = classifyFile(file);
    const imports = extractImports(content);
    const endpointCount = extractApiEndpoints(content, file.path).length;
    const hints = [];

    if (classification === 'entry') hints.push('starts the application or frontend bundle');
    if (classification === 'route') hints.push('defines HTTP API routes');
    if (classification === 'service') hints.push('contains reusable business logic or integrations');
    if (classification === 'component') hints.push('renders a reusable UI component');
    if (classification === 'page') hints.push('renders a navigable screen');
    if (classification === 'config') hints.push('configures runtime behavior');
    if (endpointCount > 0) hints.push(`exposes ${endpointCount} API endpoint${endpointCount === 1 ? '' : 's'}`);
    if (/socket\.io|io\(|emit\(/i.test(content)) hints.push('participates in real-time updates');
    if (/better-sqlite3|CREATE TABLE|SELECT |INSERT INTO/i.test(content)) hints.push('reads or writes local database state');
    if (/fetch\(|axios|Groq|telegram|simpleGit|clone\(/i.test(content)) hints.push('talks to an external or local integration');

    const role = hints.length > 0 ? hints.join(', ') : 'supports the repository implementation';
    const importsText = imports.length > 0
        ? ` It depends on ${imports.slice(0, 4).join(', ')}${imports.length > 4 ? ', and more' : ''}.`
        : '';

    return `${file.path} ${role}.${importsText}`;
};

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

        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
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

const scanSecurityVulnerabilities = (content, filePath) => {
    const findings = [];
    const rules = [
        {
            id: 'S001',
            pattern: new RegExp('\\b' + 'eval' + '\\('),
            severity: 'critical',
            category: 'Injection',
            message: 'Use of eval() detected. This can execute attacker-controlled code.',
            recommendation: 'Replace eval with a structured parser or a fixed dispatch table.'
        },
        {
            id: 'S002',
            pattern: /child_process|spawn\(|exec\(/,
            severity: 'high',
            category: 'Command Execution',
            message: 'Process execution detected. Inputs and working directories must be tightly controlled.',
            recommendation: 'Use argument arrays, fixed binaries, timeouts, and avoid shell interpolation.'
        },
        {
            id: 'S003',
            pattern: /http:\/\//,
            severity: 'medium',
            category: 'Transport',
            message: 'Plain HTTP detected.',
            recommendation: 'Use HTTPS for external network traffic unless the URL is a local development endpoint.'
        },
        {
            id: 'S004',
            pattern: /process\.env\.[A-Z0-9_]+/,
            severity: 'info',
            category: 'Secrets',
            message: 'Environment variable usage detected.',
            recommendation: 'Keep secrets out of logs, client bundles, and persisted analysis output.'
        },
        {
            id: 'S005',
            pattern: new RegExp('dangerously' + 'SetInnerHTML'),
            severity: 'high',
            category: 'XSS',
            message: 'React dangerouslySetInnerHTML detected.',
            recommendation: 'Sanitize HTML with a trusted sanitizer or render structured content instead.'
        },
        {
            id: 'S006',
            pattern: new RegExp('local' + 'Storage\\.(set|get)Item'),
            severity: 'medium',
            category: 'Client Storage',
            message: 'LocalStorage usage detected.',
            recommendation: 'Store only non-sensitive UI state in localStorage.'
        },
        {
            id: 'S007',
            pattern: /devmind_secret_placeholder|changeme|replace_me|your_[a-z0-9_]+/i,
            severity: 'high',
            category: 'Secrets',
            message: 'Placeholder or fallback secret detected.',
            recommendation: 'Fail closed when required production secrets are not configured.'
        },
        {
            id: 'S008',
            pattern: /fs\.rmSync\([^)]*recursive:\s*true/,
            severity: 'medium',
            category: 'Filesystem',
            message: 'Recursive deletion detected.',
            recommendation: 'Resolve and verify the target path stays inside the intended temp directory before deletion.'
        },
        {
            id: 'S009',
            pattern: /cors\(\s*\)|origin:\s*['"`]\*['"`]/,
            severity: 'medium',
            category: 'CORS',
            message: 'Broad CORS configuration detected.',
            recommendation: 'Restrict origins to explicit frontend URLs.'
        },
        {
            id: 'S010',
            pattern: /limit:\s*['"`](?:[1-9][0-9]+mb|[1-9][0-9]{2,}kb)['"`]/i,
            severity: 'medium',
            category: 'Availability',
            message: 'Large request body limit detected.',
            recommendation: 'Keep body limits as small as practical per route.'
        }
    ];

    const lines = content.split(/\r?\n/);
    for (const rule of rules) {
        for (let index = 0; index < lines.length; index += 1) {
            if (rule.pattern.test(lines[index])) {
                findings.push({
                    id: rule.id,
                    severity: rule.severity,
                    category: rule.category,
                    message: rule.message,
                    recommendation: rule.recommendation,
                    filePath,
                    line: index + 1
                });
                break;
            }
        }
    }
    return findings;
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

const resolveInternalImport = (fromPath, importPath, filePathSet) => {
    if (!importPath.startsWith('.')) return null;

    const baseDir = path.posix.dirname(fromPath);
    const normalizedBase = path.posix.normalize(path.posix.join(baseDir, importPath));
    const candidates = [
        normalizedBase,
        `${normalizedBase}.js`,
        `${normalizedBase}.jsx`,
        `${normalizedBase}.ts`,
        `${normalizedBase}.tsx`,
        `${normalizedBase}.json`,
        path.posix.join(normalizedBase, 'index.js'),
        path.posix.join(normalizedBase, 'index.jsx'),
        path.posix.join(normalizedBase, 'index.ts'),
        path.posix.join(normalizedBase, 'index.tsx')
    ];

    return candidates.find(candidate => filePathSet.has(candidate)) || null;
};

const summarizeSecurity = (vulnerabilities) => {
    const bySeverity = vulnerabilities.reduce((acc, finding) => {
        acc[finding.severity] = (acc[finding.severity] || 0) + 1;
        return acc;
    }, {});

    const criticalOrHigh = (bySeverity.critical || 0) + (bySeverity.high || 0);
    const status = criticalOrHigh > 0
        ? 'Needs attention before production use'
        : vulnerabilities.length > 0
            ? 'Low-to-medium findings require review'
            : 'No high-risk static patterns detected';

    return {
        status,
        total: vulnerabilities.length,
        bySeverity,
        topFindings: vulnerabilities
            .filter(finding => ['critical', 'high', 'medium'].includes(finding.severity))
            .slice(0, 8)
    };
};

const buildLogicalGraph = (analysis) => {
    const nodes = [
        createNode('repo', analysis.repoName, 'root', { summary: 'Repository root' })
    ];
    const edges = [];
    const seenEdges = new Set();
    const addEdge = (source, target, label = '') => {
        const key = `${source}:${target}:${label}`;
        if (seenEdges.has(key)) return;
        seenEdges.add(key);
        edges.push(createEdge(source, target, label));
    };
    const safeId = (value) => value.replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 80);

    // Layer-based dynamic nodes
    if (analysis.moduleGroups.backend.length > 0) {
        nodes.push(createNode('backend', 'Backend Services', 'area', { count: analysis.moduleGroups.backend.length }));
        addEdge('repo', 'backend', 'core');
    }

    if (analysis.moduleGroups.frontend.length > 0) {
        nodes.push(createNode('frontend', 'Frontend Interface', 'area', { count: analysis.moduleGroups.frontend.length }));
        addEdge('repo', 'frontend', 'ui');
    }

    if (analysis.moduleGroups.routes.length > 0) {
        nodes.push(createNode('api', 'API Layer', 'service', { endpoints: analysis.apiEndpoints.length }));
        if (analysis.moduleGroups.backend.length > 0) {
            addEdge('backend', 'api', 'exposes');
        } else {
            addEdge('repo', 'api', 'exposes');
        }

        for (const routePath of analysis.moduleGroups.routes.slice(0, 8)) {
            const id = `route_${safeId(routePath)}`;
            const endpoints = analysis.apiEndpoints.filter(endpoint => endpoint.file === routePath);
            nodes.push(createNode(id, path.basename(routePath), 'route', {
                path: routePath,
                endpoints: endpoints.map(endpoint => `${endpoint.method} ${endpoint.path}`)
            }));
            addEdge('api', id, 'route');
        }
    }

    if (analysis.databaseTables.length > 0) {
        nodes.push(createNode('database', 'Data Layer', 'data', { tables: analysis.databaseTables.length }));
        const parent = analysis.moduleGroups.backend.length > 0 ? 'backend' : 'repo';
        addEdge(parent, 'database', 'persists');
        for (const table of analysis.databaseTables.slice(0, 8)) {
            const id = `table_${safeId(table)}`;
            nodes.push(createNode(id, table, 'data', { table }));
            addEdge('database', id, 'table');
        }
    }

    // Dynamic services based on module groups
    if (analysis.moduleGroups.services.length > 0) {
        nodes.push(createNode('business_logic', 'Business Logic', 'service', { modules: analysis.moduleGroups.services.length }));
        const parent = analysis.moduleGroups.backend.length > 0 ? 'backend' : 'repo';
        addEdge(parent, 'business_logic', 'processes');

        for (const servicePath of analysis.moduleGroups.services.slice(0, 10)) {
            const id = `service_${safeId(servicePath)}`;
            nodes.push(createNode(id, path.basename(servicePath), 'service', { path: servicePath }));
            addEdge('business_logic', id, 'module');
        }
    }

    if (analysis.moduleGroups.pages.length > 0) {
        nodes.push(createNode('pages', 'Application Pages', 'area', { count: analysis.moduleGroups.pages.length }));
        addEdge('frontend', 'pages', 'screens');
        for (const pagePath of analysis.moduleGroups.pages.slice(0, 8)) {
            const id = `page_${safeId(pagePath)}`;
            nodes.push(createNode(id, path.basename(pagePath), 'page', { path: pagePath }));
            addEdge('pages', id, 'renders');
        }
    }

    if (analysis.moduleGroups.components.length > 0) {
        nodes.push(createNode('components', 'UI Components', 'area', { count: analysis.moduleGroups.components.length }));
        addEdge('frontend', 'components', 'uses');
        for (const componentPath of analysis.moduleGroups.components.slice(0, 10)) {
            const id = `component_${safeId(componentPath)}`;
            nodes.push(createNode(id, path.basename(componentPath), 'component', { path: componentPath }));
            addEdge('components', id, 'component');
        }
    }

    // Map specific capabilities if detected
    if (analysis.capabilities.realtime) {
        nodes.push(createNode('realtime', 'Real-time Comms', 'integration', { type: 'WebSocket/Socket.io' }));
        const parent = analysis.moduleGroups.backend.length > 0 ? 'backend' : 'repo';
        addEdge(parent, 'realtime', 'streams');
    }

    for (const [integration, enabled] of Object.entries(analysis.integrations)) {
        if (!enabled) continue;
        const id = `integration_${integration}`;
        nodes.push(createNode(id, `${integration[0].toUpperCase()}${integration.slice(1)} Integration`, 'integration', { integration }));
        const parent = nodes.some(node => node.id === 'business_logic') ? 'business_logic' : (nodes.some(node => node.id === 'backend') ? 'backend' : 'repo');
        addEdge(parent, id, 'connects');
    }

    for (const item of analysis.importGraph.slice(0, 40)) {
        const sourceId = `file_${safeId(item.from)}`;
        const targetId = `file_${safeId(item.to)}`;
        if (!nodes.some(node => node.id === sourceId)) {
            nodes.push(createNode(sourceId, path.basename(item.from), 'file', { path: item.from }));
        }
        if (!nodes.some(node => node.id === targetId)) {
            nodes.push(createNode(targetId, path.basename(item.to), 'file', { path: item.to }));
        }
        addEdge(sourceId, targetId, 'imports');
    }

    if (analysis.risks.length > 0 || analysis.vulnerabilities.length > 0) {
        const total = analysis.risks.length + analysis.vulnerabilities.length;
        nodes.push(createNode('risks', 'Observed Gaps & Vulnerabilities', 'risk', { count: total, vulnerabilities: analysis.vulnerabilities.length }));
        addEdge('repo', 'risks', 'security_findings');
    }

    return { nodes, edges };
};

export const analyzeRepository = (rootPath) => {
    const absoluteRoot = path.resolve(rootPath);
    const repoName = path.basename(absoluteRoot);
    console.log(`[RepoAnalyzer] Starting analysis for: ${absoluteRoot}`);

    const { files, directories } = collectFiles(absoluteRoot);
    const filePathSet = new Set(files.map(file => file.path));
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
    const vulnerabilities = [];
    const codeFiles = [];

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
            vulnerabilities.push(...scanSecurityVulnerabilities(content, file.path));
            for (const imported of extractImports(content)) {
                imports.push({ from: file.path, import: imported });
            }
            codeFiles.push({
                path: file.path,
                name: file.name,
                language,
                size: file.size,
                lines: countLines(content),
                role: classifyFile(file),
                explanation: explainFileRole(file, content)
            });
        }
    }

    largestFiles.sort((a, b) => b.size - a.size);
    codeFiles.sort((a, b) => a.path.localeCompare(b.path));
    const importGraph = imports
        .map(item => ({
            from: item.from,
            import: item.import,
            to: resolveInternalImport(item.from, item.import, filePathSet)
        }))
        .filter(item => item.to);

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
    if (vulnerabilities.some(finding => ['critical', 'high'].includes(finding.severity))) {
        risks.push('High-impact static security findings require review before production deployment.');
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
        importGraph: importGraph.slice(0, 120),
        codeFiles,
        largestFiles: largestFiles.slice(0, 10),
        integrations,
        capabilities,
        risks,
        vulnerabilities,
        securitySummary: summarizeSecurity(vulnerabilities),
        architectureSummary: {
            layers: [
                moduleGroups.frontend.length > 0 ? 'React/Vite frontend' : null,
                moduleGroups.backend.length > 0 ? 'Express/Node backend' : null,
                databaseTables.length > 0 ? 'SQLite persistence' : null,
                capabilities.realtime ? 'Socket.IO realtime channel' : null,
                integrations.groq ? 'Groq chat integration' : null,
                integrations.telegram ? 'Telegram notification integration' : null
            ].filter(Boolean),
            primaryFlows: [
                'Dashboard requests architecture and history data from the Express API.',
                'Socket.IO streams analysis status and completion events to the dashboard.',
                'Repo X-Ray clones or scans repositories, extracts routes/dependencies/files, and persists scan insights.',
                'Webhook events trigger PR analysis, diff chunking, lightweight SAST, local model execution, SQLite persistence, and optional Telegram delivery.'
            ],
            graphNodeCount: 0,
            graphEdgeCount: 0
        },
        structure,
        summary: ''
    };

    const graph = buildLogicalGraph(analysis);
    analysis.flowNodes = graph.nodes;
    analysis.flowEdges = graph.edges;
    analysis.architectureSummary.graphNodeCount = graph.nodes.length;
    analysis.architectureSummary.graphEdgeCount = graph.edges.length;
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
