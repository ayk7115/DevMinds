import { useEffect, useState } from 'react';
import { socket } from '../services/socket';
import LiveTerminal from '../components/LiveTerminal';
import InsightCard from '../components/InsightCard';
import ArchitectureMapper from '../components/ArchitectureMapper';
import ChatBot from '../components/ChatBot';
import PRTimeline from '../components/PRTimeline';
import { Activity, LayoutDashboard, Database, MessageSquare, Clock, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DASHBOARD_SESSION_KEY = 'devmind.dashboard.session.v1';
const MAX_PERSISTED_LOGS = 300;

const loadDashboardSession = () => {
  try {
    return JSON.parse(localStorage.getItem(DASHBOARD_SESSION_KEY) || '{}');
  } catch {
    return {};
  }
};

const parseRawOutput = (rawOutput) => {
  if (!rawOutput) return {};
  try {
    return JSON.parse(rawOutput);
  } catch {
    return { raw: rawOutput };
  }
};

const historyRowToInsight = (row) => {
  const rawOutput = parseRawOutput(row.raw_output);

  return {
    id: row.id,
    prId: row.pr_id,
    readinessScore: row.readiness_score,
    stakeholder_summary: row.summary,
    summary: row.summary,
    engineer_changelog: rawOutput.changelog || `PR: ${row.title}\nAuthor: ${row.author}\nRepo: ${row.repo_name}\nArchitectural Impact: ${row.architectural_impact}\nSecurity Risks: ${row.security_risks}`,
    architecturalImpact: row.architectural_impact,
    securityRisks: row.security_risks,
    readinessScoreBreakdown: rawOutput.breakdown || [],
    rawOutput: rawOutput.raw || row.raw_output || row.summary
  };
};

function DashboardPage() {
  const persistedSession = loadDashboardSession();
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [logs, setLogs] = useState(() => persistedSession.logs || []);
  const [insights, setInsights] = useState(() => persistedSession.insights || null);
  const [activeTab, setActiveTab] = useState(() => persistedSession.activeTab || 'changelog');
  const [isChatOpen, setIsChatOpen] = useState(() => persistedSession.isChatOpen || false);
  const [currentRepo, setCurrentRepo] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem(DASHBOARD_SESSION_KEY, JSON.stringify({
      logs: logs.slice(-MAX_PERSISTED_LOGS),
      insights,
      activeTab,
      isChatOpen,
      currentRepo,
      savedAt: new Date().toISOString()
    }));
  }, [logs, insights, activeTab, isChatOpen, currentRepo]);

  useEffect(() => {
    if (insights) return;

    fetch('http://localhost:3000/api/history')
      .then(response => response.ok ? response.json() : [])
      .then(rows => {
        if (Array.isArray(rows) && rows.length > 0) {
          setInsights(historyRowToInsight(rows[0]));
          if (!currentRepo) setCurrentRepo(rows[0].repo_name);
        }
      })
      .catch(() => {});
  }, [insights]);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('agent:status', (data) => {
      setLogs(prev => [...prev, { type: 'status', text: `>> ${data.message}` }]);
      if (data.status === 'initializing') setInsights(null);
    });

    socket.on('agent:stream', (data) => {
      setLogs(prev => {
        const newLogs = [...prev];
        const lastLog = newLogs[newLogs.length - 1];
        if (lastLog && lastLog.type === 'stream') {
          lastLog.text += data.chunk;
          return [...newLogs];
        } else {
          return [...newLogs, { type: 'stream', text: data.chunk }];
        }
      });
    });

    socket.on('agent:complete', (data) => {
      setLogs(prev => [...prev, { type: 'status', text: `>> Analysis Complete for PR #${data.prId}` }]);
      setInsights(data.insights);
      if (data.insights.repo_name) setCurrentRepo(data.insights.repo_name);
    });

    socket.on('agent:error', (data) => {
      setLogs(prev => [...prev, { type: 'error', text: `>> ERROR: ${data.message}` }]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('agent:status');
      socket.off('agent:stream');
      socket.off('agent:complete');
      socket.off('agent:error');
    };
  }, []);

  const tabs = [
    { id: 'changelog', icon: <LayoutDashboard size={16} />, label: 'Live ChangeLog' },
    { id: 'architecture', icon: <Database size={16} />, label: 'Repo X-Ray' },
    { id: 'history', icon: <Clock size={16} />, label: 'PR Timeline' },
  ];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="btn-ghost-small" onClick={() => navigate('/')} title="Back to Home">
            <ArrowLeft size={16} />
          </button>
          <div className="header-title">
            <Activity size={28} color="var(--accent-primary)" />
            DevMind Strategic Dashboard
          </div>
          {currentRepo && (
            <div className="repo-badge" style={{ background: 'rgba(76,201,240,0.1)', color: 'var(--accent-primary)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(76,201,240,0.2)' }}>
              Active Repo: {currentRepo}
            </div>
          )}
        </div>

        <div className="nav-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            className={`tab-btn ${isChatOpen ? 'active' : ''}`}
            style={{ background: isChatOpen ? 'var(--accent-secondary)' : 'rgba(255,255,255,0.05)' }}
            onClick={() => setIsChatOpen(o => !o)}
          >
            <MessageSquare size={16} /> AI Chat
          </button>
          <div className="connection-badge">
            <div className={`indicator ${isConnected ? 'connected' : ''}`}></div>
            {isConnected ? 'Core Online' : 'Core Offline'}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
          {activeTab === 'changelog' && (
            <main className="dashboard-grid">
              <LiveTerminal logs={logs} />
              <InsightCard insights={insights} />
            </main>
          )}
          {activeTab === 'architecture' && (
            <main className="architecture-grid">
              <ArchitectureMapper onRepoChange={setCurrentRepo} />
            </main>
          )}
          {activeTab === 'history' && (
            <main className="architecture-grid">
              <PRTimeline onSelectInsight={setInsights} filterRepo={currentRepo} />
            </main>
          )}
        </div>

        {/* Chatbot Side Panel */}
        {isChatOpen && (
          <div style={{ width: '380px', flexShrink: 0 }}>
            <ChatBot />
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
