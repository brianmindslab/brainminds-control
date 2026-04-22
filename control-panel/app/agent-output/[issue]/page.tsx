'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function AgentOutputPage() {
  const params   = useParams<{ issue: string }>();
  const router   = useRouter();
  const issue    = params.issue;
  const [output, setOutput]   = useState<string[]>([]);
  const [agent,  setAgent]    = useState<string>('');
  const [start,  setStart]    = useState<string>('');
  const [elapsed, setElapsed] = useState('00:00');
  const [file,   setFile]     = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function poll() {
      try {
        const res  = await fetch('/api/agents/status');
        const data = await res.json();
        const mine = (data.agents ?? []).find((a: {issueNumber: number}) => String(a.issueNumber) === issue);
        if (mine) {
          setAgent(mine.agentName ?? '');
          setStart(mine.startedAt ?? '');
          setFile(mine.currentFile ?? null);
          setOutput(mine.output ?? []);
        }
      } catch {}
    }
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [issue]);

  useEffect(() => {
    if (!start) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
      setElapsed(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(id);
  }, [start]);

  useEffect(() => {
    const es = new EventSource(`/api/agents/stream?issue=${issue}`);
    es.onmessage = (e) => setOutput(prev => [...prev, JSON.parse(e.data)]);
    return () => es.close();
  }, [issue]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Header */}
      <div className="flex-shrink-0 bg-zinc-950 border-b border-zinc-800 px-4 py-3 safe-top">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.back()}
            className="text-zinc-500 text-2xl w-10 h-10 flex items-center justify-center rounded-xl active:bg-zinc-800"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-black text-zinc-100">Issue #{issue}</span>
              {agent && <span className="text-zinc-500 text-sm capitalize">{agent}</span>}
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
            {file && <p className="text-xs text-zinc-600 truncate">{file}</p>}
          </div>
          <span className="font-mono text-sm text-zinc-500 flex-shrink-0">{elapsed}</span>
        </div>
      </div>

      {/* Terminal */}
      <div className="flex-1 overflow-y-auto terminal p-4">
        <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed">
          {output.join('') || <span className="text-green-900">Waiting for output…</span>}
        </pre>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
