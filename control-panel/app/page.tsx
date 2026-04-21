'use client';

import { useEffect, useState } from 'react';
import IssueCard from '@/components/IssueCard';
import AgentStatus from '@/components/AgentStatus';
import ServerHealth from '@/components/ServerHealth';

interface Issue {
  number: number;
  title: string;
  body: string;
  labels: { name: string }[];
}

interface PR {
  number: number;
  title: string;
  url: string;
}

interface Project {
  id: string;
  name: string;
  repo: string;
}

const PROJECTS: Project[] = [
  { id: 'braintime', name: 'Braintime LMS', repo: 'brianmindslab/braintime' },
];

export default function Dashboard() {
  const [selectedProject, setSelectedProject] = useState<Project>(PROJECTS[0]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [prs, setPrs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/issues?repo=${selectedProject.repo}`).then((r) => r.json()),
      fetch(`/api/prs?repo=${selectedProject.repo}`).then((r) => r.json()),
    ])
      .then(([issueData, prData]) => {
        setIssues(issueData.issues ?? []);
        setPrs(prData.prs ?? []);
      })
      .finally(() => setLoading(false));
  }, [selectedProject]);

  const grouped = {
    P0: issues.filter((i) => i.labels.some((l) => l.name === 'P0')),
    P1: issues.filter((i) => i.labels.some((l) => l.name === 'P1')),
    P2: issues.filter((i) => i.labels.some((l) => l.name === 'P2')),
    other: issues.filter((i) => !i.labels.some((l) => ['P0', 'P1', 'P2'].includes(l.name))),
  };

  async function mergePR(prNumber: number) {
    await fetch('/api/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prNumber, repo: selectedProject.repo }),
    });
    setPrs((prev) => prev.filter((p) => p.number !== prNumber));
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="font-black text-zinc-100 text-sm tracking-tight">BRAINMINDS</h1>
          <p className="text-zinc-500 text-xs mt-0.5">Orchestrator</p>
        </div>

        {/* Projects */}
        <div className="p-4 border-b border-zinc-800">
          <p className="text-zinc-500 text-xs font-black uppercase tracking-wider mb-2">Projects</p>
          {PROJECTS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProject(p)}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                selectedProject.id === p.id
                  ? 'bg-zinc-700 text-zinc-100 font-black'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {p.name}
              <span className="ml-2 text-xs text-zinc-500">{issues.length}</span>
            </button>
          ))}
        </div>

        {/* Agent Status */}
        <div className="p-4 border-b border-zinc-800">
          <p className="text-zinc-500 text-xs font-black uppercase tracking-wider mb-3">Agents</p>
          <AgentStatus />
        </div>

        {/* Server Health */}
        <div className="p-4">
          <p className="text-zinc-500 text-xs font-black uppercase tracking-wider mb-3">Servers</p>
          <ServerHealth />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-zinc-950 p-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-black text-zinc-100 mb-6">{selectedProject.name}</h2>

          {loading ? (
            <div className="text-zinc-500 text-sm">Loading issues...</div>
          ) : (
            <>
              {/* Issues by priority */}
              {(['P0', 'P1', 'P2', 'other'] as const).map((priority) => {
                const group = grouped[priority];
                if (!group.length) return null;
                return (
                  <div key={priority} className="mb-8">
                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-wider mb-3">
                      {priority === 'other' ? 'Other' : priority}
                    </h3>
                    <div className="flex flex-col gap-3">
                      {group.map((issue) => (
                        <IssueCard
                          key={issue.number}
                          issue={issue}
                          projectId={selectedProject.id}
                          onTriggered={() => {}}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Open PRs */}
              {prs.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-xs font-black text-zinc-500 uppercase tracking-wider mb-3">Open PRs</h3>
                  <div className="flex flex-col gap-3">
                    {prs.map((pr) => (
                      <div
                        key={pr.number}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between"
                      >
                        <div>
                          <span className="text-zinc-500 text-sm mr-2">#{pr.number}</span>
                          <span className="text-zinc-100 text-sm">{pr.title}</span>
                        </div>
                        <div className="flex gap-2">
                          <a
                            href={pr.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg px-3 py-1.5"
                          >
                            View diff
                          </a>
                          <button
                            onClick={() => mergePR(pr.number)}
                            className="text-xs bg-green-800 hover:bg-green-700 text-green-100 font-black rounded-lg px-3 py-1.5 transition-colors"
                          >
                            Merge ▶
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {issues.length === 0 && prs.length === 0 && (
                <div className="text-zinc-600 text-sm">No open issues or PRs with ai-task label.</div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
