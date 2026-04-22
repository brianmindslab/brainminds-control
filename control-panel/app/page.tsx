'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ── types ─────────────────────────────────────────────────────────────────────

interface Label  { name: string }
interface Issue  { number: number; title: string; body: string; labels: Label[] }
interface PR     { number: number; title: string; url: string }
interface Agent  { issueNumber: number; agentName: string; startedAt: string; currentFile: string | null }
interface Servers {
  builder: { ok: boolean; cpu: number; memPercent: number; uptime: number };
  production: { ok: boolean; status: number | null };
}

const REPO = 'brianmindslab/braintime';
const REFRESH_MS = 8000;

// ── helpers ───────────────────────────────────────────────────────────────────

function elapsed(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

const AGENT_COLOR: Record<string, string> = {
  'for-claude-code': 'bg-orange-500',
  'for-codex':       'bg-emerald-500',
};

const PRIORITY_COLOR: Record<string, string> = {
  'P0-critical':      'bg-red-500',
  'P1-important':     'bg-orange-500',
  'P2-enhancement':   'bg-yellow-500',
  'P3-nice-to-have':  'bg-zinc-600',
};

// ── main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [paused,    setPaused]    = useState(false);
  const [agents,    setAgents]    = useState<Agent[]>([]);
  const [issues,    setIssues]    = useState<Issue[]>([]);
  const [prs,       setPrs]       = useState<PR[]>([]);
  const [servers,   setServers]   = useState<Servers | null>(null);
  const [toggling,  setToggling]  = useState(false);
  const [killing,   setKilling]   = useState<number | null>(null);
  const [merging,   setMerging]   = useState<number | null>(null);
  const [triggering,setTriggering]= useState<number | null>(null);
  const [tick,      setTick]      = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const [statusRes, issueRes, prRes, serverRes] = await Promise.allSettled([
      fetch('/api/agents/status'),
      fetch(`/api/issues?repo=${REPO}`),
      fetch(`/api/prs?repo=${REPO}`),
      fetch('/api/servers'),
    ]);

    if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
      const d = await statusRes.value.json();
      setPaused(d.paused ?? false);
      setAgents(d.agents ?? []);
    }
    if (issueRes.status === 'fulfilled' && issueRes.value.ok) {
      const d = await issueRes.value.json();
      setIssues(d.issues ?? []);
    }
    if (prRes.status === 'fulfilled' && prRes.value.ok) {
      const d = await prRes.value.json();
      setPrs(d.prs ?? []);
    }
    if (serverRes.status === 'fulfilled' && serverRes.value.ok) {
      setServers(await serverRes.value.json());
    }
  }, []);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(() => setTick(t => t + 1), REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refresh]);

  useEffect(() => { refresh(); }, [tick, refresh]);

  async function togglePause() {
    setToggling(true);
    const action = paused ? 'resume' : 'pause';
    await fetch('/api/orchestrator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setPaused(!paused);
    setToggling(false);
  }

  async function killAgent(issueNumber: number) {
    setKilling(issueNumber);
    await fetch('/api/agents/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueNumber }),
    });
    await refresh();
    setKilling(null);
  }

  async function triggerIssue(issueNumber: number) {
    setTriggering(issueNumber);
    await fetch('/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueNumber, projectId: 'braintime' }),
    });
    setTriggering(null);
  }

  async function mergePR(prNumber: number) {
    setMerging(prNumber);
    await fetch('/api/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prNumber, repo: REPO }),
    });
    setPrs(prev => prev.filter(p => p.number !== prNumber));
    setMerging(null);
  }

  const activeIssueNumbers = new Set(agents.map(a => a.issueNumber));

  const queuedIssues  = issues.filter(i => {
    const ls = i.labels.map(l => l.name);
    return !ls.includes('ai-failed') && !ls.includes('in-progress') && !ls.includes('deployed') &&
           (ls.includes('for-claude-code') || ls.includes('for-codex'));
  });

  const failedIssues  = issues.filter(i => i.labels.some(l => l.name === 'ai-failed'));

  return (
    <div className="min-h-screen bg-zinc-950 pb-safe">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-4 py-3 safe-top">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <h1 className="font-black text-zinc-100 text-base tracking-tight">BRAINMINDS</h1>
            <p className="text-zinc-600 text-xs">AI Orchestrator</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {servers && (
              <>
                <span className={`w-2 h-2 rounded-full ${servers.builder.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>CPU {servers.builder.cpu}%</span>
                <span className="text-zinc-700">·</span>
                <span className={`w-2 h-2 rounded-full ${servers.production.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>Prod</span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-5 flex flex-col gap-5">

        {/* ── Orchestrator toggle ─────────────────────────────────────── */}
        <button
          onClick={togglePause}
          disabled={toggling}
          className={`w-full rounded-3xl py-7 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 select-none ${
            paused
              ? 'bg-yellow-950/60 border-2 border-yellow-700'
              : 'bg-zinc-900 border-2 border-zinc-700'
          } ${toggling ? 'opacity-60' : ''}`}
        >
          <span className="text-4xl">{paused ? '⏸' : '▶'}</span>
          <span className={`font-black text-xl tracking-tight ${paused ? 'text-yellow-400' : 'text-zinc-100'}`}>
            {toggling ? '...' : paused ? 'PAUSED' : 'RUNNING'}
          </span>
          <span className="text-xs text-zinc-500">
            {paused ? 'Tap to resume' : 'Tap to pause'}
          </span>
        </button>

        {/* ── Active agents ───────────────────────────────────────────── */}
        {agents.length > 0 && (
          <section>
            <SectionLabel>Active Agents</SectionLabel>
            <div className="flex flex-col gap-2">
              {agents.map(agent => (
                <div key={agent.issueNumber} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                      <span className="font-black text-zinc-100 capitalize">{agent.agentName}</span>
                      <span className="text-zinc-500 text-sm">#{agent.issueNumber}</span>
                      <span className="text-zinc-600 text-xs font-mono">{elapsed(agent.startedAt)}</span>
                    </div>
                    {agent.currentFile && (
                      <p className="text-xs text-zinc-500 truncate">{agent.currentFile}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link
                      href={`/agent-output/${agent.issueNumber}`}
                      className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black rounded-xl px-3 py-2"
                    >
                      Logs
                    </Link>
                    <button
                      onClick={() => killAgent(agent.issueNumber)}
                      disabled={killing === agent.issueNumber}
                      className="text-xs bg-red-950 hover:bg-red-900 active:bg-red-800 text-red-400 font-black rounded-xl px-3 py-2 transition-colors disabled:opacity-50"
                    >
                      {killing === agent.issueNumber ? '...' : 'Stop'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Open PRs ────────────────────────────────────────────────── */}
        {prs.length > 0 && (
          <section>
            <SectionLabel>Open PRs — Ready to Merge</SectionLabel>
            <div className="flex flex-col gap-2">
              {prs.map(pr => (
                <div key={pr.number} className="bg-zinc-900 border border-emerald-900/50 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <span className="text-zinc-500 text-sm mr-1.5">#{pr.number}</span>
                      <span className="text-zinc-100 text-sm font-medium">{pr.title}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center text-sm text-zinc-400 bg-zinc-800 rounded-xl py-2.5 font-medium"
                    >
                      View diff ↗
                    </a>
                    <button
                      onClick={() => mergePR(pr.number)}
                      disabled={merging === pr.number}
                      className="flex-1 text-sm bg-emerald-800 active:bg-emerald-700 text-emerald-100 font-black rounded-xl py-2.5 transition-colors disabled:opacity-50"
                    >
                      {merging === pr.number ? 'Merging...' : 'Merge ▶'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Queued issues ───────────────────────────────────────────── */}
        {queuedIssues.length > 0 && (
          <section>
            <SectionLabel>Queue ({queuedIssues.length})</SectionLabel>
            <div className="flex flex-col gap-2">
              {queuedIssues.map(issue => {
                const labels = issue.labels.map(l => l.name);
                const priority = labels.find(l => PRIORITY_COLOR[l]);
                const agentLabel = labels.find(l => AGENT_COLOR[l]);
                const isActive = activeIssueNumbers.has(issue.number);
                return (
                  <IssueRow
                    key={issue.number}
                    issue={issue}
                    priority={priority}
                    agentLabel={agentLabel}
                    isActive={isActive}
                    triggering={triggering === issue.number}
                    onTrigger={() => triggerIssue(issue.number)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* ── Failed issues (collapsed) ───────────────────────────────── */}
        {failedIssues.length > 0 && (
          <FailedSection issues={failedIssues} />
        )}

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {queuedIssues.length === 0 && agents.length === 0 && prs.length === 0 && failedIssues.length === 0 && (
          <div className="text-center text-zinc-600 text-sm py-10">
            No open ai-task issues.
          </div>
        )}

        {/* ── Server details ──────────────────────────────────────────── */}
        {servers && (
          <section className="border-t border-zinc-900 pt-4">
            <SectionLabel>Infrastructure</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <ServerCard label="Builder" ok={servers.builder.ok}
                detail={`CPU ${servers.builder.cpu}% · up ${Math.floor(servers.builder.uptime / 60)}h`} />
              <ServerCard label="Production" ok={servers.production.ok}
                detail={servers.production.ok ? `HTTP ${servers.production.status}` : 'Unreachable'} />
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-black text-zinc-600 uppercase tracking-widest mb-2">{children}</p>
  );
}

function IssueRow({
  issue, priority, agentLabel, isActive, triggering, onTrigger
}: {
  issue: Issue; priority?: string; agentLabel?: string;
  isActive: boolean; triggering: boolean; onTrigger: () => void;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {priority && (
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLOR[priority] ?? 'bg-zinc-600'}`} />
          )}
          <span className="text-zinc-500 text-xs flex-shrink-0">#{issue.number}</span>
          {agentLabel && (
            <span className={`text-xs text-white font-black px-1.5 py-0.5 rounded-md ${AGENT_COLOR[agentLabel]}`}>
              {agentLabel === 'for-claude-code' ? 'Claude' : 'Codex'}
            </span>
          )}
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
        </div>
        <p className="text-zinc-200 text-sm leading-snug">{issue.title}</p>
      </div>
      {isActive ? (
        <Link
          href={`/agent-output/${issue.number}`}
          className="flex-shrink-0 text-xs bg-zinc-700 text-zinc-200 font-black rounded-xl px-3 py-2"
        >
          Watch
        </Link>
      ) : (
        <button
          onClick={onTrigger}
          disabled={triggering || !agentLabel}
          className="flex-shrink-0 text-sm bg-zinc-800 active:bg-zinc-700 text-zinc-200 font-black rounded-xl px-4 py-2 transition-colors disabled:opacity-30"
        >
          {triggering ? '...' : '▶'}
        </button>
      )}
    </div>
  );
}

function ServerCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs font-black text-zinc-400">{label}</span>
      </div>
      <p className="text-xs text-zinc-600">{detail}</p>
    </div>
  );
}

function FailedSection({ issues }: { issues: Issue[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-xs font-black text-zinc-600 uppercase tracking-widest mb-2"
      >
        <span>Failed ({issues.length})</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {issues.map(issue => (
            <div key={issue.number} className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-3 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-red-800 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-zinc-600 text-xs mr-1.5">#{issue.number}</span>
                <span className="text-zinc-500 text-sm">{issue.title}</span>
              </div>
              <p className="text-zinc-700 text-xs flex-shrink-0">remove ai-failed to retry</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
