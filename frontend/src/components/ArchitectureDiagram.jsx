/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Database, GitBranch, Loader, Maximize, Network, RefreshCw, Shield } from 'lucide-react';
import { ReactFlow, Controls, Background, MiniMap, applyNodeChanges, applyEdgeChanges, MarkerType } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';

const layoutGraph = (nodes, edges) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 110, marginx: 40, marginy: 40 });

  nodes.forEach((node) => g.setNode(node.id, { width: 210, height: 64 }));
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const point = g.node(node.id);
      return { ...node, position: { x: point.x - 105, y: point.y - 32 } };
    }),
    edges
  };
};

const nodeColor = (node) => {
  const type = node?.data?.type || node?.type;
  if (type === 'root') return '#4cc9f0';
  if (type === 'risk') return '#ef4444';
  if (type === 'data') return '#10b981';
  if (type === 'integration') return '#f59e0b';
  if (type === 'page' || type === 'component') return '#a78bfa';
  return '#6b7280';
};

export default function ArchitectureDiagram({ analysis }) {
  const [data, setData] = useState(analysis || null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const loading = false;
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const loadArchitecture = useCallback(() => {
    setError('');
    if (!analysis) {
      setData(null);
      setNodes([]);
      setEdges([]);
      setSelectedNode(null);
      return;
    }
    const graph = layoutGraph(analysis.flowNodes || [], analysis.flowEdges || []);
    setData(analysis);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setSelectedNode(graph.nodes[0] || null);
  }, [analysis]);

  useEffect(() => {
    loadArchitecture();
  }, [loadArchitecture]);

  const onNodesChange = useCallback((changes) => setNodes((items) => applyNodeChanges(changes, items)), []);
  const onEdgesChange = useCallback((changes) => setEdges((items) => applyEdgeChanges(changes, items)), []);

  const layers = data?.architectureSummary?.layers || [];
  const severity = data?.securitySummary?.bySeverity || {};
  const metrics = data?.metrics || {};
  const graphStats = useMemo(() => [
    { label: 'Nodes', value: nodes.length, icon: <Network size={16} /> },
    { label: 'Edges', value: edges.length, icon: <GitBranch size={16} /> },
    { label: 'Files', value: metrics.files || 0, icon: <Boxes size={16} /> },
    { label: 'Tables', value: metrics.databaseTables || 0, icon: <Database size={16} /> },
  ], [edges.length, metrics.databaseTables, metrics.files, nodes.length]);

  return (
    <div className={`diagram-shell glass-panel ${isFullscreen ? 'fullscreen-panel' : ''}`}>
      <div className="panel-header diagram-header">
        <div className="panel-title-row">
          <Network size={22} />
          <div>
            <div>Architecture Diagram</div>
            <span>{data?.repoName || 'Repository'} system map</span>
          </div>
        </div>
        <div className="diagram-actions">
          <button className="btn-ghost-small" onClick={loadArchitecture} title="Refresh diagram" disabled={!analysis}>
            <RefreshCw size={16} />
          </button>
          <button className="btn-ghost-small" onClick={() => setIsFullscreen((value) => !value)} title="Toggle fullscreen">
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="inline-alert">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="center-state">
          <Loader size={44} className="spin" />
          <p>Drawing detailed repository architecture...</p>
        </div>
      ) : !data ? (
        <div className="center-state">
          <Network size={52} className="empty-icon" />
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>No repository selected</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '560px' }}>
              Paste a GitHub repository URL in Repo X-Ray first. This diagram will show only that scanned repository.
            </p>
          </div>
        </div>
      ) : (
        <div className="diagram-layout">
          <aside className="diagram-sidebar">
            <div className="metric-grid compact">
              {graphStats.map((item) => (
                <div className="metric-tile" key={item.label}>
                  <span>{item.icon}</span>
                  <strong>{item.value}</strong>
                  <small>{item.label}</small>
                </div>
              ))}
            </div>

            <section className="diagram-section">
              <h4>Layers</h4>
              <div className="pill-list">
                {layers.map((layer) => <span key={layer}>{layer}</span>)}
              </div>
            </section>

            <section className="diagram-section">
              <h4>Security Posture</h4>
              <div className="security-mini">
                <Shield size={16} />
                <span>{data?.securitySummary?.status || 'No scan data'}</span>
              </div>
              <div className="severity-row">
                <span>Critical {severity.critical || 0}</span>
                <span>High {severity.high || 0}</span>
                <span>Medium {severity.medium || 0}</span>
              </div>
            </section>

            <section className="diagram-section">
              <h4>Selected Node</h4>
              {selectedNode ? (
                <div className="node-details">
                  <strong>{selectedNode.data?.label}</strong>
                  <span>{selectedNode.data?.type || 'node'}</span>
                  <pre>{JSON.stringify(selectedNode.data?.details || {}, null, 2)}</pre>
                </div>
              ) : (
                <p className="muted-copy">Select a node to inspect its metadata.</p>
              )}
            </section>
          </aside>

          <main className="diagram-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => setSelectedNode(node)}
              defaultEdgeOptions={{
                animated: false,
                style: { stroke: 'rgba(76,201,240,0.45)', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(76,201,240,0.65)' }
              }}
              fitView
              colorMode="dark"
            >
              <Background color="rgba(255,255,255,0.05)" gap={22} />
              <Controls />
              <MiniMap nodeColor={nodeColor} pannable zoomable />
            </ReactFlow>
          </main>
        </div>
      )}
    </div>
  );
}
