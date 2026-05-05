import { useEffect, useState, useCallback } from 'react';
import { FolderGit2, Loader, Package, Code, Search, GitBranch, AlertCircle, Maximize, Minimize } from 'lucide-react';
import { ReactFlow, Controls, Background, applyNodeChanges, applyEdgeChanges, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

// --- Dagre Layout Engine ---
const getLayoutedElements = (nodes, edges) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 20, marginy: 20 });

  nodes.forEach(node => {
    g.setNode(node.id, { width: 180, height: 50 });
  });
  edges.forEach(edge => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return {
    nodes: nodes.map(node => {
      const { x, y } = g.node(node.id);
      return { ...node, position: { x: x - 90, y: y - 25 } };
    }),
    edges
  };
};

export default function ArchitectureMapper() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [repoUrl, setRepoUrl] = useState('');
  const [error, setError] = useState('');
  const [repoName, setRepoName] = useState('DevMinds Project');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const applyLayout = (rawNodes, rawEdges) => {
    const { nodes: ln, edges: le } = getLayoutedElements(rawNodes, rawEdges);
    setNodes(ln);
    setEdges(le);
  };

  // Load self-analysis on mount
  useEffect(() => {
    fetch('http://localhost:3000/api/architecture')
      .then(res => res.json())
      .then(json => {
        setData(json);
        applyLayout(json.flowNodes || [], json.flowEdges || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const analyzeRepo = async () => {
    if (!repoUrl.trim()) return;
    if (!repoUrl.startsWith('https://github.com/')) {
      setError('Please enter a valid GitHub URL (https://github.com/...)');
      return;
    }
    setError('');
    setAnalyzing(true);

    try {
      const res = await fetch('http://localhost:3000/api/analyze-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Analysis failed');
      setData(json);
      setRepoName(json.repoName || repoUrl.split('/').slice(-1)[0]);
      applyLayout(json.flowNodes || [], json.flowEdges || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const onNodesChange = useCallback((changes) => setNodes(nds => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges(eds => applyEdgeChanges(changes, eds)), []);

  return (
    <div 
      className="architecture-mapper glass-panel" 
      style={{ 
        gridColumn: '1 / -1', 
        height: isFullscreen ? '100vh' : 'calc(100vh - 160px)', 
        display: 'flex', 
        flexDirection: 'column',
        ...(isFullscreen ? {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          borderRadius: 0,
          margin: 0
        } : {})
      }}
    >
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FolderGit2 size={22} />
          Repo X-Ray · <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{repoName}</span>
        </div>

        {/* Remote Repo Input */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, maxWidth: '500px', marginLeft: '2rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <GitBranch size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="repo-input"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && analyzeRepo()}
              disabled={analyzing}
            />
          </div>
          <button className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }} onClick={analyzeRepo} disabled={analyzing || !repoUrl}>
            {analyzing ? <Loader size={14} className="spin" /> : <Search size={14} />}
            {analyzing ? ' Analyzing...' : ' Analyze'}
          </button>
          <button 
            className="btn-ghost-small" 
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: 'var(--error)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {(loading || analyzing) ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          <Loader size={48} style={{ color: 'var(--accent-primary)', animation: 'spin 1.5s linear infinite' }} />
          <h3 style={{ color: 'var(--text-secondary)' }}>
            {analyzing ? `Cloning & Analyzing Repository...` : 'Scanning Architecture...'}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {analyzing ? 'This may take 30–60 seconds for larger repos.' : ''}
          </p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
          {/* Stats Row */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="detail-section" style={{ flex: 1 }}>
              <div className="detail-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Package size={14} /> Dependencies ({Object.keys(data?.dependencies || {}).length})
              </div>
              <div className="deps-list" style={{ marginTop: '0.5rem' }}>
                {Object.keys(data?.dependencies || {}).slice(0, 15).map(dep => (
                  <span key={dep} className="dep-badge">{dep}</span>
                ))}
              </div>
            </div>
            <div className="detail-section" style={{ minWidth: '200px' }}>
              <div className="detail-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Code size={14} /> Entry Points
              </div>
              <ul style={{ marginTop: '0.5rem', paddingLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {data?.coreFiles?.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          </div>

          {/* React Flow Graph */}
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              defaultEdgeOptions={{
                animated: true,
                style: { stroke: 'rgba(76,201,240,0.4)', strokeWidth: 1.5 },
                markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(76,201,240,0.4)' }
              }}
              fitView
              colorMode="dark"
            >
              <Background color="rgba(255,255,255,0.03)" gap={20} />
              <Controls style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)' }} />
            </ReactFlow>
          </div>
        </div>
      )}
    </div>
  );
}
