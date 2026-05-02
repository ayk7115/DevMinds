import { Brain, ShieldAlert, Cpu } from 'lucide-react';

export default function InsightCard({ insights }) {
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
      <div className="panel-header">
        <Brain size={20} />
        Architectural Insights
      </div>
      
      <div className="insight-content">
        
        {/* Readiness Score Widget */}
        <div className="score-widget">
          <div>
            <div className="detail-title">Deployment Readiness</div>
            <div className="detail-text" style={{ fontSize: '1.5rem', fontWeight: 600, color: 'white' }}>
              Score
            </div>
          </div>
          <div className={`score-circle ${getScoreClass(insights.readinessScore)}`}>
            {insights.readinessScore}
          </div>
        </div>

        {/* Executive Summary */}
        <div className="detail-section">
          <div className="detail-title" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            Executive Summary
          </div>
          <div className="detail-text">{insights.summary}</div>
        </div>

        {/* Architectural Impact */}
        <div className="detail-section">
          <div className="detail-title" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Cpu size={14} /> Architectural Impact
          </div>
          <div className="detail-text">{insights.architecturalImpact}</div>
        </div>

        {/* Security Risks */}
        <div className="detail-section" style={{ borderLeftColor: 'var(--error)' }}>
          <div className="detail-title" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--error)' }}>
            <ShieldAlert size={14} /> Security Audit
          </div>
          <div className="detail-text">{insights.securityRisks}</div>
        </div>

      </div>
    </div>
  );
}
