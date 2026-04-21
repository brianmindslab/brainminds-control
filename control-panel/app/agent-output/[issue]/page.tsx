'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

export default function AgentOutputPage() {
  const params = useParams<{ issue: string }>();
  const issueNumber = params.issue;
  const [output, setOutput] = useState<string[]>([]);
  const [agentName, setAgentName] = useState<string>('');
  const [startedAt, setStartedAt] = useState<string>('');
  const [elapsed, setElapsed] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch status
  useEffect(() => {
    async function fetchStatus() {
      const res = await fetch('/api/agents/status');
      const statuses = await res.json();
      const mine = statuses.find((s: { issueNumber: number }) => String(s.issueNumber) === issueNumber);
      if (mine) {
        setAgentName(mine.agentName ?? '');
        setStartedAt(mine.startedAt ?? '');
        setCurrentFile(mine.currentFile ?? null);
        setOutput(mine.output ?? []);
      }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [issueNumber]);

  // Elapsed timer
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      const m = Math.floor(secs / 60).toString().padStart(2, '0');
      const s = (secs % 60).toString().padStart(2, '0');
      setElapsed(`${m}:${s}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // SSE stream
  useEffect(() => {
    const es = new EventSource(`/api/agents/stream?issue=${issueNumber}`);
    es.onmessage = (e) => {
      const chunk = JSON.parse(e.data);
      setOutput((prev) => [...prev, chunk]);
    };
    return () => es.close();
  }, [issueNumber]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-black text-zinc-100">Issue #{issueNumber}</h1>
          {agentName && (
            <p className="text-zinc-500 text-sm mt-0.5">
              Agent: <span className="text-zinc-300">{agentName}</span>
              {currentFile && (
                <> · <span className="text-zinc-400">{currentFile}</span></>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {startedAt && (
            <span className="text-zinc-500 text-sm font-mono">{elapsed}</span>
          )}
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        </div>
      </div>

      {/* Terminal */}
      <div className="flex-1 overflow-y-auto terminal p-6">
        <pre className="whitespace-pre-wrap break-words text-sm">
          {output.join('')}
          {output.length === 0 && (
            <span className="text-green-700">Waiting for agent output...</span>
          )}
        </pre>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
