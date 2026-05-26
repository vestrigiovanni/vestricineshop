'use server';

import { cookies } from 'next/headers';

const MASTER_PASSWORD = '121212';
const ADMIN_SESSION_VALUE = 'vestri_authorized_access_8923';
const COOKIE_NAME = 'admin_session';

/**
 * Validates the admin password and sets a secure HTTP-only session cookie for 1 year.
 */
export async function loginAdmin(password: string): Promise<{ success: boolean; error?: string }> {
  if (password === MASTER_PASSWORD) {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, ADMIN_SESSION_VALUE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year (365 days)
    });
    return { success: true };
  }
  return { success: false, error: 'Password non corretta.' };
}

/**
 * Clears the admin session cookie.
 */
export async function logoutAdmin(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Server Action to check if the current user has a valid admin session.
 */
export async function checkAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME)?.value;
  return session === ADMIN_SESSION_VALUE;
}
