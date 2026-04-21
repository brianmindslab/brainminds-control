import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.CONTROL_PANEL_PASSWORD ?? 'changeme';

  if (password !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('cp_auth', expected, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
