import { NextRequest, NextResponse } from 'next/server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest) {
  const { action } = await req.json();
  if (action !== 'pause' && action !== 'resume') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/${action}`, { method: 'POST' });
    return NextResponse.json(await res.json());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
