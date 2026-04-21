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
  const [statuses, setStatuses] = useState<AgentInfo[]>([]);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch('/api/agents/status');
        setStatuses(await res.json());
      } catch {}
    }
    fetch_();
    const interval = setInterval(fetch_, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {AGENTS.map((agent) => {
        const running = statuses.find((s) => s.agentName === agent);
        return (
          <div key={agent} className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 capitalize">{agent}</span>
            <div className="flex items-center gap-1.5">
              {running ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-green-400">#{running.issueNumber}</span>
                </>
              ) : (
                <span className="w-2 h-2 rounded-full bg-zinc-700" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
