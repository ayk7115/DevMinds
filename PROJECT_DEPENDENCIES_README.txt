DevMinds Project Dependencies and Setup Commands
================================================

This file is for teammates who need to install and run the DevMinds project locally.

Project Structure
-----------------
Backend root:
  C:\Users\lenovo\Desktop\DevMinds

Frontend root:
  C:\Users\lenovo\Desktop\DevMinds\frontend

Required System Dependencies
----------------------------
1. Node.js
   Recommended: Node.js 20 or newer.

2. npm
   Comes bundled with Node.js.

3. Git
   Required for repository cloning and repo ingestion features.

4. SQLite native build support
   The backend uses better-sqlite3, which is a native Node.js package.
   On most machines npm install will handle this automatically.
   If install fails on Windows, install Visual Studio Build Tools with C++ build tools.

5. Optional: WSL / Ubuntu
   Required only if using the OpenClaw local agent execution path configured in src/services/agentService.js.

6. Optional: Ollama
   Required only for local Llama / embedding features.


Backend Dependencies
--------------------
These are installed from the root package.json:

Runtime dependencies:
  better-sqlite3@^12.9.0
  cors@^2.8.5
  dotenv@^17.4.2
  express@^4.19.2
  groq-sdk@^1.1.2
  helmet@^7.1.0
  node-cron@^4.2.1
  simple-git@^3.36.0
  socket.io@^4.7.5
  tree-sitter@^0.21.1
  tree-sitter-cpp@^0.23.4
  tree-sitter-java@^0.23.5
  tree-sitter-python@^0.21.0

Backend scripts:
  npm run start
  npm run dev
  npm run smoke


Frontend Dependencies
---------------------
These are installed from frontend/package.json:

Runtime dependencies:
  @dagrejs/dagre@^3.0.0
  @xyflow/react@^12.10.2
  lucide-react@^1.14.0
  react@^19.2.5
  react-dom@^19.2.5
  react-router-dom@^7.14.2
  socket.io-client@^4.8.3

Development dependencies:
  @eslint/js@^10.0.1
  @types/react@^19.2.14
  @types/react-dom@^19.2.3
  @vitejs/plugin-react@^6.0.1
  eslint@^10.2.1
  eslint-plugin-react-hooks@^7.1.1
  eslint-plugin-react-refresh@^0.5.2
  globals@^17.5.0
  vite@^8.0.10

Frontend scripts:
  npm run dev
  npm run build
  npm run lint
  npm run preview


Fresh Setup Commands
--------------------
Run these commands after cloning the project.

1. Open PowerShell and go to the project root:
  cd C:\Users\lenovo\Desktop\DevMinds

2. Install backend dependencies:
  npm install

3. Go to the frontend folder:
  cd frontend

4. Install frontend dependencies:
  npm install


Environment Setup
-----------------
From the project root, create a .env file.
If .env.example exists, copy it:

  cd C:\Users\lenovo\Desktop\DevMinds
  copy .env.example .env

Then fill in the required values in .env, such as:
  PORT=3000
  FRONTEND_URL=http://localhost:5173
  GITHUB_WEBHOOK_SECRET=your_webhook_secret
  GITHUB_PAT=your_github_personal_access_token
  GROQ_API_KEY=your_groq_api_key
  GROQ_MODEL=llama-3.1-8b-instant
  TELEGRAM_BOT_TOKEN=your_telegram_bot_token
  TELEGRAM_CHAT_ID=your_telegram_chat_id
  OLLAMA_BASE_URL=http://127.0.0.1:11434
  OLLAMA_EMBED_MODEL=nomic-embed-text

Some variables are optional depending on which features your teammate needs.


Run Commands
------------
Start backend server:
  cd C:\Users\lenovo\Desktop\DevMinds
  npm run dev

Backend URL:
  http://localhost:3000

Start frontend dev server in a second terminal:
  cd C:\Users\lenovo\Desktop\DevMinds\frontend
  npm run dev

Frontend URL:
  http://localhost:5173


Build and Verification Commands
-------------------------------
Run backend smoke test:
  cd C:\Users\lenovo\Desktop\DevMinds
  npm run smoke

Run frontend lint:
  cd C:\Users\lenovo\Desktop\DevMinds\frontend
  npm run lint

Build frontend:
  cd C:\Users\lenovo\Desktop\DevMinds\frontend
  npm run build

Preview frontend production build:
  cd C:\Users\lenovo\Desktop\DevMinds\frontend
  npm run preview

Check backend JavaScript syntax:
  cd C:\Users\lenovo\Desktop\DevMinds
  node --check src\index.js


Windows PowerShell Note
-----------------------
If PowerShell blocks npm with an execution policy error like:
  npm.ps1 cannot be loaded because running scripts is disabled on this system

Use npm.cmd instead:
  npm.cmd install
  npm.cmd run dev
  npm.cmd run build
  npm.cmd run lint


One-Shot Install Commands
-------------------------
Backend:
  cd C:\Users\lenovo\Desktop\DevMinds
  npm.cmd install

Frontend:
  cd C:\Users\lenovo\Desktop\DevMinds\frontend
  npm.cmd install


One-Shot Run Commands
---------------------
Terminal 1 - Backend:
  cd C:\Users\lenovo\Desktop\DevMinds
  npm.cmd run dev

Terminal 2 - Frontend:
  cd C:\Users\lenovo\Desktop\DevMinds\frontend
  npm.cmd run dev


Expected Local URLs
-------------------
Backend:
  http://localhost:3000

Frontend:
  http://localhost:5173

Health check:
  http://localhost:3000/health
