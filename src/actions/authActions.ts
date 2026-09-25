'use server';

import { cookies } from 'next/headers';
import { COOKIE_NAME, SESSION_DAYS, passwordMatches, signSession, verifySession } from '@/services/adminSession';

/**
 * Entra nel gestionale: se la chiave è giusta, il cookie porta un token firmato
 * che scade fra un anno. Niente più stringhe fisse scritte nel codice.
 */
export async function loginAdmin(password: string): Promise<{ success: boolean; error?: string }> {
  if (!passwordMatches(password)) return { success: false, error: 'Chiave non corretta.' };
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signSession(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return { success: true };
}

export async function logoutAdmin(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function checkAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(COOKIE_NAME)?.value, Date.now());
}
