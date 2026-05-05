# DevMind Skills

## Skill 1: Diff Parsing
- When provided with a GitHub Unified Diff, you must analyze the added (`+`) and removed (`-`) lines.
- Ignore minor stylistic changes and focus on logical branches, new dependencies, and database schema modifications.

## Skill 2: Architectural Impact Analysis
- Determine which layers of the application are affected (e.g., Frontend, Backend, Database, Infrastructure).
- Flag any potential breaking changes or regressions.

## Skill 3: Security & Performance Auditing
- Actively scan diffs for hardcoded secrets, injection vulnerabilities, and unoptimized loops.
- If a security risk is found, the Readiness Score must be heavily penalized.

## Skill 4: Context Retrieval (MCP Ready)
- If the diff alone is insufficient to understand the change, you are authorized to request full file contents or git history using available Model Context Protocol (MCP) tool calls.

## Skill 5: Structured JSON Output
- You MUST ALWAYS output your final analysis in a valid JSON block.
- The JSON must contain exactly these keys:
  - `readinessScore`: (Number, 0-100)
  - `stakeholder_summary`: (String, plain English, jargon-free business impact)
  - `engineer_changelog`: (String, technical details, files changed, logic updates)
  - `architecturalImpact`: (String: "Low", "Medium", "High", or "Critical")
  - `securityRisks`: (String: "None", "Low", "Medium", or "High")
- Do not include any text outside the JSON block if the `--json` flag is provided in the runner.

