# Session Log

## Last Updated
2026-04-21

## Current Focus
Brainminds AI Orchestrator fully deployed and running on builder server.

## Decisions Made
- Builder server: 116.203.251.28 (Hetzner)
- Password: brainminds2024 (for control panel)
- PM2 env_file support unreliable in PM2 6.x — reads .env directly in ecosystem.config.js instead
- next.config.ts: no `output: standalone` (using npm start, not standalone server.js)
- Orchestrator exposes internal HTTP on port 3001; control panel proxies through

## Work Done This Session
- Installed Node 22, gh CLI, pm2, claude, gemini, codex CLIs on builder server
- Created full orchestrator system: index.js, log-store.js, github.js, telegram.js, agents/claude.js, agents/gemini.js, agents/codex.js
- Created Next.js 15 control panel with all routes: auth, issues, prs, trigger, merge, agents/status, agents/stream, servers
- Created React components: IssueCard, AgentStatus, ServerHealth, LiveOutput
- Created ecosystem.config.js, projects.json, .env (on server), setup.sh, DEPLOY.md
- Created GitHub repo: https://github.com/brianmindslab/brainminds-control
- Deployed to server: cloned braintime repo, built control panel, started PM2
- All 10 tests passing: auth, issues API (13 found), servers health, trigger, Telegram

## Next Steps
1. Authenticate the AI CLIs on the server (interactive):
   - SSH in: `ssh -i ~/.ssh/id_ed25519_personalai root@116.203.251.28`
   - Run `claude` and log in with Claude Max account
   - Run `gemini` and log in with Google account
   - Run `codex` and log in with OpenAI account
2. Access control panel at http://116.203.251.28:3000 (password: brainminds2024)
3. Add GitHub labels to braintime issues: `ai-task` + `for-claude-code` or `for-codex`

## Open Questions
- The orchestrator is already picking up 13 issues from braintime that have `ai-task` label
  — agents fail gracefully since not authenticated yet, but will work once authenticated
- Gemini CLI non-interactive mode uses `--prompt` flag (needs verification when authenticated)

## Blockers
- Claude, Gemini, Codex CLIs need interactive auth — must be done manually via SSH
