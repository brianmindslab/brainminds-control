# Brainminds AI Orchestrator — Project Overview

> Read this first. This file is the single source of truth for the entire system.
> Keep it updated when you make changes. Another session or tool may be reading it.

---

## What This Is

An autonomous AI coding pipeline that monitors GitHub Issues on the **Braintime LMS** repo and dispatches AI agents (Claude, Gemini, Codex) to implement fixes and features — each in its own isolated git worktree — then opens PRs automatically.

A local macOS Electron app provides a control panel (tray icon + dashboard window) to monitor agents, merge PRs, and start/stop the orchestrator.

---

## The Two Servers

| Role | IP | Purpose |
|---|---|---|
| **Builder** | `116.203.251.28` | Runs the orchestrator + control panel (Hetzner VPS) |
| **Production** | `46.225.217.226` | Runs the Braintime LMS app (separate server) |

---

## SSH Access

```bash
# Builder server (where the orchestrator lives)
ssh -i ~/.ssh/id_ed25519_personalai root@116.203.251.28

# Key path on the Mac
~/.ssh/id_ed25519_personalai
```

The SSH key must exist locally for the mac app's tunnel and for SSH PM2 commands.

---

## GitHub Repos

| Repo | Purpose |
|---|---|
| `brianmindslab/braintime` | The LMS app — where Issues and PRs live |
| `brianmindslab/brainminds-control` | This repo — orchestrator, control panel, mac app |

The orchestrator on the server pulls from `brianminds-control` to get updates.

---

## Server Directory Layout (`/opt/orchestrator/`)

```
/opt/orchestrator/
├── orchestrator/          # Node.js orchestrator (ESM, no deps)
│   ├── index.js           # Main poll loop + HTTP API on :3001
│   ├── log-store.js       # In-memory agent logs + process handles
│   ├── github.js          # gh CLI wrapper
│   ├── telegram.js        # Telegram alerts
│   └── agents/
│       ├── claude.js      # Spawns: claude --print <ctx> --dangerously-skip-permissions
│       ├── codex.js       # Spawns: codex <ctx> --approval-mode full-auto
│       └── gemini.js      # PR review (spawnSync) + task agent (--yolo)
├── control-panel/         # Next.js 15 web UI on :3000
├── projects/
│   └── braintime/         # Git clone of brianmindslab/braintime (main branch)
├── worktrees/             # Isolated git worktrees per active issue
│   └── issue-N/           # Each agent works here — cleaned up after job
├── ecosystem.config.js    # PM2 config (loads .env manually — PM2 6.x env_file is broken)
├── projects.json          # Which repos the orchestrator manages
└── .env                   # Secrets (GITHUB_TOKEN, TELEGRAM_BOT_TOKEN, etc.)
```

---

## PM2 Processes

```bash
# On the builder server:
pm2 status                    # See both processes
pm2 start orchestrator        # Start polling loop
pm2 stop orchestrator         # Stop (no new agents start; running ones finish)
pm2 restart orchestrator      # Restart after code changes
pm2 logs orchestrator         # Live logs
pm2 logs control-panel        # Next.js logs
```

| Process | Port | Status at last check |
|---|---|---|
| `orchestrator` | 3001 (internal only) | **stopped** (manually stopped 2026-04-22) |
| `control-panel` | 3000 (public) | running |

> **To start the orchestrator:** either use the mac app dashboard (Start button) or `ssh` in and run `pm2 start orchestrator`.

---

## Orchestrator HTTP API (port 3001 — internal only)

Not exposed publicly. Accessed via SSH tunnel from the mac app (`localhost:13001 → server:3001`).

| Method | Path | Description |
|---|---|---|
| GET | `/status` | Returns `{ paused, agents[], orchOnline }` |
| POST | `/pause` | Stop polling for new issues |
| POST | `/resume` | Resume polling |
| POST | `/kill/:n` | Kill agent for issue #N |
| GET | `/stream/:n` | SSE stream of agent output for issue #N |
| POST | `/trigger` | Force an immediate poll tick `{ issueNumber }` |

---

## How the Agent Pipeline Works

```
GitHub Issues (polled every 2 min)
    ↓
orchestrator/index.js  →  checks labels
    ├─ for-claude-code  →  agents/claude.js  →  claude --print <ctx> --dangerously-skip-permissions
    ├─ for-codex        →  agents/codex.js   →  codex <ctx> --approval-mode full-auto
    └─ for-gemini       →  agents/gemini.js  →  gemini --yolo <ctx>

Each agent:
    1. git worktree created at /opt/orchestrator/worktrees/issue-N
    2. node_modules symlinked from main project
    3. Agent runs with cwd = worktree
    4. npm run build (verify no TS errors)
    5. git add -A && git commit
    6. git push → branch ai/issue-N
    7. gh pr create --label needs-review
    8. Worktree removed

On failure:
    → Label changed to ai-failed (skip on next poll)
    → Telegram alert sent
    → To retry: remove ai-failed label from the issue
```

**Concurrency:** Up to `MAX_CONCURRENT=3` agents run simultaneously in parallel worktrees. Change via env var in `.env`.

---

## GitHub Issue Labels (State Machine)

| Label | Meaning |
|---|---|
| `ai-task` | This issue should be handled by an AI agent |
| `for-claude-code` | Route to Claude Code CLI |
| `for-codex` | Route to OpenAI Codex CLI |
| `for-gemini` | Route to Gemini CLI (--yolo mode) |
| `in-progress` | Agent is currently working on this issue |
| `needs-review` | PR opened, awaiting Gemini code review |
| `deployed` | Merged and deployed to production |
| `ai-failed` | Agent failed — remove this label to retry |
| `P0-critical` | Priority: fix immediately |
| `P1-important` | Priority: main work |
| `P2-enhancement` | Priority: improvements |
| `P3-nice-to-have` | Priority: polish |

---

## Gemini's Two Roles

1. **PR Reviewer** — When a PR gets the `needs-review` label, Gemini reviews the diff and posts a comment. Uses `spawnSync('gemini', ['--prompt', reviewPrompt])`.

2. **Task Agent** — When an issue has `for-gemini`, Gemini implements the code. Uses `spawn('gemini', ['--yolo', context])` with `GEMINI_YOLO_MODE=true`.

---

## Mac App (Local)

Location: `/Users/anonym/Projects/personal_ai_server/mac-app/`

```bash
# Start it
cd /Users/anonym/Projects/personal_ai_server/mac-app
npm start

# Run in background (survives terminal close)
nohup npm start > /tmp/brainminds-stdout.log 2>&1 &
```

**What it does:**
- Opens an SSH tunnel: `localhost:13001 → builder:3001`
- Shows a tray icon (menu bar) — click for quick popup
- Opens a dashboard window on launch (also reopens from Dock)
- Dashboard: Start/Stop/Restart orchestrator, view agents, merge PRs, pause/resume

**Log file:** `/tmp/brainminds-app.log`

**SSH tunnel port:** `13001` locally → `3001` on server

> Only one instance can run at a time (Electron single-instance lock). Kill with `pkill -x Electron` if stuck.

---

## Control Panel Web UI

Accessible at `http://116.203.251.28:3000` (public, password protected).

Password is set in `/opt/orchestrator/.env` as `CONTROL_PANEL_PASSWORD`.

---

## Environment Variables (`/opt/orchestrator/.env`)

```
GITHUB_TOKEN=<gh token for brianmindslab>
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_CHAT_ID=7633581052
PRODUCTION_SERVER_IP=46.225.217.226
ORCHESTRATOR_URL=http://localhost:3001
CONTROL_PANEL_PASSWORD=<password>
MAX_CONCURRENT=3        # optional — default 3
```

> `.env` is never committed. Load manually if restoring the server from scratch.

---

## Deploying Code Changes

All code lives in `brianmindslab/brainminds-control`. To deploy orchestrator changes:

```bash
# 1. Make changes locally, commit and push
git add . && git commit -m "feat: ..."
git push origin main

# 2. On the server — pull and restart
ssh -i ~/.ssh/id_ed25519_personalai root@116.203.251.28
cd /opt/orchestrator && git pull origin main
pm2 restart orchestrator
```

Or use the mac app's Restart button (does the PM2 restart but not the git pull).

---

## Current State (last updated 2026-04-22)

- **Orchestrator:** Stopped (manually stopped during debugging)
- **Control panel:** Running on :3000
- **Mac app:** Running locally (dashboard window open)
- **All 13 issues** have `ai-failed` label — they failed before CLIs were authenticated
- **CLIs authenticated:** claude ✅, gemini ✅, codex ✅ (done manually via SSH)
- **To resume work:** Start orchestrator, then remove `ai-failed` label from whichever issues you want retried (P0s first: #1 #2 #3 #4 were already unlocked)

---

## Quick Reference — Common Tasks

```bash
# Check what's running on the server
ssh -i ~/.ssh/id_ed25519_personalai root@116.203.251.28 "pm2 status"

# Watch orchestrator logs live
ssh -i ~/.ssh/id_ed25519_personalai root@116.203.251.28 "pm2 logs orchestrator"

# Start orchestrator
ssh -i ~/.ssh/id_ed25519_personalai root@116.203.251.28 "pm2 start orchestrator"

# Unlock an issue for retry (remove ai-failed label)
ssh -i ~/.ssh/id_ed25519_personalai root@116.203.251.28 \
  "gh issue edit 4 --repo brianmindslab/braintime --remove-label ai-failed"

# Force immediate poll
curl http://localhost:13001/trigger -X POST -H 'Content-Type: application/json' -d '{"issueNumber":4}'

# Check mac app log
cat /tmp/brainminds-app.log

# Kill and restart mac app
pkill -x Electron && cd ~/Projects/personal_ai_server/mac-app && npm start
```

---

## What NOT to Do

- **Don't edit files directly on the server** — always edit locally, commit, push, then pull on server
- **Don't delete `/opt/orchestrator/projects/braintime`** — it's the main git clone; worktrees depend on it
- **Don't run two mac app instances** — Electron single-instance lock will kill the second one silently
- **Don't manually checkout branches in `/opt/orchestrator/projects/braintime`** while agents are running — worktree setup does `git fetch` which is safe, but `git checkout` on the main clone will break active worktrees
