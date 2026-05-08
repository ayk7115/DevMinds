# 🧠 DevMind: Local-First PR Intelligence Platform

DEMO VIDEO LINK:-
https://github.com/ayk7115/DevMinds/releases/download/v1.0.0/DEVMIND.mp4

PPT LINK:-
https://github.com/ayk7115/DevMinds/releases/download/v1.0.0/MS.Ramaiah.Institute.of.Technology_DevMinds.pdf

OpenClaw AI Disclosure:-
https://github.com/ayk7115/DevMinds/releases/download/v1.0.0/OpenClaw_AI_Disclosure.docx

DevMind is a sovereign AI platform designed to transform pull requests and repository scans into actionable intelligence. It provides deep architectural insights, security risk assessments, and stakeholder summaries while keeping your sensitive code entirely on-site.

## ✨ Key Features

*   **🔍 Repo X-Ray**: Instantly map your project architecture, endpoints, database tables, and logical dependencies.
*   **🛡️ Sovereign AI**: Orchestrate local models (via OpenClaw/Ollama) to analyze code without cloud exposure.
*   **📊 PR Intelligence**: Automated assessment of pull requests for deployment readiness and technical debt.
*   **💬 Metadata-Augmented Chat**: Chat with your repository's state using sanitized metadata through Groq.
*   **⚡ Real-Time Dashboard**: Live analysis streaming via Socket.IO with a premium glassmorphism UI.
*   **📱 Enterprise Integrations**: Built-in support for Telegram alerts, GitHub webhooks, and scaffolds for Jira/Gerrit.

## 🚀 Quick Start

### 1. Prerequisites
*   Node.js (v18+)
*   SQLite3
*   (Optional) Groq API Key for Cloud-Hybrid chat.

### 2. Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd DevMinds

# Install Backend dependencies
npm install

# Install Frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Configuration
1. Copy `.env.example` to `.env` in the root and `frontend/` folders.
2. Fill in your API keys (Groq, Telegram) and server ports.

### 4. Running the Project
```bash
# Start Backend (from root)
npm run dev

# Start Frontend (from /frontend)
npm run dev
```

## 🏗️ Technical Architecture

*   **Backend**: Node.js, Express, Socket.IO, Better-SQLite3, Simple-Git.
*   **Frontend**: React, Vite, React Flow (Architecture Mapping), TailwindCSS, Lucide Icons.
*   **AI Engine**: Hybrid orchestration supporting Groq (Cloud) and OpenClaw/Ollama (Local).

## 🗺️ Roadmap & Future Vision

*   **Phase 1**: Configuration & UI Polish (Fixing encoding artifacts, improving mobile responsiveness).
*   **Phase 2**: Reliable Analysis Runs (Persistent logs and run-id history).
*   **Phase 3**: Advanced Integrations (Automated Jira transitions, Slack alerts).
*   **Phase 4**: Enterprise Security (SAST/Secret scanning plugins, audit logs).

---
© 2026 DevMind Team. Built for the future of sovereign engineering.
