import { spawn } from 'child_process';
import { appendFileSync } from 'fs';
import { appendLog, setAgentStatus, clearAgentStatus, registerProcess } from '../log-store.js';

const TIMEOUT_MS = 10 * 60 * 1000;

export function runClaudeAgent(project, issue, context) {
  return new Promise((resolve) => {
    const logPath = `/tmp/claude-issue-${issue.number}.log`;

    setAgentStatus(issue.number, {
      agentName: 'claude',
      startedAt: new Date().toISOString(),
      currentFile: null,
    });

    const proc = spawn('claude', ['--print', context, '--dangerously-skip-permissions'], {
      cwd: project.localPath,
      env: {
        ...process.env,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      },
    });

    function onData(chunk) {
      const text = chunk.toString();
      appendFileSync(logPath, text);
      appendLog(issue.number, text);

      // Extract current file from claude output if possible
      const fileMatch = text.match(/(?:Reading|Writing|Editing)\s+(\S+\.\w+)/);
      if (fileMatch) {
        setAgentStatus(issue.number, {
          agentName: 'claude',
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
      appendLog(issue.number, '\n[timeout] Claude agent killed after 10 minutes\n');
      done(false);
    }, TIMEOUT_MS);
  });
}
