# Brainminds Orchestrator — Deploy Guide

## What this is

Three-part AI orchestration system:
- **Orchestrator** — Node.js service (port 3001) that polls GitHub Issues and spawns AI CLIs
- **Control Panel** — Next.js 15 web app (port 3000) to manage projects, trigger tasks, watch live output, merge PRs
- **Builder server** — Ubuntu 24.04 VPS where all of this runs

## Quick Deploy (fresh server)

```bash
# 1. SSH into the builder server
ssh root@YOUR_SERVER_IP

# 2. Run the setup script
curl -fsSL https://raw.githubusercontent.com/brianmindslab/brainminds-control/main/setup.sh | bash

# 3. Authenticate GitHub CLI
gh auth login --with-token <<< 'YOUR_GITHUB_TOKEN'

# 4. Clone this repo to /opt/orchestrator
gh repo clone brianmindslab/brainminds-control /tmp/brainminds-control
cp -r /tmp/brainminds-control/. /opt/orchestrator/

# 5. Configure environment
cp /opt/orchestrator/.env.example /opt/orchestrator/.env
nano /opt/orchestrator/.env
# Fill in: GITHUB_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CONTROL_PANEL_PASSWORD

# 6. Clone the project repo
gh repo clone brianmindslab/braintime /opt/orchestrator/projects/braintime

# 7. Install dependencies and build control panel
cd /opt/orchestrator/orchestrator && npm install
cd /opt/orchestrator/control-panel && npm install && npm run build

# 8. Start PM2
pm2 start /opt/orchestrator/ecosystem.config.js
pm2 save
pm2 startup  # follow the printed command to enable startup

# 9. Authenticate AI CLIs (interactive — do these manually)
claude   # login with Claude Max account
gemini   # login with Google account
codex    # login with OpenAI account
```

## Access

- Control panel: `http://YOUR_SERVER_IP:3000`
- Password: whatever you set in `CONTROL_PANEL_PASSWORD`

## GitHub Labels

The orchestrator reads these labels on issues:
- `ai-task` — required on every issue the orchestrator should handle
- `for-claude-code` — route to Claude Code
- `for-codex` — route to Codex
- `in-progress` — automatically added while running
- `needs-review` — added to opened PRs (triggers Gemini review)
- `deployed` — mark manually after merging

## Adding a New Project

1. Add an entry to `/opt/orchestrator/projects.json`
2. Clone the repo: `gh repo clone ORG/REPO /opt/orchestrator/projects/REPO`
3. Restart orchestrator: `pm2 restart orchestrator`

## PM2 Commands

```bash
pm2 list                    # see all running processes
pm2 logs orchestrator       # tail orchestrator logs
pm2 logs control-panel      # tail control panel logs
pm2 restart orchestrator    # restart after config changes
pm2 monit                   # live CPU/RAM monitor
```

## Architecture

```
port 3001  orchestrator (Node.js, internal only)
port 3000  control-panel (Next.js, public)

/opt/orchestrator/
├── ecosystem.config.js
├── .env
├── projects.json
├── orchestrator/       ← polls GitHub, spawns AI CLIs
└── control-panel/      ← Next.js dashboard
    └── .next/          ← built output
```
