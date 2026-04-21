'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Label {
  name: string;
}

interface Issue {
  number: number;
  title: string;
  body: string;
  labels: Label[];
}

interface Props {
  issue: Issue;
  projectId: string;
  onTriggered: () => void;
}

const AGENT_LABELS: Record<string, string> = {
  'for-claude-code': 'Claude',
  'for-codex': 'Codex',
};

const LABEL_COLORS: Record<string, string> = {
  'in-progress': 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  'for-claude-code': 'bg-orange-900/50 text-orange-300 border-orange-800',
  'for-codex': 'bg-green-900/50 text-green-300 border-green-800',
  'needs-review': 'bg-pink-900/50 text-pink-300 border-pink-800',
  'ai-task': 'bg-blue-900/50 text-blue-300 border-blue-800',
};

export default function IssueCard({ issue, projectId, onTriggered }: Props) {
  const [triggering, setTriggering] = useState(false);
  const isActive = issue.labels.some((l) => l.name === 'in-progress');
  const agentLabel = issue.labels.find((l) => AGENT_LABELS[l.name]);

  async function handleRun() {
    setTriggering(true);
    await fetch('/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueNumber: issue.number, projectId }),
    });
    setTriggering(false);
    onTriggered();
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-zinc-500 text-sm">#{issue.number}</span>
            {isActive && (
              <span className="flex items-center gap-1 text-xs text-yellow-400">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                Running
              </span>
            )}
          </div>
          <p className="text-zinc-100 text-sm font-medium leading-snug">{issue.title}</p>

          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {issue.labels.map((label) => (
              <span
                key={label.name}
                className={`text-xs border rounded-full px-2 py-0.5 ${
                  LABEL_COLORS[label.name] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {label.name}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          {isActive ? (
            <Link
              href={`/agent-output/${issue.number}`}
              className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-black rounded-lg px-3 py-1.5 transition-colors text-center"
            >
              Watch ▶
            </Link>
          ) : (
            <button
              onClick={handleRun}
              disabled={triggering || !agentLabel}
              className="text-xs bg-zinc-100 hover:bg-white text-zinc-900 font-black rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {triggering ? '...' : '▶ Run'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
