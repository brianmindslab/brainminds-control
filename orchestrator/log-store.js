// In-memory log buffer for streaming agent output to the control panel via SSE.
// Keyed by issue number. Listeners are SSE response objects.

const logs = new Map();      // issueNumber -> string[]
const listeners = new Map(); // issueNumber -> Set<WritableStream>
const agentStatus = new Map(); // issueNumber -> { agentName, startedAt, currentFile }

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

// Process handle store so we can kill running agents
const processes = new Map(); // issueNumber -> ChildProcess

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
