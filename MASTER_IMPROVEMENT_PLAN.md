# DevMind Master Improvement Plan

## Goal

DevMind should feel like one connected PR intelligence product:

1. A GitHub PR arrives.
2. The backend verifies it, fetches the diff, analyzes it locally, persists the result, streams progress live, and sends Telegram.
3. The dashboard shows the live run, the final insight, historical PRs, repository X-Ray, and chat over sanitized metadata.
4. The user can test every integration from the app/API without relying on loose manual scripts.

## Current Problems

- Telegram is configured as a side effect, not a visible live integration.
- Repo X-Ray was mostly a shallow folder graph, not a repository explanation.
- PR Timeline does not explain status, source, raw output, or next actions clearly enough.
- Analyzer testing depends on separate scripts and manual interpretation.
- Groq chat errors were hidden behind generic failures.
- Product areas feel separate instead of connected by one workflow and shared status.

## Improvements Already Started

- Groq chat now exposes `/api/chat/status` and returns clear configuration/request errors.
- Chat service now validates `GROQ_API_KEY` before calling Groq.
- Chat defaults to `llama-3.1-8b-instant`, which is listed in Groq production model docs.
- Telegram messages now use escaped HTML and have a plain-text fallback.
- Telegram now has status and test-send helpers through `/api/integrations`.
- Repo X-Ray backend now returns richer architecture data:
  - file and directory metrics
  - language stats
  - API endpoint inventory
  - package manifests
  - dependency groups
  - entry points
  - database tables
  - module groups
  - integrations
  - risks/gaps
  - logical product graph
- Added `npm run smoke` to check analyzer, SQLite, Groq config, and Telegram formatting.

## Target Product Architecture

### Backend

- `src/index.js`
  - server bootstrap
  - route mounting
  - Socket.IO setup
  - health checks

- `src/routes/webhooks.js`
  - GitHub webhook verification
  - PR event normalization
  - async analyzer kickoff

- `src/services/agentService.js`
  - diff fetch
  - smart chunking
  - local model execution
  - insight persistence
  - Telegram event dispatch
  - Socket.IO progress events

- `src/services/repoAnalyzer.js`
  - repository inventory
  - architecture graph
  - API/module/dependency extraction
  - risk/gap detection

- `src/services/chatService.js`
  - Groq chat over sanitized SQLite metadata only
  - clear status/error handling

- `src/services/telegramService.js`
  - safe message formatting
  - delivery status
  - test delivery

- `src/config/db.js`
  - SQLite schema
  - insight history
  - chunks/findings/vector memory

### Frontend

- Dashboard should be organized around one workflow:
  - Live Analysis
  - PR Timeline
  - Repo X-Ray
  - Integrations
  - AI Chat

- Each tab should answer:
  - What is happening?
  - What data is this showing?
  - What can I do next?
  - Is the backend/integration healthy?

## Phase 1: Stabilize Core Integrations

### Groq Chat

Tasks:
- Add visible chat status in the dashboard.
- Show model name and configuration state.
- Add a clear message when `GROQ_API_KEY` is missing.
- Add `GROQ_MODEL` to `.env.example`.
- Keep raw source code out of the Groq prompt.

Acceptance criteria:
- `GET /api/chat/status` returns configured/model/privacy info.
- Missing key shows setup-needed state, not a generic error.
- A valid key returns a normal chat response.

### Telegram

Tasks:
- Keep escaped HTML formatting for PR alerts.
- Add dashboard button: Send Telegram Test.
- Show Telegram configured/unconfigured status.
- Store notification delivery status in DB for each PR.
- Add retry/backoff for transient Telegram failures.

Acceptance criteria:
- `POST /api/integrations/telegram/test` sends a message.
- PR alerts do not fail on underscores, brackets, `<`, `>`, or `&`.
- The dashboard shows last Telegram delivery result.

### Analyzer Smoke Test

Tasks:
- Use `npm run smoke` as the standard local verification command.
- Add this command to teammate docs.
- Expand later into a real automated test suite.

Acceptance criteria:
- One command checks analyzer, SQLite, Groq config, and Telegram formatter.
- No loose script is needed for basic verification.

## Phase 2: Make PR Timeline Understandable

Tasks:
- Rename "PR Timeline" to "PR Intelligence Archive" or add a clear header.
- Show PR number, repo, author, date, score, status, and source.
- Add filters:
  - repo
  - score band
  - security risk
  - date range
- Add a detail drawer:
  - stakeholder summary
  - engineer changelog
  - architectural impact
  - security findings
  - raw model output
  - Telegram delivery state
- Add "Re-run analysis" action for stored PRs where source metadata exists.

Acceptance criteria:
- A teammate can open the timeline and understand what each record means.
- Selecting a PR updates the insight panel and preserves state after refresh.
- History rows expose enough detail to debug an analysis.

## Phase 3: Make Repo X-Ray Actually Useful

Tasks:
- Keep the new architecture inventory from `repoAnalyzer.js`.
- Add a repository detail panel:
  - overview
  - detected stack
  - API endpoints
  - database tables
  - services
  - frontend components/pages
  - risks/gaps
- Add file-level drilldown:
  - file path
  - role
  - imports
  - endpoints or components found
- Add "Analyze local project" and "Analyze GitHub URL" as explicit modes.
- Cache latest X-Ray result in SQLite instead of recomputing on every refresh.

Acceptance criteria:
- X-Ray explains the repository, not just folders.
- The graph shows logical product areas and relationships.
- The detail panel gives actionable information.

## Phase 4: Connect Live Analysis End to End

Tasks:
- Define a single analysis run entity in DB:
  - run id
  - source type
  - repo
  - PR id/number
  - status
  - started_at
  - completed_at
  - error
- Persist live logs by run id.
- Stream Socket.IO events by run id.
- Show current run at top of dashboard.
- Let frontend reconnect and recover run state after refresh.

Acceptance criteria:
- Refreshing the page never loses the current analysis.
- Live terminal, insight card, timeline, and Telegram all refer to the same run.
- Failed runs are visible and debuggable.

## Phase 5: Replace Manual Webhook Testing

Tasks:
- Add `POST /api/dev/mock-pr` for local development only.
- Protect it behind `NODE_ENV !== 'production'`.
- Let it create a fake PR analysis run without GitHub.
- Add UI button: "Run Demo PR".
- Keep `test-webhook.js` only as a legacy fallback or remove it.

Acceptance criteria:
- Demo analysis can be triggered from UI.
- New teammates do not need to understand HMAC signatures on day one.
- Real GitHub webhooks remain secure.

## Phase 6: Improve Local AI Reliability

Tasks:
- Move hardcoded WSL/OpenClaw paths into `.env`.
- Add `/api/integrations/status` checks for WSL, Ollama, and model availability.
- Add clear fallback when diff fetch fails.
- Store raw diff fetch status in the analysis run.
- Make local model output JSON more reliable with schema validation.

Acceptance criteria:
- Analyzer failures explain exactly which dependency failed.
- The app can tell whether local AI is ready before a PR arrives.
- Bad model output does not corrupt the dashboard.

## Phase 7: Testing and Quality Gate

Tasks:
- Add backend tests for:
  - GitHub signature verification
  - repo analyzer extraction
  - Telegram escaping
  - chat prompt privacy
  - history route mapping
- Add frontend tests for:
  - dashboard state recovery
  - chat error display
  - X-Ray rendering with fixture data
  - PR timeline selection
- Add CI-friendly commands:
  - `npm run smoke`
  - `npm run test`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run build`

Acceptance criteria:
- Every main feature has a regression test.
- A teammate can verify the project without guessing.

## Phase 8: Product Polish

Tasks:
- Add an Integrations tab.
- Add onboarding checklist:
  - backend running
  - frontend connected
  - GitHub configured
  - Groq configured
  - Telegram configured
  - Ollama/WSL ready
- Improve empty states so they explain the next action.
- Remove garbled text artifacts from UI copy.
- Add loading/error states to every API call.

Acceptance criteria:
- The dashboard feels guided instead of half-finished.
- Every empty or failed state tells the user what to do next.

## Priority Order

1. Groq chat visibility and error handling.
2. Telegram status/test endpoint and dashboard control.
3. Repo X-Ray detail view.
4. PR Timeline detail drawer and filters.
5. Analysis run persistence.
6. Demo PR trigger to replace manual scripts.
7. Automated tests.
8. UI polish and onboarding.

## Definition of Done

The project should be considered connected when:

- A new teammate can run `npm install`, `npm run smoke`, start backend/frontend, and understand what is configured.
- The dashboard clearly shows backend, Groq, Telegram, GitHub, and local AI readiness.
- A demo PR can be run without GitHub.
- A real GitHub PR creates a persisted analysis run.
- Live stream, final insight, timeline, Telegram, and chat all reference the same stored analysis.
- Repo X-Ray provides a useful repository explanation with graph plus details.
- Chat works when Groq is configured and gives precise setup feedback when it is not.
