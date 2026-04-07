import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /admin/cassa is the POS terminal — opened in a dedicated window with no session cookie.
  // Access is already gated by the admin password modal in the Footer before APRI CASSA can be clicked.
  if (pathname.startsWith('/admin/cassa')) {
    return NextResponse.next();
  }

  // Protect all other /admin routes
  if (pathname.startsWith('/admin')) {
    const adminSession = request.cookies.get('admin_session')?.value;

    // Check for the specific secret session value set in the auth API
    if (adminSession !== 'vestri_authorized_access_8923') {
      const url = request.nextUrl.clone();
      url.pathname = '/'; // Redirect to home if not authorized
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
