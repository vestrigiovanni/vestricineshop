import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { COOKIE_NAME, verifySession } from '@/services/adminSession';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Skip checks for the login page to avoid infinite redirect loops
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  // 2. Check if path is protected (/admin or /display-esterno)
  const isProtectedAdmin = pathname.startsWith('/admin');
  const isProtectedDisplay = pathname.startsWith('/display-esterno');

  if (isProtectedAdmin || isProtectedDisplay) {
    // 3. Il cookie deve portare un token firmato e non scaduto
    if (!verifySession(request.cookies.get(COOKIE_NAME)?.value, Date.now())) {
      const loginUrl = new URL('/admin/login', request.url);
      
      // Keep track of the original page (including query strings) to redirect back after login
      const fullRedirectPath = `${pathname}${search}`;
      loginUrl.searchParams.set('redirect', fullRedirectPath);

      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// Next.js proxy routing matcher config (replaces the deprecated middleware matcher)
export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/display-esterno',
  ],
};
