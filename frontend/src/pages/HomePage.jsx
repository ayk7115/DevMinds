import { useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import { Activity, GitBranch, Cpu, MessageSquare, GitPullRequest, Shield, Zap, ArrowRight, Terminal, Database, Bot } from 'lucide-react';

export default function HomePage() {
  const navigate = useNavigate();
  const guideRef = useRef(null);

  const scrollToGuide = () => {
    if (guideRef.current) {
      guideRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const steps = [
    {
      num: '01',
      icon: <GitBranch size={24} />,
      title: 'Repository Ingestion (Repo X-Ray)',
      desc: 'Simply paste any public GitHub URL into the Repo X-Ray input. DevMind clones the repo to a local temp folder, scans its entire directory structure, extracts API endpoints, and builds a live architectural dependency graph — all in under 60 seconds.',
      code: 'https://github.com/facebook/react'
    },
    {
      num: '02',
      icon: <Shield size={24} />,
      title: 'Establish Secure Webhooks',
      desc: 'Connect your own private repositories by adding a GitHub Webhook. DevMind verifies every payload using HMAC SHA-256 signatures, ensuring only authorized Pull Request events trigger the local AI engine.',
      code: 'Payload URL: http://your-ip:3000/api/webhooks/github'
    },
    {
      num: '03',
      icon: <Cpu size={24} />,
      title: 'Local AI Sovereignty',
      desc: 'When a PR is opened, your local Llama-3 model (running on Ollama or local GPU) wakes up. It analyzes the raw diff chunks, identifies architectural impact, and flags security risks without your source code ever leaving your machine.',
      code: '// Model: Llama-3-8B-Instruct\n// Privacy: 100% Local (Sovereign Mode)'
    },
    {
      num: '04',
      icon: <Terminal size={24} />,
      title: 'Live Insight Streaming',
      desc: 'Watch the AI "think" in real-time through the Live Terminal. DevMind calculates a Readiness Score (0-100) based on complexity, security signals, and code quality, giving you immediate deployment confidence.',
      code: 'socket.emit("agent:stream", { prId: 101, ... })'
    },
    {
      num: '05',
      icon: <Bot size={24} />,
      title: 'Hybrid Contextual Chat',
      desc: 'Interact with your codebase through our Tier-2 Chat layer. Powered by Groq, the assistant uses sanitized PR metadata and recent Repo Scans to answer questions about PR history, system health, and architectural gaps.',
      code: 'Q: "What was the security risk in the last Auth PR?"'
    },
    {
      num: '06',
      icon: <MessageSquare size={24} />,
      title: 'Omnichannel Alerts',
      desc: 'Stay informed wherever you are. DevMind delivers high-priority PR insights directly to your Telegram bot and compiles a weekly "Friday Digest" of all repo activity for stakeholders.',
      code: 'TELEGRAM_BOT_TOKEN=748291...:AAH... '
    }
  ];

  const features = [
    { icon: <Shield size={28} />, title: 'Sovereign Privacy', desc: 'Raw code never leaves your machine. Local Llama-3 processes everything on-device.' },
    { icon: <Zap size={28} />, title: 'Groq Hybrid Chat', desc: 'Lightning-fast AI chat powered by Groq queries only sanitized metadata — never your source code.' },
    { icon: <Database size={28} />, title: 'Repo X-Ray', desc: 'Paste any public GitHub URL and get an interactive architectural graph of its structure instantly.' },
    { icon: <Bot size={28} />, title: 'Dual Persona', desc: 'Toggle between a stakeholder executive summary and a raw technical changelog for engineers.' },
    { icon: <MessageSquare size={28} />, title: 'Telegram Alerts', desc: 'Instant PR insights delivered to your Telegram. Weekly digests sent automatically every Friday.' },
    { icon: <GitPullRequest size={28} />, title: 'PR Timeline', desc: 'A full scrollable history of every PR analyzed, with scores and summaries ready to revisit.' },
  ];

  return (
    <div className="home-page">
      {/* Navbar */}
      <header className="home-navbar">
        <nav className="home-nav">
          <div className="home-logo">
            <Activity size={28} color="var(--accent-primary)" />
            <span>DevMind</span>
          </div>
          <button className="btn-primary" onClick={() => navigate('/dashboard')}>
            Open Dashboard <ArrowRight size={16} />
          </button>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-badge">Sovereign AI Platform | Powered by Llama-3 + Groq</div>
        <h1 className="hero-title">
          Turn Every PR Into<br />
          <span className="gradient-text">Strategic Intelligence</span>
        </h1>
        <p className="hero-desc">
          DevMind is a locally-sovereign AI platform that automatically analyzes GitHub Pull Requests,
          generates architectural insights, and delivers business-grade reports — all without your code
          ever touching the cloud.
        </p>
        <div className="hero-actions">
          <button className="btn-primary btn-lg" onClick={() => navigate('/dashboard')}>
            <Activity size={20} /> Launch Dashboard
          </button>
          <button className="btn-ghost btn-lg" onClick={scrollToGuide}>
            How It Works
          </button>
        </div>
        <div className="hero-stats">
          <div className="stat"><span>100%</span><p>Local Processing</p></div>
          <div className="stat-divider" />
          <div className="stat"><span>6GB</span><p>GPU Footprint</p></div>
          <div className="stat-divider" />
          <div className="stat"><span>&lt;2s</span><p>Groq Chat Response</p></div>
          <div className="stat-divider" />
          <div className="stat"><span>0</span><p>Cloud Code Exposure</p></div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="home-section">
        <div className="section-label">What DevMind Does</div>
        <h2 className="section-title">Everything You Need to Ship Confidently</h2>
        <div className="features-grid">
          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Step-by-Step Guide */}
      <section className="home-section" id="guide" ref={guideRef}>
        <div className="section-label">Operational Workflow</div>
        <h2 className="section-title">How DevMind Operates</h2>
        <p className="section-subtitle">A seamless pipeline from local ingestion to intelligent insights.</p>

        <div className="steps-list">
          {steps.map((step) => (
            <div key={step.num} className="step-card">
              <div className="step-num">{step.num}</div>
              <div className="step-content">
                <div className="step-icon">{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
                <div className="step-code">
                  <pre><code>{step.code}</code></pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* GitHub PAT Note */}
        <div className="info-box">
          <Shield size={20} />
          <div>
            <strong>Fine-Grained GitHub PAT</strong>
            <p>For private repos, generate a GitHub Personal Access Token with <code>Contents: Read-only</code> permission and add it to your <code>.env</code> as <code>GITHUB_PAT</code>. This token is used only by your local Node.js server — never shared externally.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="home-cta">
        <h2>Ready to give your codebase a brain?</h2>
        <p>Your first AI-powered PR insight is one webhook away.</p>
        <button className="btn-primary btn-lg" onClick={() => navigate('/dashboard')}>
          <Activity size={20} /> Open Dashboard
        </button>
      </section>

      <footer className="home-footer">
        <div className="home-logo">
          <Activity size={20} color="var(--accent-primary)" />
          <span>DevMind</span>
        </div>
        <p>Sovereign AI | Local-first | Zero cloud exposure</p>
      </footer>
    </div>
  );
}
