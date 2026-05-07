/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle, GitBranch, Loader, Network, RefreshCw, Send, Shield, Sparkles, XCircle } from 'lucide-react';
import { apiUrl } from '../services/api';

const Capability = ({ icon, title, text, ready }) => (
  <section className="platform-capability">
    <div className="platform-capability-icon">{icon}</div>
    <div>
      <div className="platform-capability-title">
        <h3>{title}</h3>
        <span className={ready ? 'ready' : ''}>{ready ? 'Available' : 'Optional'}</span>
      </div>
      <p>{text}</p>
    </div>
  </section>
);

const MiniStatus = ({ label, ready }) => (
  <div className="platform-status-row">
    <span>{label}</span>
    <strong className={ready ? 'ready' : ''}>
      {ready ? <CheckCircle size={14} /> : <XCircle size={14} />}
      {ready ? 'Ready' : 'Not configured'}
    </strong>
  </div>
);

export default function IntegrationsPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/integrations/status'));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load platform status.');
      setStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const readiness = useMemo(() => {
    const checks = [
      true,
      Boolean(status?.localAi?.databasePath),
      Boolean(status?.github?.hasWebhookSecret || status?.github?.hasPersonalAccessToken),
      Boolean(status?.groq?.configured),
      Boolean(status?.localAi?.openclawExists),
      Boolean(status?.telegram?.configured),
    ];
    return { ready: checks.filter(Boolean).length, total: checks.length };
  }, [status]);

  return (
    <div className="glass-panel platform-overview-panel">
      <div className="panel-header platform-header">
        <div className="panel-title-row">
          <Shield size={22} />
          <div>
            <div>Platform Overview</div>
            <span>DevMind runtime, repo intelligence, and optional automation services</span>
          </div>
        </div>
        <button className="btn-ghost-small" onClick={loadStatus} disabled={loading} title="Refresh platform overview">
          {loading ? <Loader size={16} className="spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {error && (
        <div className="inline-alert">
          <XCircle size={16} /> {error}
        </div>
      )}

      {loading && !status ? (
        <div className="empty-state">
          <Loader size={42} className="spin" />
          <p>Loading platform overview...</p>
        </div>
      ) : (
        <div className="platform-overview">
          <section className="platform-hero">
            <div>
              <div className="platform-kicker">Local-first repository intelligence</div>
              <h2>Analyze a GitHub repo, map its architecture, inspect code, and review security signals.</h2>
              <p>
                This platform stays empty until you paste a repository into Repo X-Ray. After that, every diagram,
                code explanation, API list, and security finding reflects the selected repository only.
              </p>
            </div>
            <div className="platform-score">
              <strong>{readiness.ready}/{readiness.total}</strong>
              <span>platform services ready</span>
            </div>
          </section>

          <div className="platform-grid">
            <div className="platform-main">
              <Capability
                icon={<GitBranch size={20} />}
                title="Repo X-Ray"
                text="Clones the pasted GitHub repository, detects structure, dependencies, routes, risks, and integrations."
                ready
              />
              <Capability
                icon={<Network size={20} />}
                title="Architecture Diagram"
                text="Builds an interactive graph from detected layers, routes, services, pages, database tables, and imports."
                ready
              />
              <Capability
                icon={<Sparkles size={20} />}
                title="Code Explorer"
                text="Shows scanned repo files with a switch between source code and simplified English explanations."
                ready
              />
              <Capability
                icon={<Bot size={20} />}
                title="AI Chat"
                text="Uses saved scan and PR metadata for follow-up questions when Groq is configured."
                ready={Boolean(status?.groq?.configured)}
              />
              <Capability
                icon={<Send size={20} />}
                title="Alerts"
                text="Can send scan and PR summaries to Telegram when notification settings are configured."
                ready={Boolean(status?.telegram?.configured)}
              />
            </div>

            <aside className="platform-side">
              <h3>Runtime Status</h3>
              <MiniStatus label="Backend API" ready />
              <MiniStatus label="Local database" ready={Boolean(status?.localAi?.databasePath)} />
              <MiniStatus label="GitHub access" ready={Boolean(status?.github?.hasWebhookSecret || status?.github?.hasPersonalAccessToken)} />
              <MiniStatus label="Groq chat" ready={Boolean(status?.groq?.configured)} />
              <MiniStatus label="Local AI runner" ready={Boolean(status?.localAi?.openclawExists)} />
              <MiniStatus label="Telegram alerts" ready={Boolean(status?.telegram?.configured)} />
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

