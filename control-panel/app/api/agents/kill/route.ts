import { NextRequest, NextResponse } from 'next/server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest) {
  const { issueNumber } = await req.json();
  if (!issueNumber) return NextResponse.json({ error: 'Missing issueNumber' }, { status: 400 });

  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/kill/${issueNumber}`, { method: 'POST' });
    return NextResponse.json(await res.json());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
