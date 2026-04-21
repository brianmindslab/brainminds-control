import { NextRequest, NextResponse } from 'next/server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest) {
  const { issueNumber, projectId } = await req.json();
  if (!issueNumber) return NextResponse.json({ error: 'Missing issueNumber' }, { status: 400 });

  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueNumber, projectId }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
