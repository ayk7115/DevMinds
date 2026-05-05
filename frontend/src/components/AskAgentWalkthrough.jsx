import { useEffect, useState } from 'react';
import { Bot, Loader2, ShieldAlert } from 'lucide-react';
import { socket } from '../services/socket';

export default function AskAgentWalkthrough({ node }) {
  const [stream, setStream] = useState('');
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onStart = (payload) => {
      if (payload.nodeId !== node?.id) return;
      setLoading(true);
      setStream('');
      setFindings(payload.findings || []);
    };
    const onChunk = (payload) => {
      if (payload.nodeId !== node?.id) return;
      setStream(prev => prev + payload.chunk);
    };
    const onComplete = (payload) => {
      if (payload.nodeId !== node?.id) return;
      setLoading(false);
      setFindings(payload.findings || []);
    };
    const onError = (payload) => {
      if (payload.nodeId && payload.nodeId !== node?.id) return;
      setLoading(false);
      setStream(payload.message || 'DevMind could not explain this block.');
    };

    socket.on('agent:walkthrough:start', onStart);
    socket.on('agent:walkthrough:chunk', onChunk);
    socket.on('agent:walkthrough:complete', onComplete);
    socket.on('agent:walkthrough:error', onError);

    return () => {
      socket.off('agent:walkthrough:start', onStart);
      socket.off('agent:walkthrough:chunk', onChunk);
      socket.off('agent:walkthrough:complete', onComplete);
      socket.off('agent:walkthrough:error', onError);
    };
  }, [node?.id]);

  const ask = () => {
    if (!node) return;
    socket.emit('agent:walkthrough:ask', {
      nodeId: node.id,
      title: node.data?.label || 'Selected changelog node',
      filePath: node.data?.filePath || 'selection.diff',
      code: node.data?.code || node.data?.diff || node.data?.label || ''
    });
  };

  return (
    <section className="detail-section">
      <div className="detail-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <Bot size={16} /> Ask the Agent
        </span>
        <button className="btn-ghost-small" onClick={ask} disabled={!node || loading} title="Explain selected node">
          {loading ? <Loader2 size={16} className="spin" /> : <Bot size={16} />}
        </button>
      </div>

      {findings.length > 0 && (
        <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.75rem' }}>
          {findings.map(finding => (
            <div key={`${finding.ruleId}-${finding.line}`} style={{ display: 'flex', gap: '0.45rem', color: 'var(--error)', fontSize: '0.82rem' }}>
              <ShieldAlert size={14} /> {finding.message}
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        {stream || 'Select a changelog node and ask DevMind for a plain-English walkthrough.'}
      </p>
    </section>
  );
}
