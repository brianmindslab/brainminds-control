import { execSync } from 'child_process';
import { readFileSync, createReadStream } from 'fs';
import { createServer } from 'http';
import { runClaudeAgent } from './agents/claude.js';
import { runGeminiAgent } from './agents/gemini.js';
import { runCodexAgent } from './agents/codex.js';
import { getOpenIssues, labelIssue, getPRsNeedingReview, commentOnPR } from './github.js';
import { notify } from './telegram.js';
import { getAllAgentStatus, getLogs, subscribe } from './log-store.js';

const POLL_INTERVAL = 2 * 60 * 1000;
const projects = JSON.parse(readFileSync(new URL('../projects.json', import.meta.url))).projects;

const activeJobs = new Set();
export const triggerQueue = new Set();

async function tick() {
  for (const project of projects) {
    let issues = [];
    try {
      issues = await getOpenIssues(project.repo);
    } catch (err) {
      console.error(`[tick] failed to fetch issues for ${project.repo}:`, err.message);
      continue;
    }

    for (const issue of issues) {
      const key = `issue-${issue.number}`;
      if (activeJobs.has(key)) continue;

      const labels = issue.labels.map((l) => l.name);
      if (labels.includes('in-progress') || labels.includes('deployed')) continue;

      let agent = null;
      if (labels.includes('for-claude-code')) agent = 'claude';
      else if (labels.includes('for-codex')) agent = 'codex';

      if (!agent) continue;

      if (triggerQueue.has(issue.number)) triggerQueue.delete(issue.number);

      activeJobs.add(key);
      handleIssue(project, issue, agent).finally(() => activeJobs.delete(key));
    }

    let prs = [];
    try {
      prs = await getPRsNeedingReview(project.repo);
    } catch {}

    for (const pr of prs) {
      const key = `pr-${pr.number}`;
      if (activeJobs.has(key)) continue;
      activeJobs.add(key);
      handlePRReview(project, pr).finally(() => activeJobs.delete(key));
    }
  }
}

async function handleIssue(project, issue, agentName) {
  console.log(`[orchestrator] starting issue #${issue.number} with ${agentName}`);
  await labelIssue(project.repo, issue.number, ['in-progress']);
  await notify(`🤖 *Starting #${issue.number}*\n${issue.title}\nAgent: ${agentName}`);

  try {
    execSync(`git -C ${project.localPath} checkout ${project.defaultBranch}`, { stdio: 'pipe' });
    execSync(`git -C ${project.localPath} pull origin ${project.defaultBranch}`, { stdio: 'pipe' });
  } catch (err) {
    console.error(`[git] pull failed:`, err.message);
  }

  const branch = `ai/issue-${issue.number}`;
  try { execSync(`git -C ${project.localPath} branch -D ${branch}`, { stdio: 'pipe' }); } catch {}
  execSync(`git -C ${project.localPath} checkout -b ${branch}`, { stdio: 'pipe' });

  try {
    const context = buildContext(project, issue);

    let success = false;
    if (agentName === 'claude') success = await runClaudeAgent(project, issue, context);
    else if (agentName === 'codex') success = await runCodexAgent(project, issue, context);

    if (!success) throw new Error('Agent reported failure');

    try {
      execSync(`cd ${project.localPath} && npm run build`, { stdio: 'pipe', timeout: 300000 });
    } catch (err) {
      throw new Error(`Build failed: ${err.message}`);
    }

    const gitStatus = execSync(`git -C ${project.localPath} status --porcelain`, { encoding: 'utf8' });
    if (gitStatus.trim()) {
      execSync(
        `git -C ${project.localPath} add -A && ` +
        `git -C ${project.localPath} commit -m "${issue.title.toLowerCase()} (closes #${issue.number})"`,
        { stdio: 'pipe' }
      );
    }

    execSync(`git -C ${project.localPath} push -u origin ${branch}`, { stdio: 'pipe' });

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
    try {
      execSync(`git -C ${project.localPath} checkout ${project.defaultBranch}`, { stdio: 'pipe' });
      execSync(`git -C ${project.localPath} branch -D ${branch}`, { stdio: 'pipe' });
    } catch {}
    await labelIssue(project.repo, issue.number, [], ['in-progress']);
    await notify(`❌ *Failed #${issue.number}*\n${issue.title}\n${err.message}`);
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

function buildContext(project, issue) {
  return `Project: ${project.name}
Repo: ${project.repo}
Local path: ${project.localPath}

GitHub Issue #${issue.number}: ${issue.title}

${issue.body ?? ''}

INSTRUCTIONS:
- Read the relevant files mentioned in the issue
- Implement the exact fix/feature described
- Run npm run build to verify no TypeScript errors
- Commit with message: "${issue.title.toLowerCase()} (closes #${issue.number})"
- Do NOT push — the orchestrator handles that`.trim();
}

// HTTP API for control panel communication (port 3001)
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
    res.end(JSON.stringify(getAllAgentStatus()));
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

httpServer.listen(3001, () => console.log('[orchestrator] internal HTTP on :3001'));

console.log('🚀 Orchestrator started — polling every 2 minutes');
tick();
setInterval(tick, POLL_INTERVAL);
