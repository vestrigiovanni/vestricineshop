import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'admin_session';
const ADMIN_SESSION_VALUE = 'vestri_authorized_access_8923';

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
    const adminSession = request.cookies.get(COOKIE_NAME)?.value;

    // 3. If the user is not authenticated, redirect to the login page
    if (adminSession !== ADMIN_SESSION_VALUE) {
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
