import {
  ITEM_INTERO_ID, ITEM_VIP_ID, OSPITE, motivoRifiuto, nomeDi,
  type PostoPretix, type Quota, type SottoeventoPretix,
} from './regole';

/**
 * Pretix, solo dal server. Il gettone `PRETIX_TOKEN` non esce mai di qui: il
 * browser parla con le route del sito (`/api/seats`, `/api/book`), non con
 * queste funzioni. Nella v1 questo file era `'use server'`, e così dal browser
 * si poteva chiamare qualunque sua funzione, anche cancellare uno spettacolo.
 *
 * Dalla v1: al massimo dieci richieste insieme; a un 429 si ferma tutto per
 * il tempo che dice Pretix e si riprende; le letture si ricordano 5 minuti,
 * tranne posti e quote, che si leggono sempre dal vivo.
 */
const API = 'https://pretix.eu/api/v1';
const ORGANIZZATORE = 'vestri';
const EVENTO = 'npkez';
const EVENTO_URL = `${API}/organizers/${ORGANIZZATORE}/events/${EVENTO}`;

/** Una risposta di Pretix che non è andata: con lo stato e il corpo, per decidere che cosa dire. */
export class ErrorePretix extends Error {
  constructor(readonly stato: number, readonly corpo: unknown, dove: string) {
    super(`Pretix ${stato} su ${dove}`);
  }
}

const dorme = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Il cancello: dieci alla volta, e fermi tutti al 429 ──────────────────

const MASSIMO_INSIEME = 10;
let inVolo = 0;
const fila: (() => void)[] = [];
let fermiFinoA = 0;

async function entra() {
  const attesa = fermiFinoA - Date.now();
  if (attesa > 0) await dorme(attesa);
  if (inVolo < MASSIMO_INSIEME) { inVolo++; return; }
  await new Promise<void>(r => fila.push(r));
}
function esce() {
  const prossimo = fila.shift();
  if (prossimo) prossimo(); else inVolo--;
}

// ─── La memoria corta delle letture ───────────────────────────────────────

const RICORDA_MS = 5 * 60 * 1000;
const memoria = new Map<string, { quando: number; dati: unknown }>();

/**
 * Una chiamata a Pretix. `percorso` comincia da `/organizers/…` per le cose
 * dell'organizzatore (le piante delle sale), altrimenti è dentro l'evento.
 */
export async function pretix<T = any>(percorso: string, opzioni: RequestInit = {}, { dalVivo = false } = {}): Promise<T> {
  const gettone = process.env.PRETIX_TOKEN;
  if (!gettone) throw new Error('Manca PRETIX_TOKEN nelle chiavi del sito.');

  const lettura = (!opzioni.method || opzioni.method === 'GET') && !opzioni.body;
  if (lettura && !dalVivo) {
    const m = memoria.get(percorso);
    if (m && Date.now() - m.quando < RICORDA_MS) return m.dati as T;
  }

  const url = percorso.startsWith('http') ? percorso : percorso.startsWith('/organizers/') ? `${API}${percorso}` : `${EVENTO_URL}${percorso}`;
  const headers = new Headers(opzioni.headers);
  headers.set('Authorization', gettone.startsWith('Token ') ? gettone : `Token ${gettone}`);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');

  await entra();
  try {
    for (let tentativo = 0; ; tentativo++) {
      let r: Response;
      try {
        r = await fetch(url, { ...opzioni, headers, cache: 'no-store' });
      } catch (e) {
        // La rete: si riprova un paio di volte, poi si arrende.
        if (tentativo >= 2) throw e;
        await dorme(500 * 2 ** tentativo);
        continue;
      }
      if (r.status === 429 && tentativo < 3) {
        const dopo = Number(r.headers.get('Retry-After'));
        const ms = (dopo > 0 ? dopo * 1000 : 2000 * 2 ** tentativo) + 500;
        fermiFinoA = Date.now() + ms;
        console.error(`[pretix] 429: tutti fermi per ${ms} ms`);
        await dorme(ms);
        continue;
      }
      if (!r.ok) {
        const testo = await r.text();
        let corpo: unknown = testo;
        try { corpo = JSON.parse(testo); } catch { /* resta testo */ }
        // Gli errori del server di Pretix si riprovano; quelli della richiesta no.
        if (r.status >= 500 && tentativo < 2) { await dorme(500 * 2 ** tentativo); continue; }
        throw new ErrorePretix(r.status, corpo, percorso);
      }
      if (r.status === 204) return null as T;
      const dati = await r.json();
      if (lettura) memoria.set(percorso, { quando: Date.now(), dati });
      return dati as T;
    }
  } finally {
    esce();
  }
}

/** Tutte le pagine di un elenco di Pretix. */
async function tutte<T>(percorso: string, dalVivo: boolean): Promise<T[]> {
  const out: T[] = [];
  let prossima: string | null = percorso;
  while (prossima) {
    const pagina: { results?: T[]; next?: string | null } | T[] = await pretix(prossima, {}, { dalVivo });
    if (Array.isArray(pagina)) { out.push(...pagina); break; }
    out.push(...(pagina.results ?? []));
    prossima = pagina.next ?? null;
    if (prossima) await dorme(50);
  }
  return out;
}

// ─── Le letture ───────────────────────────────────────────────────────────

/** Gli spettacoli, dal più vicino. `futuri`: solo quelli che non sono ancora finiti. */
export function spettacoli({ futuri = true, dalVivo = false } = {}) {
  const q = new URLSearchParams({ ordering: 'date_from', limit: '100' });
  if (futuri) q.set('ends_after', new Date().toISOString());
  return tutte<SottoeventoPretix>(`/subevents/?${q}`, dalVivo);
}

/** Uno spettacolo, o null se Pretix non lo conosce. */
export async function spettacolo(id: number): Promise<SottoeventoPretix | null> {
  try {
    return await pretix<SottoeventoPretix>(`/subevents/${id}/`);
  } catch (e) {
    if (e instanceof ErrorePretix && e.stato === 404) return null;
    throw e;
  }
}

/** Le quote di uno spettacolo, dal vivo. Le quote di tutto l'evento sono più di 40 pagine: non si chiedono mai. */
export async function quote(spettacoloId: number): Promise<Quota[]> {
  const d = await pretix<{ results?: Quota[] }>(`/quotas/?subevent=${spettacoloId}&with_availability=true`, {}, { dalVivo: true });
  return d?.results ?? [];
}

/** I nomi delle sale, per numero di pianta. Le sale di prova ("SALA 0", "TEST") non ci sono. */
export async function sale(): Promise<Record<number, string>> {
  const piante = await tutte<{ id: number; name?: { it?: string } | string }>(`/organizers/${ORGANIZZATORE}/seatingplans/`, false);
  const out: Record<number, string> = {};
  for (const p of piante) {
    const nome = nomeDi(p) === 'Sconosciuto' ? 'Sala' : nomeDi(p);
    if (/SALA 0|TEST/i.test(nome)) continue;
    out[p.id] = nome;
  }
  return out;
}

/** I posti di uno spettacolo, dal vivo. Uno spettacolo che Pretix non conosce non ha posti. */
export async function postiDi(spettacoloId: number): Promise<PostoPretix[]> {
  try {
    return await tutte<PostoPretix>(`/subevents/${spettacoloId}/seats/`, true);
  } catch (e) {
    if (e instanceof ErrorePretix && e.stato === 404) return [];
    throw e;
  }
}

export interface Ordine {
  code: string;
  secret: string;
  email: string;
  positions: { id: number; secret: string; subevent: number; seat?: { name?: string; seat_guid?: string } | null; item: number }[];
}

/** Un ordine, per il biglietto. */
export function ordine(codice: string) {
  return pretix<Ordine>(`/orders/${encodeURIComponent(codice)}/`, {}, { dalVivo: true });
}

// ─── Le scritture ─────────────────────────────────────────────────────────

/** Un rifiuto di Pretix detto a chi prenota. */
export class PrenotazioneRifiutata extends Error {}

/**
 * Prenota i posti: un ordine a 0 €, un intero per posto. Le poltrone VIP non
 * si prenotano dal sito, e qui si controlla anche se il browser ci prova.
 * Pretix manda il biglietto per email solo a chi ha lasciato un indirizzo vero.
 */
export async function prenota(email: string, posti: string[], spettacoloId: number): Promise<Ordine> {
  const tutti = await postiDi(spettacoloId);
  const vip = new Set(tutti.filter(s => s.product === ITEM_VIP_ID).map(s => s.seat_guid));
  if (posti.some(g => vip.has(g))) throw new PrenotazioneRifiutata('Le poltrone VIP non si prenotano dal sito.');

  try {
    return await pretix<Ordine>('/orders/', {
      method: 'POST',
      body: JSON.stringify({
        email,
        locale: 'it',
        send_email: email !== OSPITE,
        positions: posti.map(seat => ({ item: ITEM_INTERO_ID, seat, subevent: spettacoloId, price: '0.00' })),
      }),
    });
  } catch (e) {
    if (e instanceof ErrorePretix && e.stato === 400) throw new PrenotazioneRifiutata(motivoRifiuto(e.corpo));
    throw e;
  }
}

/** Cambia uno spettacolo su Pretix (la sync rimanda lì i metadati del film). */
export function cambiaSpettacolo(id: number, cambi: Record<string, unknown>) {
  return pretix(`/subevents/${id}/`, { method: 'PATCH', body: JSON.stringify(cambi) });
}
