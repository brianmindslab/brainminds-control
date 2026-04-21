import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function POST(req: NextRequest) {
  const { prNumber, repo } = await req.json();
  if (!prNumber || !repo) return NextResponse.json({ error: 'Missing prNumber or repo' }, { status: 400 });

  try {
    execSync(`gh pr merge ${prNumber} --squash --repo ${repo} --delete-branch`, {
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
