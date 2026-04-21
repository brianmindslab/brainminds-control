import { execSync } from 'child_process';

function GH(cmd) {
  return execSync(`gh ${cmd}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
  });
}

export function getOpenIssues(repo) {
  const out = GH(
    `issue list --repo ${repo} --label "ai-task" --state open ` +
    `--json number,title,body,labels --limit 50`
  );
  return JSON.parse(out);
}

export function getPRsNeedingReview(repo) {
  const out = GH(
    `pr list --repo ${repo} --label "needs-review" --state open ` +
    `--json number,title,labels --limit 20`
  );
  return JSON.parse(out);
}

export function labelIssue(repo, number, addLabels = [], removeLabels = []) {
  if (addLabels.length) {
    GH(`issue edit ${number} --repo ${repo} --add-label "${addLabels.join(',')}"`);
  }
  if (removeLabels.length) {
    GH(`issue edit ${number} --repo ${repo} --remove-label "${removeLabels.join(',')}"`);
  }
}

export function commentOnPR(repo, number, body) {
  const escaped = body.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  GH(`pr comment ${number} --repo ${repo} --body "${escaped}"`);
}

export function ensureLabelsExist(repo) {
  const needed = ['ai-task', 'for-claude-code', 'for-codex', 'in-progress', 'needs-review', 'deployed', 'ai-failed'];
  const colors = {
    'ai-task': '0075ca',
    'for-claude-code': 'd93f0b',
    'for-codex': '0e8a16',
    'in-progress': 'e4e669',
    'needs-review': 'cc317c',
    'deployed': '006b75',
    'ai-failed': 'b60205',
  };

  let existing = [];
  try {
    existing = JSON.parse(GH(`label list --repo ${repo} --json name --limit 100`)).map(l => l.name);
  } catch {}

  for (const label of needed) {
    if (!existing.includes(label)) {
      try {
        GH(`label create "${label}" --repo ${repo} --color "${colors[label]}" --force`);
        console.log(`[github] created label: ${label}`);
      } catch (err) {
        console.warn(`[github] could not create label ${label}:`, err.message);
      }
    }
  }
}
