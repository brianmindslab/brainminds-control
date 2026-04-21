'use client';

import { useEffect, useState } from 'react';

interface ServerData {
  builder: {
    ok: boolean;
    cpu: number;
    memPercent: number;
    memUsedGb: string;
    memTotalGb: string;
    uptime: number;
  };
  production: {
    ok: boolean;
    ip: string;
    status: number | null;
  };
}

export default function ServerHealth() {
  const [data, setData] = useState<ServerData | null>(null);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch('/api/servers');
        setData(await res.json());
      } catch {}
    }
    fetch_();
    const interval = setInterval(fetch_, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return <div className="text-xs text-zinc-600">Loading...</div>;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-zinc-400">Builder</span>
          <span className="w-2 h-2 rounded-full bg-green-500" />
        </div>
        <div className="text-xs text-zinc-600 space-y-0.5">
          <div>CPU: {data.builder.cpu}%</div>
          <div>RAM: {data.builder.memUsedGb}/{data.builder.memTotalGb}GB ({data.builder.memPercent}%)</div>
          <div>Up: {data.builder.uptime}m</div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-zinc-400">Production</span>
          <span className={`w-2 h-2 rounded-full ${data.production.ok ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <div className="text-xs text-zinc-600">
          {data.production.ok ? `HTTP ${data.production.status}` : 'Unreachable'}
        </div>
      </div>
    </div>
  );
}
