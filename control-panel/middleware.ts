import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PASSWORD = process.env.CONTROL_PANEL_PASSWORD ?? 'changeme';
const COOKIE = 'cp_auth';

export function middleware(req: NextRequest) {
  // API routes don't need the cookie but still check for the header token
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie === PASSWORD) return NextResponse.next();

  // Allow the login page itself
  if (req.nextUrl.pathname === '/login') return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)'],
};
