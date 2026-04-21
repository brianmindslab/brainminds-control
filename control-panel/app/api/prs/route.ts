import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET(req: NextRequest) {
  const repo = req.nextUrl.searchParams.get('repo');
  if (!repo) return NextResponse.json({ error: 'Missing repo' }, { status: 400 });

  try {
    const out = execSync(
      `gh pr list --repo ${repo} --state open --json number,title,url,labels --limit 50`,
      {
        encoding: 'utf8',
        env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
      }
    );
    return NextResponse.json({ prs: JSON.parse(out) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
