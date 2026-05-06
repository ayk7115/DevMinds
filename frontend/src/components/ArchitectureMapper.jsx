import { useEffect, useState, useCallback } from 'react';
import { FolderGit2, Loader, Package, Code, Search, GitBranch, AlertCircle, Maximize, Minimize, Server, BarChart3 } from 'lucide-react';
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

export default function ArchitectureMapper({ onRepoChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [repoUrl, setRepoUrl] = useState('');
  const [error, setError] = useState('');
  const [repoName, setRepoName] = useState('DevMinds Project');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('map'); // 'map', 'stack', 'files', 'api'

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
        if (json.repoName) onRepoChange?.(json.repoName);
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
      const name = json.repoName || repoUrl.split('/').slice(-1)[0];
      setRepoName(name);
      onRepoChange?.(name);
      applyLayout(json.flowNodes || [], json.flowEdges || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const onNodesChange = useCallback((changes) => setNodes(nds => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges(eds => applyEdgeChanges(changes, eds)), []);
  
  const metrics = data?.metrics || {};
  const languageEntries = Object.entries(data?.languageStats || {}).sort((a, b) => b[1] - a[1]);
  const endpoints = data?.apiEndpoints || [];
  const risks = data?.risks || [];
  const dependencies = data?.dependencies || {};
  const moduleGroups = data?.moduleGroups || {};

  const tabs = [
    { id: 'map', icon: <FolderGit2 size={16} />, label: 'Architecture Map' },
    { id: 'stack', icon: <Package size={16} />, label: 'Tech Stack' },
    { id: 'files', icon: <Code size={16} />, label: 'File Explanation' },
    { id: 'api', icon: <Server size={16} />, label: 'API Surface' },
  ];

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
      <div className="panel-header" style={{ justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FolderGit2 size={22} color="var(--accent-primary)" />
            <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Repo X-Ray</span>
          </div>
          
          <div className="inner-tabs" style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '10px' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 1rem', borderRadius: '8px', border: 'none',
                  background: activeTab === tab.id ? 'rgba(76,201,240,0.15)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: '0.85rem', fontWeight: activeTab === tab.id ? 600 : 400,
                  transition: 'all 0.2s ease'
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, maxWidth: '450px', marginLeft: '2rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <GitBranch size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="repo-input"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && analyzeRepo()}
              disabled={analyzing}
              style={{ paddingLeft: '2.25rem', height: '38px' }}
            />
          </div>
          <button className="btn-primary" style={{ padding: '0 1.25rem', height: '38px', fontSize: '0.85rem' }} onClick={analyzeRepo} disabled={analyzing || !repoUrl}>
            {analyzing ? <Loader size={14} className="spin" /> : <Search size={14} />}
            {analyzing ? ' Thinking...' : ' Analyze'}
          </button>
          <button 
            className="btn-ghost-small" 
            onClick={() => setIsFullscreen(!isFullscreen)}
            style={{ height: '38px', width: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ margin: '1rem 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: 'var(--error)', fontSize: '0.9rem' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {(loading || analyzing) ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
          <div className="scanner-animation">
             <Loader size={48} className="spin" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>
              {analyzing ? `Deep Scanning Repository...` : 'Mapping Architecture...'}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {analyzing ? `Analyzing ${repoName} patterns and dependencies.` : 'Parsing project structure and logical flows.'}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '1.5rem' }}>
          
          {/* Active View */}
          <div style={{ flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0 }}>
            
            {/* Main Content Area */}
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.25)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              
              {activeTab === 'map' && (
                <div style={{ flex: 1, position: 'relative' }}>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    defaultEdgeOptions={{
                      animated: true,
                      style: { stroke: 'rgba(76,201,240,0.5)', strokeWidth: 2 },
                      markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(76,201,240,0.5)' }
                    }}
                    fitView
                    colorMode="dark"
                  >
                    <Background color="rgba(255,255,255,0.03)" gap={20} />
                    <Controls style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </ReactFlow>
                  <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    Logical Flow Graph · Interactive
                  </div>
                </div>
              )}

              {activeTab === 'stack' && (
                <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <section>
                      <h4 style={{ color: 'var(--accent-primary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Code size={18} /> Languages & Frameworks
                      </h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        {languageEntries.map(([lang, count]) => (
                          <div key={lang} className="glass-panel" style={{ padding: '1rem 1.5rem', minWidth: '120px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{lang}</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>{count} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)' }}>files</span></div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h4 style={{ color: 'var(--accent-secondary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Package size={18} /> Core Dependencies
                      </h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {Object.keys(dependencies).slice(0, 40).map(dep => (
                          <span key={dep} className="dep-badge" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>{dep}</span>
                        ))}
                        {Object.keys(dependencies).length > 40 && (
                          <span className="dep-badge" style={{ opacity: 0.6 }}>+ {Object.keys(dependencies).length - 40} more</span>
                        )}
                      </div>
                    </section>

                    <section style={{ gridColumn: '1 / -1' }}>
                      <h4 style={{ color: 'var(--success)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Server size={18} /> System Integrations
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                        {Object.entries(data?.integrations || {}).map(([key, enabled]) => (
                          <div key={key} style={{ padding: '1rem', borderRadius: '12px', background: enabled ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${enabled ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ textTransform: 'capitalize', color: enabled ? 'white' : 'var(--text-muted)' }}>{key}</span>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: enabled ? 'var(--success)' : 'rgba(255,255,255,0.1)' }}></div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {activeTab === 'files' && (
                <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                  <h4 style={{ color: 'var(--accent-primary)', marginBottom: '1.5rem' }}>Project Directory Structure</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.4)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {data?.structure?.map((line, i) => (
                        <div key={i} style={{ whiteSpace: 'pre', color: line.includes('/') ? 'var(--accent-secondary)' : 'var(--text-secondary)' }}>
                          {line}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h5 style={{ color: 'white', marginBottom: '0.5rem' }}>Structural Overview</h5>
                      <div className="detail-section">
                        <div className="detail-title">Entry Points</div>
                        <div className="detail-text" style={{ fontSize: '0.85rem' }}>
                          {data?.entryPoints?.map(p => <div key={p} style={{ color: 'var(--accent-primary)' }}>{p}</div>) || 'None detected'}
                        </div>
                      </div>
                      <div className="detail-section">
                        <div className="detail-title">Module Distribution</div>
                        <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          <li><strong>Frontend:</strong> {moduleGroups.frontend?.length || 0} source files</li>
                          <li><strong>Backend:</strong> {moduleGroups.backend?.length || 0} source files</li>
                          <li><strong>Services:</strong> {moduleGroups.services?.length || 0} logic modules</li>
                          <li><strong>Components:</strong> {moduleGroups.components?.length || 0} UI elements</li>
                        </ul>
                      </div>
                      <div className="detail-section" style={{ borderLeftColor: 'var(--accent-secondary)' }}>
                        <div className="detail-title">Configuration</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                          {data?.configFiles?.map(f => <span key={f} className="dep-badge" style={{ fontSize: '0.75rem', borderColor: 'rgba(255,255,255,0.1)' }}>{f}</span>)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'api' && (
                <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                  <h4 style={{ color: 'var(--accent-secondary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Server size={18} /> REST API Surface Area
                  </h4>
                  {endpoints.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                      No Express/API endpoints detected in this repository.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                      {endpoints.map((endpoint, index) => (
                        <div key={index} className="xray-row" style={{ padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <span className={`xray-method method-${endpoint.method.toLowerCase()}`} style={{ minWidth: '70px', textAlign: 'center', fontWeight: 800 }}>
                            {endpoint.method}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: 'white', flex: 1 }}>{endpoint.path}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{endpoint.file}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Side Stats Bar */}
            <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  Quick Metrics
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>{metrics.files}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Files</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>{metrics.apiEndpoints}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>APIs</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>{metrics.dependencies}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Libs</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>{metrics.databaseTables}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tables</div>
                  </div>
                </div>
              </div>

              <div className="detail-section" style={{ borderLeftColor: risks.length ? 'var(--warning)' : 'var(--success)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="detail-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={14} /> Structural Gaps
                </div>
                {risks.length === 0 ? (
                  <div className="detail-text" style={{ fontSize: '0.85rem' }}>No major structural gaps detected.</div>
                ) : (
                  <ul className="xray-list" style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {risks.map((risk, index) => (
                      <li key={index} style={{ color: 'var(--warning)', fontSize: '0.8rem', display: 'flex', gap: '0.5rem' }}>
                        <span>•</span> {risk}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="glass-panel" style={{ padding: '1.25rem', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                  Largest Modules
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {data?.largestFiles?.slice(0, 8).map((file, idx) => (
                    <div key={idx} style={{ fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '0.5rem' }}>
                      <div style={{ color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path.split('/').pop()}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
