/**
 * Le regole della biglietteria, senza rete e senza database: come si leggono
 * le risposte di Pretix (quote, posti, spettacoli) e come si scrivono i testi
 * della prenotazione. Portate dalla v1 (pretix.ts, sync.service.ts,
 * SeatMap.tsx, bookingText.ts, ratingUtils.ts) e provate in `regole.test.ts`.
 *
 * I biglietti sono gratuiti: un solo prodotto prenotabile (l'intero, a 0 €).
 * La poltrona VIP non si prenota dal sito.
 */

/** I prodotti dell'evento Pretix `vestri/npkez`. */
export const ITEM_INTERO_ID = 264975;
export const ITEM_VIP_ID = 344653;

/**
 * L'indirizzo con cui si registra chi prenota senza email. Non riceve mai
 * posta (Pretix non manda niente a lui): è un'etichetta, la stessa dell'app
 * iOS, che serve a riconoscere gli ordini senza email. Per questo resta `.it`.
 */
export const OSPITE = 'guest_ANONIMO@vestricinema.it';

/** La vendita chiude due minuti prima dell'inizio. */
export const CHIUSURA_MINUTI = 2;

// ─── Spettacoli ───────────────────────────────────────────────────────────

/** Il film di uno spettacolo, scritto nel commento di Pretix: JSON `{ tmdbId }` o il vecchio `TMDB_ID:123`. */
export function tmdbIdDaCommento(comment?: string | null): string | null {
  if (!comment) return null;
  try {
    const id = JSON.parse(comment)?.tmdbId;
    return id != null && id !== '' ? String(id) : null;
  } catch {
    return comment.match(/TMDB_ID:(\d+)/)?.[1] ?? null;
  }
}

const oraDiRoma = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

export interface SottoeventoPretix {
  id: number;
  name?: { it?: string } | string;
  slug?: string;
  date_from: string;
  date_to?: string | null;
  seating_plan?: number | null;
  comment?: string | null;
  active: boolean;
  meta_data?: { lingua?: string; sottotitoli?: string; format?: string };
  best_availability_state?: string;
  presale_is_running?: boolean;
}

export const nomeDi = (se: Pick<SottoeventoPretix, 'name'>): string =>
  (typeof se.name === 'object' ? se.name?.it : se.name) || 'Sconosciuto';

/**
 * La riga di PretixSync per uno spettacolo, come la scriveva la v1. Le
 * disponibilità non si toccano qui: le aggiorna `aggiornaDisponibilita`.
 * Le specifiche di proiezione (`projectionSpecs`) non ci sono di proposito:
 * vivono solo nel database, e la sync le azzererebbe.
 */
export function rigaDaSottoevento(se: SottoeventoPretix, sale: Record<number, string>) {
  const dal = new Date(se.date_from);
  const al = se.date_to ? new Date(se.date_to) : null;
  return {
    name: nomeDi(se),
    slug: se.slug,
    dateFrom: dal,
    dateTo: al,
    startTime: oraDiRoma(dal),
    endTime: al ? oraDiRoma(al) : null,
    seatingPlanId: se.seating_plan ?? null,
    roomName: se.seating_plan ? sale[se.seating_plan] || 'Sala' : 'Sala',
    tmdbId: tmdbIdDaCommento(se.comment),
    comment: se.comment ?? null,
    active: se.active,
    metaLingua: se.meta_data?.lingua || null,
    metaSottotitoli: se.meta_data?.sottotitoli || null,
    metaFormat: se.meta_data?.format || null,
  };
}

/** Una scheda film del database, coi campi che finiscono nel commento di Pretix. */
export interface SchedaPerPretix {
  customRating?: string | null;
  runtime?: number | null;
  versionLanguage?: string | null;
  subtitles?: string | null;
  customPosterPath?: string | null;
  customBackdropPath?: string | null;
  customLogoPath?: string | null;
  customDirector?: string | null;
  customCast?: string | null;
  customTrailerUrl?: string | null;
  awards?: { type: string; label?: string | null; details?: string | null; year?: number | null }[];
}

/**
 * Il commento che la sync rimanda allo spettacolo su Pretix: i metadati del
 * film, campo per campo come nella v1 (li leggono la cassa e l'app). Le chiavi
 * dei premi `hasOscar`… restano per chi le legge ancora.
 */
export function commentoPerPretix(tmdbId: string, s: SchedaPerPretix) {
  const premi = s.awards ?? [];
  const premio = (tipo: string) => premi.find(a => a.type === tipo);
  return {
    tmdbId,
    rating: s.customRating || 'T',
    runtime: s.runtime || 120,
    versionLanguage: s.versionLanguage?.trim() || 'ITA',
    subtitles: s.subtitles?.trim() || 'NESSUNO',
    posterPath: s.customPosterPath || '',
    backdropPath: s.customBackdropPath || '',
    logoPath: s.customLogoPath === 'none' ? '' : s.customLogoPath || '',
    director: s.customDirector || '',
    cast: s.customCast || '',
    hasOscar: !!premio('oscar'),
    oscarDetails: premio('oscar')?.details || '',
    hasCannes: !!premio('cannes'),
    cannesDetails: premio('cannes')?.details || '',
    hasVenice: !!premio('venice'),
    veniceDetails: premio('venice')?.details || '',
    awardYear: premi[0]?.year || null,
    awards: premi,
    trailerUrl: s.customTrailerUrl || '',
  };
}

// ─── Quote ────────────────────────────────────────────────────────────────

export interface Quota {
  id?: number;
  name?: string;
  size?: number | null;
  items?: number[];
  subevent?: number | null;
  available?: boolean;
  available_number?: number | null;
}

/** La quota che conta i posti prenotabili: per nome, o perché contiene l'intero. */
export function quotaIntero(quote: Quota[]): Quota | null {
  const nome = (q: Quota) => (q.name || '').trim().toLowerCase();
  return quote.find(q =>
    nome(q).includes('quota intero') || nome(q).includes('posto unico') || nome(q).includes('intero')
    || (Array.isArray(q.items) && q.items.includes(ITEM_INTERO_ID))
    || nome(q) === 'biglietti') ?? null;
}

/** Esaurito per la quota: zero posti. Una quota senza numero (illimitata) non è mai esaurita. */
export const quotaEsaurita = (q: Quota) => q.available_number != null && q.available_number <= 0;

/** Prima della conferma: le quote dell'intero e della VIP dicono se c'è ancora posto. Senza quote, si va avanti. */
export function disponibilitaDaQuote(quote: Quota[]): { esaurito: boolean; liberi: number | null } {
  const utili = quote.filter(q => Array.isArray(q.items) && (q.items.includes(ITEM_INTERO_ID) || q.items.includes(ITEM_VIP_ID)));
  if (!utili.length) return { esaurito: false, liberi: null };
  const liberi = utili.reduce((n, q) => n + (q.available_number != null ? Math.max(0, q.available_number) : 0), 0);
  return { esaurito: utili.every(q => q.available === false) || liberi <= 0, liberi };
}

// ─── Posti ────────────────────────────────────────────────────────────────

export interface PostoPretix {
  id?: number;
  seat_guid?: string;
  name?: string;
  row_name?: string;
  seat_number?: string;
  category?: string;
  product?: number;
  available?: boolean;
  blocked?: boolean;
  orderposition?: unknown;
  cartposition?: unknown;
}

export interface Posto {
  id: string;
  /** "Fila B - Posto 5", o il nome di Pretix se non ha fila. */
  etichetta: string;
  fila: string;
  numero: string;
  occupato: boolean;
  /** La poltrona VIP: si vede, ma non si prenota dal sito. */
  vip: boolean;
}

const vipDi = (s: PostoPretix) =>
  s.product === ITEM_VIP_ID
  || (typeof s.seat_guid === 'string' && s.seat_guid.toUpperCase().includes('VIP'))
  || (typeof s.category === 'string' && /VIP|POLTRONA/i.test(s.category));

/** I posti di Pretix in un elenco semplice, per fila e numero. */
export function postiDaPretix(grezzi: PostoPretix[]): Posto[] {
  return grezzi
    .map(s => {
      const fila = s.row_name || '', numero = s.seat_number || '';
      return {
        id: s.seat_guid || String(s.id),
        etichetta: fila ? `Fila ${fila} - Posto ${numero}` : s.name || `Posto ${numero}`,
        fila,
        numero,
        occupato: s.available === false || !!s.blocked || s.orderposition != null || s.cartposition != null,
        vip: vipDi(s),
      };
    })
    .sort((a, b) => a.fila !== b.fila
      ? a.fila.localeCompare(b.fila, undefined, { numeric: true })
      : a.numero.localeCompare(b.numero, undefined, { numeric: true }));
}

export const prenotabile = (p: Posto) => !p.occupato && !p.vip;

/** I posti raggruppati per fila, nell'ordine in cui arrivano. */
export function file(posti: Posto[]): { fila: string; posti: Posto[] }[] {
  const out: { fila: string; posti: Posto[] }[] = [];
  for (const p of posti) {
    const ultima = out[out.length - 1];
    if (ultima && ultima.fila === p.fila) ultima.posti.push(p);
    else out.push({ fila: p.fila, posti: [p] });
  }
  return out;
}

// ─── Testi ────────────────────────────────────────────────────────────────

/** Il divieto nelle sigle italiane: T, 6+, 10+, 14+, 18+. */
export function divietoNormale(val?: string | null): string {
  if (!val) return 'T';
  const c = String(val).toUpperCase().replace(/[\s.]/g, '').replace(/^VM/, '');
  if (['T', 'PT', 'G', 'U', '0', 'APPROVED', 'PASSED'].includes(c)) return 'T';
  if (['6', '6+', 'PG', 'TV-PG'].includes(c)) return '6+';
  if (['10', '10+', '12', '12A'].includes(c)) return '10+';
  if (['14', '14+', 'PG13', 'PG-13', 'TV-14', '15', 'R'].includes(c)) return '14+';
  if (['18', '18+', 'NC17', 'NC-17', 'TV-MA', '16', 'X'].includes(c)) return '18+';
  const n = parseInt(c.replace(/\D/g, ''), 10);
  if (Number.isNaN(n)) return 'T';
  return n >= 18 ? '18+' : n >= 14 ? '14+' : n >= 10 ? '10+' : n >= 6 ? '6+' : 'T';
}

/** L'avviso sotto la sala. Solo il 18+ è un divieto che va confermato. */
export function avvisoEta(rating?: string | null): { divieto: boolean; testo: string } | null {
  const r = divietoNormale(rating);
  if (r === '18+') return { divieto: true, testo: "L'accesso a questa proiezione è limitato ai maggiori di 18 anni." };
  if (r === '14+') return { divieto: false, testo: "L'accesso a questa proiezione è limitato ai maggiori di 14 anni." };
  if (r === '10+' || r === '6+') return { divieto: false, testo: `La visione di questo film è consigliata dai ${r.replace('+', '')} anni in su.` };
  return null;
}

/** "Fila B - Posto 5" → "B5"; con una fila numerica "12·3", se no "123" non si legge. */
export function postoBreve(etichetta: string): string {
  const m = etichetta.match(/^Fila (\S+) - Posto (\S+)$/);
  if (!m) return etichetta;
  return /^\d+$/.test(m[1]) ? `${m[1]}·${m[2]}` : `${m[1]}${m[2]}`;
}

/** Quando la mappa scopre che un posto scelto è stato preso da qualcun altro. */
export function avvisoPostiPresi(etichette: string[]): string {
  return etichette.length === 1
    ? `Il posto ${etichette[0]} è stato appena prenotato da qualcun altro. Scegline un altro.`
    : `Questi posti sono stati appena prenotati da altri: ${etichette.join(', ')}. Scegline altri.`;
}

/**
 * Il motivo di un ordine rifiutato da Pretix, detto a chi prenota. Pretix
 * risponde in inglese e per campi (`{"positions":[{"seat":["…not available"]}]}`);
 * il resto non si mostra così com'è: si dice di riprovare.
 */
export function motivoRifiuto(risposta: unknown): string {
  const posizioni = (risposta as { positions?: Record<string, unknown>[] })?.positions;
  for (const p of Array.isArray(posizioni) ? posizioni : []) {
    const posto = Array.isArray(p?.seat) ? String(p.seat[0] ?? '') : '';
    if (posto) return /not available|already/i.test(posto) ? 'Il posto scelto non è più libero. Scegline un altro.' : posto;
    const prodotto = Array.isArray(p?.item) ? String(p.item[0] ?? '') : '';
    if (/quota/i.test(prodotto)) return 'I posti per questa proiezione sono finiti.';
  }
  const email = (risposta as { email?: unknown })?.email;
  if (Array.isArray(email) && email.length) return 'Questo indirizzo email non va bene: controllalo.';
  return 'La prenotazione non è andata a buon fine. Riprova fra un momento.';
}

/** Un indirizzo email credibile: il controllo vero lo fa Pretix. */
export const emailValida = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
