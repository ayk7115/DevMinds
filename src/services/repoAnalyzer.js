import fs from 'fs';
import path from 'path';

/**
 * Repo Analyzer Service
 * Performs static analysis of the repository to provide context to the agent.
 */

export const analyzeRepository = (rootPath) => {
    console.log(`[RepoAnalyzer] Starting analysis for: ${rootPath}`);

    const analysis = {
        structure: [],
        dependencies: {},
        coreFiles: [],
        summary: '',
        flowNodes: [],
        flowEdges: []
    };

    let nodeIdCounter = 0;

    // Helper to calculate positions for a hierarchical top-down layout
    const getPosition = (depth, siblingIndex, totalSiblings) => {
        const xOffset = 250;
        const yOffset = 150;
        const startX = -((totalSiblings - 1) * xOffset) / 2;
        return {
            x: startX + (siblingIndex * xOffset),
            y: depth * yOffset
        };
    };

    // 1. Recursive Directory Walk (ignoring node_modules, .git)
    const walk = (dir, depth = 0, parentId = null, siblingIndex = 0, totalSiblings = 1) => {
        if (depth > 3) return; // Limit depth for summary
        
        const files = fs.readdirSync(dir).filter(f => !['node_modules', '.git', 'dist', 'build', '.gemini', 'package-lock.json'].includes(f));
        
        files.forEach((file, idx) => {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            const isDir = stat.isDirectory();
            
            const nodeId = `node_${nodeIdCounter++}`;
            const position = getPosition(depth, idx, files.length);

            analysis.flowNodes.push({
                id: nodeId,
                position: position,
                data: { label: `${isDir ? '📁' : '📄'} ${file}` },
                style: { 
                    background: isDir ? 'rgba(76, 201, 240, 0.1)' : 'rgba(114, 9, 183, 0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '10px'
                }
            });

            if (parentId) {
                analysis.flowEdges.push({
                    id: `e_${parentId}-${nodeId}`,
                    source: parentId,
                    target: nodeId,
                    animated: true,
                    style: { stroke: 'rgba(255,255,255,0.2)' }
                });
            }

            if (isDir) {
                analysis.structure.push(`${'  '.repeat(depth)}📁 ${file}/`);
                walk(fullPath, depth + 1, nodeId, idx, files.length);
            } else {
                analysis.structure.push(`${'  '.repeat(depth)}📄 ${file}`);
                
                // Identify Core Files
                if (file === 'package.json') {
                    const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                    analysis.dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
                    analysis.coreFiles.push('package.json (Dependencies)');
                }
                if (file === 'index.js' || file === 'App.jsx' || file === 'main.jsx') {
                    analysis.coreFiles.push(`${file} (Entry Point)`);
                }
            }
        });
    };

    // Create root node
    const rootId = `node_${nodeIdCounter++}`;
    analysis.flowNodes.push({
        id: rootId,
        position: { x: 0, y: -100 },
        data: { label: '🚀 DevMinds Project Root' },
        style: { background: 'var(--accent-primary)', color: '#000', fontWeight: 'bold', padding: '10px', borderRadius: '8px' }
    });

    walk(rootPath, 0, rootId);

    // 2. Generate a textual summary for the LLM
    analysis.summary = `
# Repository Architecture Overview
- **Core Technology Stack**: ${Object.keys(analysis.dependencies).slice(0, 10).join(', ')}...
- **Entry Points**: ${analysis.coreFiles.join(', ')}
- **Project Structure**:
${analysis.structure.join('\n')}
    `.trim();

    return analysis;
};
