const logs        = new Map(); // issueNumber -> string[]
const listeners   = new Map(); // issueNumber -> Set<fn>
const agentStatus = new Map(); // issueNumber -> { agentName, startedAt, currentFile }
const processes   = new Map(); // issueNumber -> ChildProcess
const jobHistory  = [];        // max 100 completed jobs

// ── live log buffer ────────────────────────────────────────────────────────────

export function appendLog(issueNumber, chunk) {
  if (!logs.has(issueNumber)) logs.set(issueNumber, []);
  logs.get(issueNumber).push(chunk);
  if (listeners.has(issueNumber)) {
    for (const write of listeners.get(issueNumber)) {
      try { write(chunk); } catch {}
    }
  }
}

export function getLogs(issueNumber) {
  return logs.get(issueNumber) ?? [];
}

export function subscribe(issueNumber, writeFn) {
  if (!listeners.has(issueNumber)) listeners.set(issueNumber, new Set());
  listeners.get(issueNumber).add(writeFn);
  return () => listeners.get(issueNumber)?.delete(writeFn);
}

// ── agent status ───────────────────────────────────────────────────────────────

export function setAgentStatus(issueNumber, status) {
  agentStatus.set(issueNumber, status);
}

export function clearAgentStatus(issueNumber) {
  agentStatus.delete(issueNumber);
  logs.delete(issueNumber);
  listeners.delete(issueNumber);
}

export function getAllAgentStatus() {
  const result = [];
  for (const [issueNumber, status] of agentStatus) {
    result.push({ issueNumber, ...status, output: logs.get(issueNumber) ?? [] });
  }
  return result;
}

// ── process handles ────────────────────────────────────────────────────────────

export function registerProcess(issueNumber, proc) {
  processes.set(issueNumber, proc);
}

export function killProcess(issueNumber) {
  const proc = processes.get(issueNumber);
  if (!proc) return false;
  proc.kill('SIGTERM');
  processes.delete(issueNumber);
  return true;
}

export function getRunningIssueNumbers() {
  return [...processes.keys()];
}

// ── job history + metrics ──────────────────────────────────────────────────────

export function recordJob({ issueNumber, agentName, title, startedAt, finishedAt, success }) {
  jobHistory.unshift({
    issueNumber, agentName, title: title ?? `Issue #${issueNumber}`,
    startedAt, finishedAt, success,
    durationMs: new Date(finishedAt) - new Date(startedAt),
  });
  if (jobHistory.length > 100) jobHistory.pop();
}

export function getJobHistory(limit = 25) {
  return jobHistory.slice(0, limit);
}

export function getMetrics() {
  const todayStr = new Date().toDateString();
  const today    = jobHistory.filter(j => new Date(j.startedAt).toDateString() === todayStr);
  return {
    totalJobs:     jobHistory.length,
    todayTotal:    today.length,
    todaySuccess:  today.filter(j => j.success).length,
    todayFailed:   today.filter(j => !j.success).length,
    activeAgents:  processes.size,
  };
}
