import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * La sessione del gestionale.
 *
 * Prima il cookie valeva una stringa fissa scritta nel codice: chiunque la
 * leggesse poteva entrare, per sempre. Ora è un token firmato con un segreto
 * che sta nelle variabili d'ambiente, e porta dentro la sua scadenza:
 * `v1.<scadenza in ms>.<firma>`. Allungarla a mano rompe la firma.
 *
 * Le variabili da mettere su Vercel (e in `.env.local`):
 * - `ADMIN_PASSWORD`: la chiave per entrare;
 * - `ADMIN_SESSION_SECRET`: una stringa lunga e casuale per firmare i cookie.
 *
 * Finché non ci sono, vale la chiave di prima e il segreto se ne ricava: il
 * gestionale non resta chiuso fuori, ma non è ancora al sicuro.
 */
export const COOKIE_NAME = 'admin_session';

/** Un anno, come prima: al banco non si vuole rifare il login ogni settimana. */
export const SESSION_DAYS = 365;

const LEGACY_PASSWORD = '121212';
const DAY_MS = 24 * 60 * 60 * 1000;

let warned = false;
function warnOnce() {
  if (warned || process.env.NODE_ENV !== 'production') return;
  warned = true;
  console.warn('[admin] ADMIN_PASSWORD o ADMIN_SESSION_SECRET mancano: il gestionale usa ancora la chiave di prima.');
}

export function adminPassword(): string {
  if (!process.env.ADMIN_PASSWORD) warnOnce();
  return process.env.ADMIN_PASSWORD || LEGACY_PASSWORD;
}

function sessionSecret(): string {
  if (!process.env.ADMIN_SESSION_SECRET) warnOnce();
  return process.env.ADMIN_SESSION_SECRET || `vestri-cabina:${adminPassword()}`;
}

function sign(payload: string, key: string): Buffer {
  return createHmac('sha256', key).update(payload).digest();
}

export function signSession(nowMs: number, days: number = SESSION_DAYS, key: string = sessionSecret()): string {
  const payload = `v1.${nowMs + days * DAY_MS}`;
  return `${payload}.${sign(payload, key).toString('base64url')}`;
}

export function verifySession(token: string | undefined, nowMs: number, key: string = sessionSecret()): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < nowMs) return false;
  const expected = sign(`v1.${parts[1]}`, key);
  const given = Buffer.from(parts[2], 'base64url');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Confronto a tempo costante: non dice, col tempo che impiega, quante lettere erano giuste. */
export function passwordMatches(input: string, expected: string = adminPassword()): boolean {
  const a = sign(input, 'password');
  const b = sign(expected, 'password');
  return timingSafeEqual(a, b) && input.length === expected.length;
}
