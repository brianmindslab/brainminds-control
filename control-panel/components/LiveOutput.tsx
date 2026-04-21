'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  issueNumber: number;
  initialOutput?: string[];
}

export default function LiveOutput({ issueNumber, initialOutput = [] }: Props) {
  const [output, setOutput] = useState<string[]>(initialOutput);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/agents/stream?issue=${issueNumber}`);
    es.onmessage = (e) => {
      setOutput((prev) => [...prev, JSON.parse(e.data)]);
    };
    return () => es.close();
  }, [issueNumber]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  return (
    <div className="terminal h-full overflow-y-auto p-4 rounded-xl">
      <pre className="whitespace-pre-wrap break-words text-sm">
        {output.join('')}
        {output.length === 0 && <span className="text-green-800">No output yet...</span>}
      </pre>
      <div ref={bottomRef} />
    </div>
  );
}
