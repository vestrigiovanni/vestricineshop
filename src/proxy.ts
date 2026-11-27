import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, chiavi, sessioneValida } from '@/gestionale/sessione';

/**
 * Le stanze del gestionale si aprono solo col cookie firmato: chi non ce l'ha
 * va al login, che poi lo riporta dov'era. Le azioni del server controllano
 * il cookie di nuovo per conto loro (`guardia.ts`): questa è la porta, non
 * l'unica serratura.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();

  const segreto = chiavi()?.segreto;
  if (sessioneValida(request.cookies.get(COOKIE)?.value, Date.now(), segreto)) return NextResponse.next();

  const login = new URL('/admin/login', request.url);
  login.searchParams.set('redirect', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ['/admin', '/admin/:path*'] };
