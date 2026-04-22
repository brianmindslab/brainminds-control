import { spawn, spawnSync } from 'child_process';
import { appendFileSync } from 'fs';
import { appendLog, setAgentStatus, clearAgentStatus, registerProcess } from '../log-store.js';

const TIMEOUT_MS = 10 * 60 * 1000;

// ── PR code reviewer (fast, synchronous) ──────────────────────────────────────

const REVIEW_PROMPT = (diff) => `You are reviewing a GitHub PR for Braintime LMS (Next.js 16, TypeScript, Prisma, Tailwind CSS 4).

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

export function runGeminiAgent(diff) {
  const result = spawnSync('gemini', ['--prompt', REVIEW_PROMPT(diff)], {
    encoding: 'utf8',
    timeout: 60000,
  });

  if (result.error) return `Gemini review failed: ${result.error.message}`;
  return result.stdout || result.stderr || 'Gemini returned no output';
}

// ── Task agent (async, autonomous, yolo mode) ──────────────────────────────────

export function runGeminiTaskAgent(project, issue, context) {
  return new Promise((resolve) => {
    const logPath = `/tmp/gemini-issue-${issue.number}.log`;

    setAgentStatus(issue.number, {
      agentName: 'gemini',
      startedAt: new Date().toISOString(),
      currentFile: null,
    });

    const proc = spawn('gemini', ['--yolo', context], {
      cwd: project.localPath,
      env: {
        ...process.env,
        GEMINI_YOLO_MODE: 'true',
      },
    });

    function onData(chunk) {
      const text = chunk.toString();
      appendFileSync(logPath, text);
      appendLog(issue.number, text);

      const fileMatch = text.match(/(?:Reading|Writing|Editing|Modified)\s+(\S+\.\w+)/);
      if (fileMatch) {
        setAgentStatus(issue.number, {
          agentName: 'gemini',
          startedAt: new Date().toISOString(),
          currentFile: fileMatch[1],
        });
      }
    }

    registerProcess(issue.number, proc);
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    let settled = false;
    function done(success) {
      if (settled) return;
      settled = true;
      clearAgentStatus(issue.number);
      resolve(success);
    }

    proc.on('close', (code) => done(code === 0));
    proc.on('error', (err) => {
      appendLog(issue.number, `[error] ${err.message}\n`);
      done(false);
    });

    setTimeout(() => {
      proc.kill('SIGTERM');
      appendLog(issue.number, '\n[timeout] Gemini agent killed after 10 minutes\n');
      done(false);
    }, TIMEOUT_MS);
  });
}
