import { NextRequest } from 'next/server';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const issue = req.nextUrl.searchParams.get('issue');
  if (!issue) return new Response('Missing issue', { status: 400 });

  const upstream = await fetch(`${ORCHESTRATOR_URL}/stream/${issue}`, {
    headers: { Accept: 'text/event-stream' },
  });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
