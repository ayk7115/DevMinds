import { useEffect, useState } from 'react';
import { socket } from './services/socket';
import LiveTerminal from './components/LiveTerminal';
import InsightCard from './components/InsightCard';
import { Activity } from 'lucide-react';

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [logs, setLogs] = useState([]);
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    // Connection Events
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // Agent Status Events (e.g., "Waking up the twin...")
    socket.on('agent:status', (data) => {
      setLogs(prev => [...prev, { type: 'status', text: `>> ${data.message}` }]);
      // Clear previous insights if a new PR starts
      if (data.status === 'initializing') {
        setInsights(null);
      }
    });

    // Agent Streaming Events (Live token output from OpenClaw)
    socket.on('agent:stream', (data) => {
      setLogs(prev => {
        // If the last log is a stream, append to it for a typing effect
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

    // Agent Completion Events (Final JSON payload)
    socket.on('agent:complete', (data) => {
      setLogs(prev => [...prev, { type: 'status', text: `>> Analysis Complete for PR #${data.prId}` }]);
      setInsights(data.insights);
    });

    // Agent Error Events
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

  return (
    <div className="app-container">
      {/* Header Area */}
      <header className="header">
        <div className="header-title">
          <Activity size={32} color="var(--accent-primary)" />
          DevMind Strategic Dashboard
        </div>
        
        <div className="connection-badge">
          <div className={`indicator ${isConnected ? 'connected' : ''}`}></div>
          {isConnected ? 'Core Online' : 'Core Offline'}
        </div>
      </header>

      {/* Main Grid */}
      <main className="dashboard-grid">
        <LiveTerminal logs={logs} />
        <InsightCard insights={insights} />
      </main>
    </div>
  );
}

export default App;
