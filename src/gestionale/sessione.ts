import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * La sessione del gestionale: un token firmato che porta dentro la scadenza,
 * `v1.<scadenza in ms>.<firma>`. Allungarla a mano rompe la firma.
 *
 * Nella v1 c'era una chiave di riserva scritta nel codice (`121212`) e, senza
 * `ADMIN_SESSION_SECRET`, il segreto si ricavava dalla chiave. Qui niente
 * riserve: senza le due variabili il gestionale resta chiuso e il login lo dice.
 *
 * - `ADMIN_PASSWORD`: la chiave per entrare;
 * - `ADMIN_SESSION_SECRET`: una stringa lunga e casuale (almeno 32 caratteri)
 *   per firmare i cookie. Cambiarla fa uscire tutti.
 */
export const COOKIE = 'admin_session';

/** Un anno, come nella v1: al banco non si vuole rifare il login ogni settimana. */
export const GIORNI = 365;

const GIORNO_MS = 24 * 60 * 60 * 1000;

export interface Chiavi {
  password: string;
  segreto: string;
}

/** Le due variabili, se ci sono e sono serie. Se no `null`: il gestionale resta chiuso. */
export function chiavi(env: Record<string, string | undefined> = process.env): Chiavi | null {
  const password = env.ADMIN_PASSWORD?.trim();
  const segreto = env.ADMIN_SESSION_SECRET?.trim();
  if (!password || !segreto || segreto.length < 32) return null;
  return { password, segreto };
}

function firma(testo: string, segreto: string): Buffer {
  return createHmac('sha256', segreto).update(testo).digest();
}

export function firmaSessione(oraMs: number, segreto: string, giorni: number = GIORNI): string {
  const carico = `v1.${oraMs + giorni * GIORNO_MS}`;
  return `${carico}.${firma(carico, segreto).toString('base64url')}`;
}

export function sessioneValida(token: string | undefined, oraMs: number, segreto: string | undefined): boolean {
  if (!token || !segreto) return false;
  const parti = token.split('.');
  if (parti.length !== 3 || parti[0] !== 'v1') return false;
  const scade = Number(parti[1]);
  if (!Number.isFinite(scade) || scade < oraMs) return false;
  const attesa = firma(`v1.${parti[1]}`, segreto);
  const data = Buffer.from(parti[2], 'base64url');
  return data.length === attesa.length && timingSafeEqual(data, attesa);
}

/** Confronto a tempo costante: il tempo che impiega non dice quante lettere erano giuste. */
export function chiaveGiusta(scritta: string, vera: string): boolean {
  const a = firma(scritta, 'chiave');
  const b = firma(vera, 'chiave');
  return timingSafeEqual(a, b) && scritta.length === vera.length;
}

// ─── Troppi tentativi ─────────────────────────────────────────────────────

const FINESTRA = 10 * 60 * 1000;
const TENTATIVI = 8;

/**
 * Chi sbaglia la chiave troppe volte di fila aspetta dieci minuti. Vale per
 * istanza del server (su Vercel ce ne possono essere più d'una): non è un muro,
 * è un freno che rende inutile provare chiavi a raffica.
 */
export function creaFreno(tentativi = TENTATIVI, finestra = FINESTRA) {
  const errori = new Map<string, number[]>();
  const recenti = (chi: string, ora: number) => (errori.get(chi) ?? []).filter(t => ora - t < finestra);
  return {
    fermo(chi: string, ora: number): boolean {
      return recenti(chi, ora).length >= tentativi;
    },
    sbagliata(chi: string, ora: number) {
      errori.set(chi, [...recenti(chi, ora), ora]);
      if (errori.size > 5000) errori.clear();
    },
    giusta(chi: string) {
      errori.delete(chi);
    },
  };
}
