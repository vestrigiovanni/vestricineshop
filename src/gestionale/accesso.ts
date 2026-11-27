'use server';

import { cookies, headers } from 'next/headers';
import { COOKIE, GIORNI, chiaveGiusta, chiavi, creaFreno, firmaSessione } from './sessione';

const freno = creaFreno();

export type Esito = { ok: true } | { ok: false; errore: string };

/** Entra nel gestionale: con la chiave giusta il cookie porta un token firmato che scade fra un anno. */
export async function entra(chiave: string): Promise<Esito> {
  const k = chiavi();
  if (!k) return { ok: false, errore: 'Il gestionale non è ancora configurato: mancano ADMIN_PASSWORD e ADMIN_SESSION_SECRET.' };

  const h = await headers();
  const chi = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'locale';
  const ora = Date.now();
  if (freno.fermo(chi, ora)) return { ok: false, errore: 'Troppi tentativi sbagliati. Riprova fra dieci minuti.' };

  if (typeof chiave !== 'string' || !chiaveGiusta(chiave, k.password)) {
    freno.sbagliata(chi, ora);
    return { ok: false, errore: 'Chiave non corretta.' };
  }
  freno.giusta(chi);
  (await cookies()).set(COOKIE, firmaSessione(ora, k.segreto), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GIORNI * 24 * 60 * 60,
  });
  return { ok: true };
}

export async function esci(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
