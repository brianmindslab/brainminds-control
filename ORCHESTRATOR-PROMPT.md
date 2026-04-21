# Build the Brainminds AI Orchestrator System

You are taking over the design and full implementation of an AI orchestration server. Read this entire document before writing a single line of code. Everything you need is here.

---

## What You Are Building

A self-hosted AI development system consisting of three parts:

1. **Builder Server** — A separate Linux VPS where three AI CLIs (Claude Code, Gemini, Codex) run 24/7, read GitHub Issues, write code, commit, and open PRs automatically.
2. **Orchestrator** — A Node.js service on the builder server that routes tasks from GitHub Issues to the right AI CLI, manages their execution, and reports results.
3. **Control Panel** — A Next.js web app hosted on the builder server, accessible from any browser, that gives a visual dashboard to manage projects, trigger tasks, watch live AI output, and merge PRs.

### Why This Exists

The owner has three AI subscriptions (Claude Max, Gemini, Codex/OpenAI) and wants them running as autonomous agents on a server rather than manually interacting with each through browser tabs. GitHub Issues are the task queue. The owner is the director — they approve merges, but everything else runs without them.

---

## The Three AI CLIs

All three are official CLI tools that authenticate with the user's existing accounts — no extra API keys needed.

```bash
# Claude Code (Anthropic)
npm install -g @anthropic-ai/claude-code
# Auth: claude (interactive login with Claude Max account)
# Non-interactive: claude --print "your task here"

# Gemini CLI (Google)
npm install -g @google/gemini-cli
# Auth: gemini (interactive OAuth with Google account)
# Non-interactive: echo "your prompt" | gemini

# Codex CLI (OpenAI)
npm install -g @openai/codex
# Auth: codex (interactive login with OpenAI account)
# Non-interactive: codex "your task" --approval-mode full-auto
```

---

## Full System Architecture

```
BUILDER SERVER (new Hetzner VPS, Ubuntu 24.04, CX21 ~€6/month)
/opt/orchestrator/
├── orchestrator/           ← Node.js service (PM2, runs 24/7)
│   ├── index.js            ← main loop
│   ├── agents/
│   │   ├── claude.js       ← spawns claude CLI
│   │   ├── gemini.js       ← spawns gemini CLI
│   │   └── codex.js        ← spawns codex CLI
│   ├── github.js           ← GitHub API wrapper (gh CLI)
│   ├── telegram.js         ← Telegram notifications
│   ├── projects.json       ← registered projects config
│   └── package.json
├── control-panel/          ← Next.js app (PM2, port 3000)
│   ├── app/
│   │   ├── page.tsx        ← main dashboard
│   │   ├── api/
│   │   │   ├── issues/     ← proxy GitHub Issues
│   │   │   ├── prs/        ← proxy GitHub PRs
│   │   │   ├── agents/     ← agent status + live output
│   │   │   ├── servers/    ← production server health
│   │   │   └── trigger/    ← manually trigger a task
│   │   └── layout.tsx
│   └── package.json
└── projects/
    ├── braintime/          ← git clone brianmindslab/braintime
    └── [future projects]/

PRODUCTION SERVER (46.225.217.226, existing Hetzner)
/opt/braintime/             ← live Braintime LMS (do not touch)
/home/aiagent/.config/braintime/env  ← GITHUB_TOKEN stored here
Watcher Claude runs here separately — not part of this build.
```

---

## Orchestrator — Detailed Spec

### `orchestrator/projects.json`

```json
{
  "projects": [
    {
      "id": "braintime",
      "name": "Braintime LMS",
      "repo": "brianmindslab/braintime",
      "localPath": "/opt/orchestrator/projects/braintime",
      "productionServer": "46.225.217.226",
      "defaultBranch": "main"
    }
  ]
}
```

### `orchestrator/index.js` — Main Loop

The orchestrator polls GitHub every 2 minutes. On each tick:

1. For each registered project, fetch open issues with label `ai-task`
2. Skip issues already labeled `in-progress` or `deployed`
3. For each new issue, determine the agent based on labels:
   - `for-claude-code` → claude agent
   - `for-codex` → codex agent
   - `needs-review` on a PR → gemini agent (for PR review, not issue)
4. Add label `in-progress` to the issue
5. Send Telegram: "🤖 Starting: [issue title]"
6. Spawn the correct agent with the issue body as context
7. Agent writes code, runs build check, commits, opens PR
8. Send Telegram: "✅ PR opened: #N — [issue title]" or "❌ Failed: [issue title]"
9. Remove `in-progress` label, add `needs-review` to the PR

```javascript
// orchestrator/index.js
import { execSync, spawn } from 'child_process';
import { readFileSync } from 'fs';
import { runClaudeAgent } from './agents/claude.js';
import { runGeminiAgent } from './agents/gemini.js';
import { runCodexAgent } from './agents/codex.js';
import { getOpenIssues, labelIssue, getPRsNeedingReview, commentOnPR } from './github.js';
import { notify } from './telegram.js';

const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes
const projects = JSON.parse(readFileSync('./projects.json')).projects;

// Track what's currently running to avoid double-spawning
const activeJobs = new Set();

async function tick() {
  for (const project of projects) {
    // Handle open issues
    const issues = await getOpenIssues(project.repo);
    for (const issue of issues) {
      const key = `issue-${issue.number}`;
      if (activeJobs.has(key)) continue;

      const labels = issue.labels.map(l => l.name);
      if (labels.includes('in-progress')) continue;

      let agent = null;
      if (labels.includes('for-claude-code')) agent = 'claude';
      else if (labels.includes('for-codex')) agent = 'codex';

      if (!agent) continue;

      activeJobs.add(key);
      handleIssue(project, issue, agent).finally(() => activeJobs.delete(key));
    }

    // Handle PRs needing Gemini review
    const prs = await getPRsNeedingReview(project.repo);
    for (const pr of prs) {
      const key = `pr-${pr.number}`;
      if (activeJobs.has(key)) continue;
      activeJobs.add(key);
      handlePRReview(project, pr).finally(() => activeJobs.delete(key));
    }
  }
}

async function handleIssue(project, issue, agentName) {
  await labelIssue(project.repo, issue.number, ['in-progress']);
  await notify(`🤖 *Starting #${issue.number}*\n${issue.title}\nAgent: ${agentName}`);

  // Pull latest code
  execSync(`git -C ${project.localPath} pull origin ${project.defaultBranch}`, { stdio: 'pipe' });

  // Create feature branch
  const branch = `ai/issue-${issue.number}`;
  execSync(`git -C ${project.localPath} checkout -b ${branch}`, { stdio: 'pipe' });

  try {
    const context = buildContext(project, issue);
    
    let success = false;
    if (agentName === 'claude') success = await runClaudeAgent(project, issue, context);
    else if (agentName === 'codex') success = await runCodexAgent(project, issue, context);

    if (success) {
      // Verify build passes
      execSync(`cd ${project.localPath} && npm run build`, { stdio: 'pipe', timeout: 300000 });
      
      // Push branch
      execSync(`git -C ${project.localPath} push -u origin ${branch}`, { stdio: 'pipe' });
      
      // Open PR
      const prUrl = execSync(
        `gh pr create --repo ${project.repo} --title "${issue.title}" ` +
        `--body "Closes #${issue.number}\n\nAutomatically implemented by ${agentName}." ` +
        `--head ${branch} --label "needs-review"`,
        { stdio: 'pipe' }
      ).toString().trim();

      await notify(`✅ *PR opened for #${issue.number}*\n${issue.title}\n${prUrl}`);
    } else {
      throw new Error('Agent reported failure');
    }
  } catch (err) {
    // Reset branch
    execSync(`git -C ${project.localPath} checkout ${project.defaultBranch}`, { stdio: 'pipe' });
    execSync(`git -C ${project.localPath} branch -D ${branch}`, { stdio: 'pipe' });
    await labelIssue(project.repo, issue.number, [], ['in-progress']);
    await notify(`❌ *Failed #${issue.number}*\n${issue.title}\n${err.message}`);
  }
}

async function handlePRReview(project, pr) {
  const diff = execSync(`gh pr diff ${pr.number} --repo ${project.repo}`, { stdio: 'pipe' }).toString();
  const review = await runGeminiAgent(diff);
  await commentOnPR(project.repo, pr.number, `## 🤖 Gemini Code Review\n\n${review}`);
  await notify(`👁 *Gemini reviewed PR #${pr.number}*\n${pr.title}`);
}

function buildContext(project, issue) {
  return `
Project: ${project.name}
Repo: ${project.repo}
Local path: ${project.localPath}

GitHub Issue #${issue.number}: ${issue.title}

${issue.body}

INSTRUCTIONS:
- Read the relevant files mentioned in the issue
- Implement the exact fix/feature described
- Run npm run build to verify no TypeScript errors
- Commit with message: "${issue.title.toLowerCase()} (closes #${issue.number})"
- Do NOT push — the orchestrator handles that
`.trim();
}

// Start polling
console.log('🚀 Orchestrator started');
tick();
setInterval(tick, POLL_INTERVAL);
```

### `orchestrator/agents/claude.js`

```javascript
import { spawn } from 'child_process';
import { appendFileSync } from 'fs';

export function runClaudeAgent(project, issue, context) {
  return new Promise((resolve) => {
    const logPath = `/tmp/claude-issue-${issue.number}.log`;
    
    const proc = spawn('claude', ['--print', context], {
      cwd: project.localPath,
      env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    });

    proc.stdout.on('data', (d) => appendFileSync(logPath, d));
    proc.stderr.on('data', (d) => appendFileSync(logPath, d));

    // Stream to control panel via global log store
    streamToControlPanel(issue.number, proc);

    proc.on('close', (code) => resolve(code === 0));
    
    // Timeout after 10 minutes
    setTimeout(() => { proc.kill(); resolve(false); }, 10 * 60 * 1000);
  });
}
```

### `orchestrator/agents/gemini.js`

```javascript
import { spawnSync } from 'child_process';

export function runGeminiAgent(diff) {
  const prompt = `You are reviewing a GitHub PR for Braintime LMS (Next.js 16, TypeScript, Prisma, Tailwind CSS 4).

Review this diff for:
1. Security issues (missing auth checks, SQL injection, exposed secrets)
2. TypeScript errors or missing null checks
3. Missing dark mode variants (every bg-* needs dark:bg-*)
4. Missing German translations (user-facing strings must use t('key'))
5. Performance issues (N+1 queries, missing dynamic imports for heavy components)

Format your response as:
## Critical (must fix before merge)
## Improvements (should fix)  
## Nitpicks (optional)
## Verdict: APPROVE / REQUEST CHANGES / BLOCK

DIFF:
${diff}`;

  const result = spawnSync('gemini', { input: prompt, encoding: 'utf8', timeout: 60000 });
  return result.stdout || result.stderr || 'Gemini review failed';
}
```

### `orchestrator/agents/codex.js`

```javascript
import { spawn } from 'child_process';
import { appendFileSync } from 'fs';

export function runCodexAgent(project, issue, context) {
  return new Promise((resolve) => {
    const logPath = `/tmp/codex-issue-${issue.number}.log`;
    
    const proc = spawn('codex', [context, '--approval-mode', 'full-auto'], {
      cwd: project.localPath,
    });

    proc.stdout.on('data', (d) => appendFileSync(logPath, d));
    proc.stderr.on('data', (d) => appendFileSync(logPath, d));
    streamToControlPanel(issue.number, proc);

    proc.on('close', (code) => resolve(code === 0));
    setTimeout(() => { proc.kill(); resolve(false); }, 10 * 60 * 1000);
  });
}
```

### `orchestrator/github.js`

```javascript
import { execSync } from 'child_process';

const GH = (cmd) => execSync(`gh ${cmd}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

export function getOpenIssues(repo) {
  const out = GH(`issue list --repo ${repo} --label "ai-task" --state open --json number,title,body,labels --limit 50`);
  return JSON.parse(out);
}

export function getPRsNeedingReview(repo) {
  const out = GH(`pr list --repo ${repo} --label "needs-review" --state open --json number,title,labels --limit 20`);
  return JSON.parse(out);
}

export function labelIssue(repo, number, addLabels = [], removeLabels = []) {
  if (addLabels.length) GH(`issue edit ${number} --repo ${repo} --add-label "${addLabels.join(',')}"`);
  if (removeLabels.length) GH(`issue edit ${number} --repo ${repo} --remove-label "${removeLabels.join(',')}"`);
}

export function commentOnPR(repo, number, body) {
  GH(`pr comment ${number} --repo ${repo} --body "${body.replace(/"/g, '\\"')}"`);
}
```

### `orchestrator/telegram.js`

```javascript
export async function notify(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
  }).catch(() => {});
}
```

---

## Control Panel — Detailed Spec

A Next.js 15 app running on port 3000 of the builder server. The owner accesses it at `http://builder-server-ip:3000`. Simple password protection via middleware.

### Pages

**`app/page.tsx` — Main Dashboard**

Layout: Two-column. Left sidebar (fixed): project list, server health, agent status. Right main area: issue board for the selected project.

Issue board shows:
- Grouped by priority: P0, P1, P2, P3
- Each issue card: number, title, labels, "▶ Run" button (triggers that specific issue immediately without waiting for poll), status indicator
- Active issues show a live pulsing indicator and which agent is running
- Completed PRs section at bottom: PR number, title, "Merge ▶" button, "View diff" link

Left sidebar shows:
- Project list with issue count badge
- Builder server health (CPU, RAM, disk)
- Production server health (ping /api/diagnostics)
- Three agent status indicators: Claude / Gemini / Codex with green/red dot

**`app/agent-output/[issueNumber]/page.tsx` — Live Output**

Full-page terminal view showing real-time stdout from the running agent. WebSocket connection. Black background, monospace font, auto-scroll. Shows which agent is running, elapsed time, current file being edited.

**`app/api/agents/status/route.ts`**

Returns current state of all running agents: `{ issueNumber, agentName, startedAt, currentFile, output[] }`

**`app/api/trigger/route.ts`**

POST `{ issueNumber, projectId }` — immediately adds the issue to the run queue without waiting for the next 2-minute poll.

**`app/api/merge/route.ts`**

POST `{ prNumber, repo }` — runs `gh pr merge <n> --squash --repo <repo>` on the builder server.

**`app/api/servers/route.ts`**

Returns health of both servers: builder (local stats) and production (SSH ping or HTTP ping to `/api/diagnostics`).

### Design

Match the Braintime aesthetic: dark by default, zinc/slate colors, Inter font, rounded-2xl cards, font-black labels. Keep it minimal — this is a tool, not a product.

---

## Builder Server Setup Script

Create this as `setup.sh` in the repo root. Running it on a fresh Ubuntu 24.04 VPS fully configures the builder server.

```bash
#!/bin/bash
set -e

echo "=== Brainminds Builder Server Setup ==="

# System packages
apt update && apt install -y git curl wget build-essential

# Node.js 22 via fnm
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 22 && fnm use 22

# GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list
apt update && apt install gh -y

# AI CLIs
npm install -g @anthropic-ai/claude-code @google/gemini-cli @openai/codex pm2

# Directory structure
mkdir -p /opt/orchestrator/{orchestrator,control-panel,projects}

# Configure git
git config --global user.name "Brainminds Orchestrator"
git config --global user.email "ai@brianmindslab.com"
git config --global --add safe.directory '*'

echo "=== Setup complete ==="
echo ""
echo "Next steps (run manually - require interactive auth):"
echo "  1. gh auth login --with-token <<< 'YOUR_GITHUB_TOKEN'"
echo "  2. claude    (login with Claude Max account)"
echo "  3. gemini    (login with Google account)"  
echo "  4. codex     (login with OpenAI account)"
echo "  5. gh repo clone brianmindslab/braintime /opt/orchestrator/projects/braintime"
```

---

## Environment Variables

**`/opt/orchestrator/.env`** (on builder server):
```
GITHUB_TOKEN=<see .env on server>
TELEGRAM_BOT_TOKEN=<see .env on server>
TELEGRAM_CHAT_ID=<see .env on server>
CONTROL_PANEL_PASSWORD=choose_a_password
PRODUCTION_SERVER_IP=46.225.217.226
```

Note: The GitHub token above is already generated and authenticated (created during the Braintime session). The Telegram credentials are from the existing Braintime production setup.

---

## PM2 Process Config

**`/opt/orchestrator/ecosystem.config.js`**:
```javascript
module.exports = {
  apps: [
    {
      name: 'orchestrator',
      script: '/opt/orchestrator/orchestrator/index.js',
      cwd: '/opt/orchestrator/orchestrator',
      env_file: '/opt/orchestrator/.env',
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: 'control-panel',
      script: 'npm',
      args: 'start',
      cwd: '/opt/orchestrator/control-panel',
      env_file: '/opt/orchestrator/.env',
      env: { PORT: 3000, NODE_ENV: 'production' },
    },
  ],
};
```

Start everything: `pm2 start /opt/orchestrator/ecosystem.config.js && pm2 save && pm2 startup`

---

## Multi-Project Support

Adding a new project is one operation: add an entry to `projects.json` and clone the repo.

```bash
# Add a new project
gh repo clone brianmindslab/new-project /opt/orchestrator/projects/new-project
```

```json
// Add to projects.json:
{
  "id": "new-project",
  "name": "New Project",
  "repo": "brianmindslab/new-project",
  "localPath": "/opt/orchestrator/projects/new-project",
  "productionServer": "...",
  "defaultBranch": "main"
}
```

The control panel's project switcher picks it up automatically. Same GitHub label system (`ai-task`, `for-claude-code`, etc.) works across all projects.

---

## What To Build — File Checklist

```
/opt/orchestrator/
├── setup.sh                              ← server setup script
├── ecosystem.config.js                   ← PM2 config
├── .env                                  ← environment variables
├── projects.json                         ← registered projects
│
├── orchestrator/
│   ├── package.json                      ← { "type": "module" }, no deps beyond built-ins
│   ├── index.js                          ← main poll loop
│   ├── github.js                         ← gh CLI wrapper
│   ├── telegram.js                       ← Telegram notifier
│   ├── log-store.js                      ← in-memory log buffer for WebSocket streaming
│   └── agents/
│       ├── claude.js                     ← claude CLI runner
│       ├── gemini.js                     ← gemini CLI runner
│       └── codex.js                      ← codex CLI runner
│
└── control-panel/
    ├── package.json                      ← Next.js 15, TypeScript
    ├── next.config.ts
    ├── middleware.ts                      ← password protection
    ├── app/
    │   ├── layout.tsx                    ← Inter font, dark theme
    │   ├── page.tsx                      ← main dashboard
    │   ├── agent-output/[issue]/page.tsx ← live terminal view
    │   └── api/
    │       ├── issues/route.ts           ← GET: fetch GitHub issues
    │       ├── prs/route.ts              ← GET: fetch open PRs
    │       ├── trigger/route.ts          ← POST: trigger task immediately
    │       ├── merge/route.ts            ← POST: merge a PR
    │       ├── agents/status/route.ts    ← GET: running agent status
    │       ├── agents/stream/route.ts    ← GET: SSE stream of agent output
    │       └── servers/route.ts          ← GET: health of both servers
    └── components/
        ├── IssueCard.tsx
        ├── AgentStatus.tsx
        ├── ServerHealth.tsx
        └── LiveOutput.tsx
```

---

## Constraints & Rules

1. **Orchestrator uses zero npm dependencies** — only Node.js built-ins (`child_process`, `fs`, `fetch`). No Express, no axios, nothing to maintain.
2. **Control panel uses Next.js 15** with TypeScript strict mode. Match Braintime's Tailwind CSS 4 + dark theme patterns.
3. **Never auto-merge to main** — the orchestrator opens PRs, the owner merges from the control panel.
4. **Build must pass before PR** — if `npm run build` fails after the agent runs, the branch is deleted and the issue is put back to open (no in-progress label).
5. **One agent at a time per project** — don't spawn two agents on the same repo simultaneously (git conflicts).
6. **Timeout all agent runs at 10 minutes** — kill the process and clean up the branch if it runs over.
7. **Log everything** — every agent run writes to `/tmp/[agent]-issue-[n].log`. Control panel streams these via SSE.

---

## How To Deliver

1. Build everything locally on your machine first
2. Create a new GitHub repo: `brianmindslab/brainminds-control`
3. Push all code there
4. Create a `DEPLOY.md` explaining how to spin up the builder server and start everything
5. The owner will spin up a Hetzner CX21 VPS, run `setup.sh`, authenticate the three CLIs interactively, clone the repo, and start PM2

Do not create API keys. Do not install extra npm packages beyond what's listed. Do not write tests. Do not create README files beyond DEPLOY.md.
