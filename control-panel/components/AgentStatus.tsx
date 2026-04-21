'use client';

import { useEffect, useState } from 'react';

interface AgentInfo {
  issueNumber: number;
  agentName: string;
  startedAt: string;
  currentFile: string | null;
}

const AGENTS = ['claude', 'gemini', 'codex'];

export default function AgentStatus() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [paused, setPaused] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [killing, setKilling] = useState<number | null>(null);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/agents/status');
      const data = await res.json();
      setAgents(data.agents ?? []);
      setPaused(data.paused ?? false);
    } catch {}
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  async function togglePause() {
    setToggling(true);
    try {
      const action = paused ? 'resume' : 'pause';
      await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      setPaused(!paused);
    } finally {
      setToggling(false);
    }
  }

  async function killAgent(issueNumber: number) {
    setKilling(issueNumber);
    try {
      await fetch('/api/agents/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueNumber }),
      });
      await fetchStatus();
    } finally {
      setKilling(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Pause / Resume toggle */}
      <button
        onClick={togglePause}
        disabled={toggling}
        className={`w-full text-xs font-black rounded-xl py-2 px-3 transition-colors disabled:opacity-50 ${
          paused
            ? 'bg-green-800 hover:bg-green-700 text-green-100'
            : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
        }`}
      >
        {toggling ? '...' : paused ? '▶ Resume Orchestrator' : '⏸ Pause Orchestrator'}
      </button>

      {paused && (
        <p className="text-xs text-yellow-400 text-center">Orchestrator paused — no new issues picked up</p>
      )}

      {/* Per-agent status rows */}
      <div className="flex flex-col gap-2">
        {AGENTS.map((agent) => {
          const running = agents.find((s) => s.agentName === agent);
          return (
            <div key={agent} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`w-2 h-2 flex-shrink-0 rounded-full ${
                    running ? 'bg-green-500 animate-pulse' : 'bg-zinc-700'
                  }`}
                />
                <span className="text-xs text-zinc-400 capitalize">{agent}</span>
                {running && (
                  <span className="text-xs text-green-400 truncate">#{running.issueNumber}</span>
                )}
              </div>

              {running && (
                <button
                  onClick={() => killAgent(running.issueNumber)}
                  disabled={killing === running.issueNumber}
                  className="text-xs bg-red-900/60 hover:bg-red-800 text-red-300 font-black rounded-lg px-2 py-0.5 flex-shrink-0 transition-colors disabled:opacity-50"
                >
                  {killing === running.issueNumber ? '...' : 'Stop'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
