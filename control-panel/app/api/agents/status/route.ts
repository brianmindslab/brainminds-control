import { NextResponse } from 'next/server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? 'http://localhost:3001';

export async function GET() {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/status`, { cache: 'no-store' });
    const data = await res.json();
    // data = { paused: bool, agents: [] }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ paused: false, agents: [] });
  }
}
