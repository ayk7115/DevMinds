import { useEffect, useState } from 'react';
import { socket } from '../services/socket';
import LiveTerminal from '../components/LiveTerminal';
import InsightCard from '../components/InsightCard';
import ArchitectureMapper from '../components/ArchitectureMapper';
import ArchitectureDiagram from '../components/ArchitectureDiagram';
import CodeExplorer from '../components/CodeExplorer';
import ChatBot from '../components/ChatBot';
import PRTimeline from '../components/PRTimeline';
import IntegrationsPanel from '../components/IntegrationsPanel';
import { Activity, LayoutDashboard, Database, MessageSquare, Clock, ArrowLeft, Shield, Network, FileCode2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../services/api';

const DASHBOARD_SESSION_KEY = 'devmind.dashboard.session.v1';

const loadDashboardSession = () => {
  try {
    return JSON.parse(localStorage.getItem(DASHBOARD_SESSION_KEY) || '{}');
  } catch {
    return {};
  }
};

function DashboardPage() {
  const persistedSession = loadDashboardSession();
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isApiHealthy, setIsApiHealthy] = useState(false);
  const [logs, setLogs] = useState([]);
  const [insights, setInsights] = useState(null);
  const [activeTab, setActiveTab] = useState(() => persistedSession.activeTab || 'changelog');
  const [isChatOpen, setIsChatOpen] = useState(() => persistedSession.isChatOpen || false);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [currentRun, setCurrentRun] = useState(() => persistedSession.currentRun || null);
  const navigate = useNavigate();
  const coreOnline = isConnected || isApiHealthy;

  useEffect(() => {
    localStorage.setItem(DASHBOARD_SESSION_KEY, JSON.stringify({
      activeTab,
      isChatOpen,
      currentRun,
      savedAt: new Date().toISOString()
    }));
  }, [logs, activeTab, isChatOpen, currentRun]);

  useEffect(() => {
    let cancelled = false;

    const checkHealth = () => {
      fetch(apiUrl('/health'))
        .then(response => {
          if (!cancelled) setIsApiHealthy(Boolean(response?.ok));
        })
        .catch(() => {
          if (!cancelled) setIsApiHealthy(false);
        });
    };

    checkHealth();
    const id = setInterval(checkHealth, 8000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleRepoAnalysis = (analysis) => {
    setIsApiHealthy(true);
    setCurrentAnalysis(analysis);
    setCurrentRepo(analysis?.repoName || null);
    setInsights({
      readinessScore: Math.max(10, 100 - ((analysis?.risks?.length || 0) * 15)),
      stakeholder_summary: `Repository scan complete for ${analysis?.repoName || 'the selected repo'}.`,
      summary: `Repository scan complete for ${analysis?.repoName || 'the selected repo'}.`,
      engineer_changelog: analysis?.summary,
      architecturalImpact: `Detected ${(analysis?.architectureSummary?.layers || []).join(', ') || 'repository layers'}.`,
      securityRisks: analysis?.securitySummary?.status || 'Security scan complete.',
      vulnerabilities: analysis?.vulnerabilities || []
    });
    setLogs(prev => [...prev, { type: 'status', text: `>> Repo X-Ray loaded ${analysis?.repoName || 'repository'}` }]);
  };

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('agent:status', (data) => {
      if (data.runId) setCurrentRun({ id: data.runId, status: data.status || 'running', prId: data.prId });
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
      if (data.runId) setCurrentRun({ id: data.runId, status: 'complete', prId: data.prId });
      setLogs(prev => [...prev, { type: 'status', text: `>> Analysis Complete for PR #${data.prId}` }]);
      setInsights(data.insights);
      if (data.insights.repo_name) setCurrentRepo(data.insights.repo_name);
    });

    socket.on('agent:error', (data) => {
      if (data.runId) setCurrentRun({ id: data.runId, status: 'failed', prId: data.prId });
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
    { id: 'diagram', icon: <Network size={16} />, label: 'Architecture Diagram' },
    { id: 'code', icon: <FileCode2 size={16} />, label: 'Code Explorer' },
    { id: 'history', icon: <Clock size={16} />, label: 'PR Timeline' },
    { id: 'integrations', icon: <Shield size={16} />, label: 'Platform Overview' },
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
            Repository Intelligence Dashboard
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
            <div className={`indicator ${coreOnline ? 'connected' : ''}`}></div>
            {coreOnline ? 'Core Online' : 'Core Offline'}
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
              <ArchitectureMapper analysis={currentAnalysis} onAnalysisComplete={handleRepoAnalysis} />
            </main>
          )}
          {activeTab === 'diagram' && (
            <main className="architecture-grid">
              <ArchitectureDiagram analysis={currentAnalysis} />
            </main>
          )}
          {activeTab === 'code' && (
            <main className="architecture-grid">
              <CodeExplorer analysis={currentAnalysis} />
            </main>
          )}
          {activeTab === 'history' && (
            <main className="architecture-grid">
              <PRTimeline onSelectInsight={setInsights} filterRepo={currentRepo} />
            </main>
          )}
          {activeTab === 'integrations' && (
            <main className="architecture-grid">
              <IntegrationsPanel />
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
