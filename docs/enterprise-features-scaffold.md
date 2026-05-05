# DevMind Enterprise Feature Scaffold

This scaffold plugs into the current Express, Socket.IO, and Better-SQLite3 backend without replacing the existing GitHub/OpenClaw workflow.

## 1. Enterprise Integrations and Compatibility

Architecture: `src/routes/enterprise.js` exposes `/api/enterprise/gerrit` and `/api/enterprise/jira/sync`. Gerrit payloads are normalized by `gerritJiraAdapters.js` into the same PR shape used by `agentService.processPullRequest`. Jira transitions are inferred from DevMind readiness and security risk fields, then executed with Jira REST when credentials are configured.

Execution flow:
1. Gerrit sends a patchset event to `/api/enterprise/gerrit`.
2. DevMind extracts project, revision, author, branch, and Jira key.
3. The existing local PR analysis pipeline runs asynchronously.
4. The resulting insight can drive `/api/enterprise/jira/sync`.
5. Sync runs as `dryRun` by default, then calls Jira REST when `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` are present.

Recommended libraries: native `fetch`, existing `better-sqlite3`, optional `p-queue` later if queueing outgrows the built-in edge manager.

## 2. Universal AST Parsing and Smart Chunking

Architecture: `treeSitterParser.js` provides optional Tree-sitter parsing for C++, Java, and Python. It dynamically imports `tree-sitter`, `tree-sitter-cpp`, `tree-sitter-java`, and `tree-sitter-python`, so the server still boots before those packages are installed. `smartDiffChunker.js` parses unified diffs, filters boilerplate, attaches AST symbol context when a checkout is available, and prioritizes security or core-logic hunks.

Execution flow:
1. Repo X-Ray or PR ingestion provides file paths and repository root.
2. AST digests are persisted in `ast_symbols`.
3. PR diffs go through `/api/enterprise/diff/chunk`.
4. Chunks are sorted by priority and token estimate before local LLM inference.
5. SAST scans the same chunks for deployment readiness signals.

Recommended libraries: `tree-sitter`, `tree-sitter-cpp`, `tree-sitter-java`, `tree-sitter-python`. For production native install friction, consider WASM grammars in a worker process.

## 3. Predictive Technical Debt Modeling

Architecture: `technicalDebtModel.js` stores time-series module snapshots in `technical_debt_snapshots`. The current model is transparent and tunable: bug regressions, AST complexity, churn, and commit pressure produce a 0-100 risk score and a risk band.

Execution flow:
1. A scheduled job or PR pipeline computes module metrics from Git history and AST digests.
2. DevMind calls `/api/enterprise/debt/snapshot` per module.
3. The dashboard can read `/api/enterprise/debt/hotspots`.
4. High-risk modules become additional context in PR prompts and stakeholder summaries.

Recommended libraries: existing `simple-git`; optional `typhonjs-escomplex` for JS complexity and Tree-sitter-derived counters for C++/Java/Python.

## 4. Vector-Relational Hybrid Context Memory

Architecture: `hybridContextMemory.js` stores relational metadata and Float32 embedding BLOBs in SQLite. It uses local Ollama embeddings by default, keeping code and PR history on the workstation. This is a zero-extension baseline; `sqlite-vec` can replace JS cosine search when the corpus grows.

Execution flow:
1. Completed PR insights are embedded with `nomic-embed-text` through local Ollama.
2. Metadata and embeddings are stored in `pr_vectors`.
3. New PRs query `/api/enterprise/memory/search` with their summary or diff chunk.
4. Similar historical flaws are injected into the local model prompt.

Recommended libraries: Ollama local embeddings, optional `sqlite-vec` or `sqlite-vss` for larger repositories.

## 5. Quantized Edge Execution Pipeline

Architecture: `edgeResourceManager.js` enforces single-concurrency local inference and selects quantized Ollama model profiles sized for a 6GB RTX 4050. It exposes queued `infer` and streaming `stream` methods, using q4 GGUF-oriented model tags via environment variables.

Execution flow:
1. Webhook or walkthrough requests enter the resource manager.
2. The manager chooses fast-path or interactive model settings.
3. Prompts are truncated to profile limits before hitting Ollama.
4. Streaming responses are forwarded through Socket.IO.

Recommended model setup: `OLLAMA_FAST_MODEL=llama3.1:8b-instruct-q4_K_M`, `OLLAMA_TINY_MODEL=phi3:mini-4k-instruct-q4_K_M`, `OLLAMA_EMBED_MODEL=nomic-embed-text`, `DEVMIND_LLM_CONCURRENCY=1`.

## 6. Live Ask the Agent and Security Readiness

Architecture: `liveWalkthrough.js` registers Socket.IO handlers for `agent:walkthrough:ask`. The frontend scaffold `AskAgentWalkthrough.jsx` emits the selected node payload and receives streamed chunks. `sastScanner.js` runs lightweight vulnerability checks before the explanation is generated.

Execution flow:
1. PM selects a changelog or architecture node.
2. Frontend emits `agent:walkthrough:ask` with node id, file path, and code/diff selection.
3. Backend runs SAST, emits findings, then streams local model output.
4. UI displays the plain-English explanation as it arrives.

Recommended libraries: existing `socket.io` and `socket.io-client`; optional Semgrep later for a deeper local SAST mode.
