import { useEffect, useState } from 'react';
import { Clock, CheckCircle, AlertTriangle, XCircle, GitPullRequest, FolderGit2 } from 'lucide-react';
import { socket } from '../services/socket';

const parseRawOutput = (rawOutput) => {
  if (!rawOutput) return {};
  try {
    return JSON.parse(rawOutput);
  } catch {
    return { raw: rawOutput };
  }
};

export default function PRTimeline({ onSelectInsight, filterRepo }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const fetchHistory = () => {
      const url = filterRepo 
        ? `http://localhost:3000/api/history?repo=${encodeURIComponent(filterRepo)}`
        : 'http://localhost:3000/api/history';
        
      fetch(url)
        .then(r => r.json())
        .then(data => { setHistory(data); setLoading(false); })
        .catch(() => setLoading(false));
    };

    fetchHistory();

    socket.on('agent:complete', fetchHistory);

    return () => {
      socket.off('agent:complete', fetchHistory);
    };
  }, [filterRepo]);

  const getScoreColor = (score) => {
    if (score >= 80) return 'var(--success)';
    if (score >= 50) return 'var(--warning)';
    return 'var(--error)';
  };

  const getScoreIcon = (score, isScan) => {
    if (isScan) return <FolderGit2 size={16} color="var(--accent-primary)" />;
    if (score >= 80) return <CheckCircle size={16} color="var(--success)" />;
    if (score >= 50) return <AlertTriangle size={16} color="var(--warning)" />;
    return <XCircle size={16} color="var(--error)" />;
  };

  const handleSelect = (row) => {
    const rawOutput = parseRawOutput(row.raw_output);

    setSelected(row.id);
    onSelectInsight?.({
      id: row.id,
      prId: row.pr_id,
      readinessScore: row.readiness_score,
      stakeholder_summary: row.summary,
      summary: row.summary,
      engineer_changelog: rawOutput.changelog || `PR: ${row.title}\nAuthor: ${row.author}\nRepo: ${row.repo_name}\nArchitectural Impact: ${row.architectural_impact}\nSecurity Risks: ${row.security_risks}`,
      architecturalImpact: row.architectural_impact,
      securityRisks: row.security_risks,
      rawOutput: rawOutput.raw || row.raw_output || row.summary
    });
  };

  if (loading) return (
    <div className="glass-panel" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
      <Clock size={40} style={{ color: 'var(--accent-primary)', opacity: 0.5 }} />
      <p style={{ color: 'var(--text-muted)' }}>Loading PR history...</p>
    </div>
  );

  return (
    <div className="glass-panel" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <Clock size={20} />
        Intelligence Archive · PR Timeline
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {history.length} records
        </span>
      </div>

      {history.length === 0 ? (
        <div className="empty-state">
          <GitPullRequest size={48} className="empty-icon" />
          <p>No PRs analyzed yet. Trigger a webhook to get started!</p>
        </div>
      ) : (
        <div className="timeline-list">
          {history.map((row) => (
            <div
              key={row.id}
              className={`timeline-item ${selected === row.id ? 'active' : ''}`}
              onClick={() => handleSelect(row)}
            >
              <div className="timeline-dot" style={{ background: getScoreColor(row.readiness_score) }} />
              <div className="timeline-content">
                <div className="timeline-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {getScoreIcon(row.readiness_score, row.author === 'Repo X-Ray')}
                    <span className="timeline-title">{row.title}</span>
                  </div>
                  <div className="timeline-score" style={{ color: getScoreColor(row.readiness_score) }}>
                    {row.readiness_score}/100
                  </div>
                </div>
                <div className="timeline-meta">
                  <span>@{row.author}</span>
                  <span>·</span>
                  <span>{row.repo_name}</span>
                  <span>·</span>
                  <span>{new Date(row.created_at).toLocaleDateString()}</span>
                </div>
                <p className="timeline-summary">{row.summary}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
