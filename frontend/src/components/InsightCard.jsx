import { useState } from 'react';
import { Brain, ShieldAlert, Cpu, Briefcase, Code, Download } from 'lucide-react';

export default function InsightCard({ insights }) {
  const [persona, setPersona] = useState('business');

  const downloadReport = () => {
    if (!insights) return;
    const md = `# DevMind PR Analysis Report\n\n**Deployment Confidence Score:** ${insights.readinessScore}/100\n**Architectural Impact:** ${insights.architecturalImpact}\n**Security Risk:** ${insights.securityRisks}\n\n## Stakeholder Summary\n${insights.stakeholder_summary || insights.summary || 'N/A'}\n\n## Engineer Changelog\n${insights.engineer_changelog || 'N/A'}\n`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'devmind-report.md'; a.click();
    URL.revokeObjectURL(url);
  };

  if (!insights) {
    return (
      <div className="glass-panel" style={{ gridColumn: '2 / 3' }}>
        <div className="panel-header">
          <Brain size={20} />
          Architectural Insights
        </div>
        <div className="insight-content">
          <div className="empty-state">
            <Brain size={48} className="empty-icon" />
            <p>Awaiting PR analysis...</p>
          </div>
        </div>
      </div>
    );
  }

  // Determine score color class
  const getScoreClass = (score) => {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  };

  return (
    <div className="glass-panel" style={{ gridColumn: '2 / 3' }}>
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Brain size={20} />
          {persona === 'business' ? 'Business Value' : 'Technical Analysis'}
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={downloadReport} title="Download Report" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '0.3rem 0.6rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}>
            <Download size={12} /> Export
          </button>
        <div className="persona-toggle" style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '20px', padding: '0.2rem' }}>
          <button 
            onClick={() => setPersona('business')}
            style={{ 
              padding: '0.3rem 0.8rem', borderRadius: '15px', border: 'none', 
              background: persona === 'business' ? 'var(--accent-primary)' : 'transparent',
              color: persona === 'business' ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem'
            }}
          >
            <Briefcase size={14} /> Stakeholder
          </button>
          <button 
            onClick={() => setPersona('dev')}
            style={{ 
              padding: '0.3rem 0.8rem', borderRadius: '15px', border: 'none', 
              background: persona === 'dev' ? 'var(--accent-secondary)' : 'transparent',
              color: persona === 'dev' ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem'
            }}
          >
            <Code size={14} /> Engineer
          </button>
        </div>
        </div>
      </div>
      
      <div className="insight-content">
        
        {/* Readiness Score Widget (Visible in both) */}
        <div className="score-widget">
          <div>
            <div className="detail-title">Deployment Confidence</div>
            <div className="detail-text" style={{ fontSize: '1.5rem', fontWeight: 600, color: 'white' }}>
              Score
            </div>
          </div>
          <div className={`score-circle ${getScoreClass(insights.readinessScore)}`}>
            {insights.readinessScore}
          </div>
        </div>

        {persona === 'business' ? (
          /* Business Persona View */
          <>
            <div className="detail-section" style={{ borderLeftColor: 'var(--success)' }}>
              <div className="detail-title" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                Executive Summary
              </div>
              <div className="detail-text">{insights.stakeholder_summary || insights.summary || "Summary not generated."}</div>
            </div>
            <div className="detail-section">
              <div className="detail-title" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                Business Impact
              </div>
              <div className="detail-text">
                This change primarily impacts system {insights.architecturalImpact?.toLowerCase()}ly, 
                with {insights.securityRisks?.toLowerCase()} security implications for our end-users.
              </div>
            </div>
          </>
        ) : (
          /* Developer Persona View */
          <>
            <div className="detail-section" style={{ borderLeftColor: 'var(--accent-secondary)' }}>
              <div className="detail-title" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Code size={14} /> Engineer Changelog
              </div>
              <div className="detail-text" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>
                {insights.engineer_changelog || "No technical changelog provided."}
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-title" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Cpu size={14} /> Architectural Impact
              </div>
              <div className="detail-text">{insights.architecturalImpact}</div>
            </div>

            <div className="detail-section" style={{ borderLeftColor: 'var(--error)' }}>
              <div className="detail-title" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--error)' }}>
                <ShieldAlert size={14} /> Security Audit
              </div>
              <div className="detail-text">{insights.securityRisks}</div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

