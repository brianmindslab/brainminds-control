import { spawn } from 'child_process';
import { appendFileSync } from 'fs';
import { appendLog, setAgentStatus, clearAgentStatus, registerProcess } from '../log-store.js';

const TIMEOUT_MS = 10 * 60 * 1000;

export function runCodexAgent(project, issue, context) {
  return new Promise((resolve) => {
    const logPath = `/tmp/codex-issue-${issue.number}.log`;

    setAgentStatus(issue.number, {
      agentName: 'codex',
      startedAt: new Date().toISOString(),
      currentFile: null,
    });

    const proc = spawn('codex', [context, '--approval-mode', 'full-auto'], {
      cwd: project.localPath,
      env: { ...process.env },
    });

    function onData(chunk) {
      const text = chunk.toString();
      appendFileSync(logPath, text);
      appendLog(issue.number, text);
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
      appendLog(issue.number, '\n[timeout] Codex agent killed after 10 minutes\n');
      done(false);
    }, TIMEOUT_MS);
  });
}
