import { execSync } from 'child_process';
import { readFileSync, mkdirSync } from 'fs';
import { createServer } from 'http';
import { runClaudeAgent } from './agents/claude.js';
import { runGeminiAgent, runGeminiTaskAgent } from './agents/gemini.js';
import { runCodexAgent } from './agents/codex.js';
import { getOpenIssues, getPRsNeedingReview, labelIssue, commentOnPR, ensureLabelsExist } from './github.js';
import { notify } from './telegram.js';
import { getAllAgentStatus, getLogs, subscribe, killProcess } from './log-store.js';

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT ?? '3');
const POLL_INTERVAL  = 2 * 60 * 1000;
const WORKTREE_BASE  = '/opt/orchestrator/worktrees';

const projects = JSON.parse(readFileSync(new URL('../projects.json', import.meta.url))).projects;
const activeJobs = new Set();
export const triggerQueue = new Set();

let paused = false;

mkdirSync(WORKTREE_BASE, { recursive: true });

// ── worktree helpers ───────────────────────────────────────────────────────────

function wtPath(issue) {
  return `${WORKTREE_BASE}/issue-${issue.number}`;
}

function setupWorktree(project, issue) {
  const wt     = wtPath(issue);
  const branch = `ai/issue-${issue.number}`;

  execSync(`git -C ${project.localPath} fetch origin ${project.defaultBranch}`, { stdio: 'pipe' });

  // Remove stale worktree + branch if they exist
  try { execSync(`git -C ${project.localPath} worktree remove --force ${wt}`, { stdio: 'pipe' }); } catch {}
  try { execSync(`git -C ${project.localPath} branch -D ${branch}`, { stdio: 'pipe' }); } catch {}

  execSync(
    `git -C ${project.localPath} worktree add ${wt} -b ${branch} origin/${project.defaultBranch}`,
    { stdio: 'pipe' }
  );

  // Symlink node_modules so agents skip npm install
  try { execSync(`ln -sf ${project.localPath}/node_modules ${wt}/node_modules`, { stdio: 'pipe' }); } catch {}

  return wt;
}

function cleanupWorktree(project, issue) {
  const wt     = wtPath(issue);
  const branch = `ai/issue-${issue.number}`;
  try { execSync(`git -C ${project.localPath} worktree remove --force ${wt}`, { stdio: 'pipe' }); } catch {}
  try { execSync(`git -C ${project.localPath} branch -D ${branch}`, { stdio: 'pipe' }); } catch {}
}

// ── main poll loop ─────────────────────────────────────────────────────────────

async function tick() {
  if (paused) return;

  for (const project of projects) {
    let issues = [];
    try {
      issues = await getOpenIssues(project.repo);
    } catch (err) {
      console.error(`[tick] failed to fetch issues for ${project.repo}:`, err.message);
      continue;
    }

    let prs = [];
    try {
      prs = await getPRsNeedingReview(project.repo);
    } catch (err) {
      console.error(`[tick] failed to fetch PRs for ${project.repo}:`, err.message);
    }

    for (const issue of issues) {
      if (activeJobs.size >= MAX_CONCURRENT) break;

      const key = `issue-${issue.number}`;
      if (activeJobs.has(key)) continue;

      const labels = issue.labels.map((l) => l.name);
      if (labels.includes('in-progress') || labels.includes('deployed') || labels.includes('ai-failed')) continue;

      let agent = null;
      if (labels.includes('for-claude-code')) agent = 'claude';
      else if (labels.includes('for-codex'))  agent = 'codex';
      else if (labels.includes('for-gemini')) agent = 'gemini';

      if (!agent) continue;

      if (triggerQueue.has(issue.number)) triggerQueue.delete(issue.number);

      activeJobs.add(key);
      handleIssue(project, issue, agent).finally(() => activeJobs.delete(key));
    }

    for (const pr of prs) {
      const key = `pr-${pr.number}`;
      if (activeJobs.has(key)) continue;
      activeJobs.add(key);
      handlePRReview(project, pr).finally(() => activeJobs.delete(key));
    }
  }
}

// ── issue handler — runs concurrently per issue in isolated worktree ───────────

async function handleIssue(project, issue, agentName) {
  console.log(`[orchestrator] starting #${issue.number} with ${agentName} (active: ${activeJobs.size}/${MAX_CONCURRENT})`);
  await labelIssue(project.repo, issue.number, ['in-progress']);
  await notify(`🤖 *Starting #${issue.number}*\n${issue.title}\nAgent: ${agentName}`);

  let wt;
  try {
    wt = setupWorktree(project, issue);
  } catch (err) {
    console.error(`[git] worktree setup failed for #${issue.number}:`, err.message);
    await labelIssue(project.repo, issue.number, ['ai-failed'], ['in-progress']);
    await notify(`❌ *Failed #${issue.number}* (worktree setup)\n${err.message}`);
    return;
  }

  const wtProject = { ...project, localPath: wt };

  try {
    const context = buildContext(project, issue, wt);

    let success = false;
    if (agentName === 'claude')       success = await runClaudeAgent(wtProject, issue, context);
    else if (agentName === 'codex')   success = await runCodexAgent(wtProject, issue, context);
    else if (agentName === 'gemini')  success = await runGeminiTaskAgent(wtProject, issue, context);

    if (!success) throw new Error('Agent reported failure');

    try {
      execSync(`cd ${wt} && npm run build`, { stdio: 'pipe', timeout: 300_000 });
    } catch (err) {
      throw new Error(`Build failed: ${err.message}`);
    }

    const gitStatus = execSync(`git -C ${wt} status --porcelain`, { encoding: 'utf8' });
    if (gitStatus.trim()) {
      execSync(
        `git -C ${wt} add -A && ` +
        `git -C ${wt} commit -m "${issue.title.toLowerCase()} (closes #${issue.number})"`,
        { stdio: 'pipe' }
      );
    }

    const branch = `ai/issue-${issue.number}`;
    execSync(`git -C ${wt} push -u origin ${branch}`, { stdio: 'pipe' });

    const prUrl = execSync(
      `gh pr create --repo ${project.repo} ` +
      `--title "${issue.title}" ` +
      `--body "Closes #${issue.number}\\n\\nAutomatically implemented by ${agentName}." ` +
      `--head ${branch} --label "needs-review"`,
      {
        stdio: 'pipe',
        encoding: 'utf8',
        env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
      }
    ).trim();

    console.log(`[orchestrator] PR opened: ${prUrl}`);
    await notify(`✅ *PR opened for #${issue.number}*\n${issue.title}\n${prUrl}`);
  } catch (err) {
    console.error(`[orchestrator] issue #${issue.number} failed:`, err.message);
    await labelIssue(project.repo, issue.number, ['ai-failed'], ['in-progress']);
    await notify(`❌ *Failed #${issue.number}*\n${issue.title}\n${err.message}\n_Remove \`ai-failed\` label to retry._`);
  } finally {
    cleanupWorktree(project, issue);
  }
}

async function handlePRReview(project, pr) {
  console.log(`[orchestrator] gemini reviewing PR #${pr.number}`);
  try {
    const diff = execSync(
      `gh pr diff ${pr.number} --repo ${project.repo}`,
      { stdio: 'pipe', encoding: 'utf8', env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN } }
    );
    const review = await runGeminiAgent(diff);
    await commentOnPR(project.repo, pr.number, `## 🤖 Gemini Code Review\n\n${review}`);
    await notify(`👁 *Gemini reviewed PR #${pr.number}*\n${pr.title}`);
  } catch (err) {
    console.error(`[orchestrator] PR review #${pr.number} failed:`, err.message);
  }
}

function buildContext(project, issue, workingPath) {
  return `Project: ${project.name}
Repo: ${project.repo}
Working directory: ${workingPath}

GitHub Issue #${issue.number}: ${issue.title}

${issue.body ?? ''}

INSTRUCTIONS:
- Read the relevant files mentioned in the issue
- Implement the exact fix/feature described
- Do NOT run npm run build — the orchestrator handles that
- Do NOT commit — the orchestrator handles that
- Do NOT push — the orchestrator handles that`.trim();
}

// ── HTTP API ───────────────────────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && url.pathname === '/trigger') {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      try {
        const { issueNumber } = JSON.parse(body);
        triggerQueue.add(Number(issueNumber));
        tick();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        res.end('bad request');
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ paused, agents: getAllAgentStatus() }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/pause') {
    paused = true;
    console.log('[orchestrator] paused');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, paused: true }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/resume') {
    paused = false;
    console.log('[orchestrator] resumed');
    tick();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, paused: false }));
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/kill/')) {
    const issueNumber = Number(url.pathname.split('/kill/')[1]);
    const killed = killProcess(issueNumber);
    console.log(`[orchestrator] kill #${issueNumber}: ${killed}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: killed }));
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/stream/')) {
    const issueNumber = Number(url.pathname.split('/stream/')[1]);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    for (const chunk of getLogs(issueNumber)) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    const unsub = subscribe(issueNumber, (chunk) => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    });
    req.on('close', unsub);
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

httpServer.listen(3001, () => console.log('[orchestrator] HTTP on :3001'));

console.log(`🚀 Orchestrator started — max ${MAX_CONCURRENT} concurrent agents, polling every 2 min`);

for (const project of projects) {
  ensureLabelsExist(project.repo);
}

tick();
setInterval(tick, POLL_INTERVAL);
