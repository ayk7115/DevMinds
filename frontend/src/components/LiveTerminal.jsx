import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

export default function LiveTerminal({ logs }) {
  const terminalEndRef = useRef(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div className="glass-panel" style={{ gridColumn: '1 / 2' }}>
      <div className="panel-header">
        <Terminal size={20} />
        Sovereign Execution Stream
      </div>
      
      <div className="terminal-container">
        {logs.length === 0 ? (
          <div className="terminal-line" style={{ opacity: 0.5 }}>
            Waiting for GitHub Webhook events...
            <span className="cursor"></span>
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`terminal-line ${log.type}`}>
              {log.type === 'status' && <span style={{ color: '#a0aab2' }}>[{new Date().toLocaleTimeString()}] </span>}
              {log.text}
              {/* Add blinking cursor to the very last line if it's streaming */}
              {index === logs.length - 1 && log.type === 'stream' && (
                <span className="cursor"></span>
              )}
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}
