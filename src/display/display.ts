import { cinemaToday, formatShowDayLong, toCinemaDayKey } from '@/home/date';
import { giornoDi, lingua, sala } from '@/home/metadati';
import { divietoNormale } from '@/biglietteria/regole';

/**
 * Le regole del display d'ingresso (`/display-esterno`), senza rete, database
 * né React: quali spettacoli mostrare, quanti posti restano, come si
 * raggruppano per giorno e come si dividono in pagine. La lettura vera sta in
 * `carica.ts`, il disegno in `Display.tsx`; qui si prova con `display.test.ts`.
 *
 * I posti arrivano dalle quote di Pretix: li scrive nel database
 * `aggiornaDisponibilita` (biglietteria/sync.ts), al massimo una volta al
 * minuto per spettacolo, ed è il database che il display legge. Le sale
 * possono avere pochissimi posti (Ca Granda ne ha due, ed è voluto): niente
 * qui «corregge» un totale basso.
 */

// ─── I posti ──────────────────────────────────────────────────────────────

export type StatoPosti = 'liberi' | 'ultimi' | 'esaurito' | 'ignoti';

export interface PostiDisplay {
  stato: StatoPosti;
  /** I posti ancora liberi, o null se Pretix non li ha detti. Mai negativo. */
  liberi: number | null;
  /** I posti della sala (la quota di Pretix), o null. */
  totale: number | null;
}

export interface DatiPosti {
  isSoldOut?: boolean | null;
  /** L'esaurito messo a mano nel gestionale: vale per tutti gli spettacoli del film. */
  manualSoldOut?: boolean | null;
  availableSeats?: number | null;
  totalSeats?: number | null;
}

/**
 * Quanti posti restano. Esaurito se Pretix lo dice, se il film è esaurito a
 * mano o se i posti sono zero (un conto negativo, con gli ordini oltre la
 * quota, vale zero). «Ultimi» quando resta un quarto della sala o meno, come
 * nella Home (`posti` in home/metadati.ts). Senza conto non si inventa niente.
 */
export function postiRimasti({ isSoldOut, manualSoldOut, availableSeats, totalSeats }: DatiPosti): PostiDisplay {
  const totale = typeof totalSeats === 'number' && totalSeats > 0 ? totalSeats : null;
  const conto = typeof availableSeats === 'number' && Number.isFinite(availableSeats) ? availableSeats : null;

  if (isSoldOut || manualSoldOut || (conto !== null && conto <= 0)) return { stato: 'esaurito', liberi: 0, totale };
  if (conto === null) return { stato: 'ignoti', liberi: null, totale };
  const pochi = totale !== null && conto <= Math.max(1, Math.floor(totale / 4));
  return { stato: pochi ? 'ultimi' : 'liberi', liberi: conto, totale };
}

// ─── Gli spettacoli ───────────────────────────────────────────────────────

/** Una riga di PretixSync con la scheda del film, come la legge `carica.ts`. */
export interface RigaDisplay {
  pretixId: number;
  dateFrom: Date;
  dateTo: Date | null;
  roomName: string | null;
  isSoldOut: boolean;
  availableSeats: number | null;
  totalSeats: number | null;
  metaLingua: string | null;
  metaSottotitoli: string | null;
  movie: {
    tmdbId: string;
    customTitle: string | null;
    customPosterPath: string | null;
    customBackdropPath: string | null;
    customRating: string | null;
    customRoomName: string | null;
    manualSoldOut: boolean;
  } | null;
}

/** Uno spettacolo come arriva al display: già in parole, pronto per il browser (solo testo e numeri). */
export interface SpettacoloDisplay {
  id: number;
  /** L'id TMDB del film: serve a dare a ogni film il suo colore. */
  film: number;
  titolo: string;
  /** Percorsi TMDB (o indirizzi interi): `img` li trasforma in immagini. */
  poster: string;
  fondale: string;
  /** "T", "6+", "10+", "14+", "18+". */
  divieto: string;
  inizio: string;
  fine: string;
  sala: string;
  lingua: string;
  posti: PostiDisplay;
}

/** Quanto dura uno spettacolo di cui Pretix non dice la fine. */
const DURATA_SENZA_FINE_MS = 2 * 3600_000;

/** Oggi e i due giorni dopo. */
export const GIORNI_MOSTRATI = 3;

const fineDi = (r: RigaDisplay) => (r.dateTo ?? new Date(r.dateFrom.getTime() + DURATA_SENZA_FINE_MS)).getTime();

/**
 * Gli spettacoli che il display deve mostrare: quello in corso, quelli di
 * oggi e dei prossimi giorni (si contano a Roma), dal più vicino. Senza la
 * scheda del film non si mostra, come nella Home.
 */
export function spettacoliDa(righe: RigaDisplay[], now: Date, giorni = GIORNI_MOSTRATI): SpettacoloDisplay[] {
  const ultimoGiorno = toCinemaDayKey(new Date(cinemaToday(now).getTime() + (giorni - 1) * 24 * 3600_000));
  return righe
    .filter(r => r.movie && fineDi(r) > now.getTime() && toCinemaDayKey(r.dateFrom) <= ultimoGiorno)
    .sort((a, b) => a.dateFrom.getTime() - b.dateFrom.getTime())
    .map(r => {
      const m = r.movie!;
      return {
        id: r.pretixId,
        film: Number(m.tmdbId),
        titolo: (m.customTitle || '').trim() || 'Senza titolo',
        poster: m.customPosterPath || '',
        fondale: m.customBackdropPath || '',
        divieto: divietoNormale(m.customRating),
        inizio: r.dateFrom.toISOString(),
        fine: new Date(fineDi(r)).toISOString(),
        sala: sala({ id: r.pretixId, date: r.dateFrom.toISOString(), roomName: m.customRoomName || r.roomName || '' }),
        lingua: lingua({ id: r.pretixId, date: r.dateFrom.toISOString(), language: r.metaLingua || '', subtitles: r.metaSottotitoli || '' }),
        posti: postiRimasti({ isSoldOut: r.isSoldOut, manualSoldOut: m.manualSoldOut, availableSeats: r.availableSeats, totalSeats: r.totalSeats }),
      };
    });
}

// ─── Giorno per giorno ────────────────────────────────────────────────────

export interface SpettacoloInSala extends SpettacoloDisplay {
  /** Già cominciato e non ancora finito. */
  inCorso: boolean;
}

export interface GiornoDisplay {
  /** "2026-11-28". */
  chiave: string;
  /** "Oggi", "Domani", "Lunedì 30 novembre". */
  etichetta: string;
  /** "sabato 28 novembre". */
  data: string;
  spettacoli: SpettacoloInSala[];
}

/**
 * Gli spettacoli raggruppati per giorno, con la data di adesso: quelli finiti
 * spariscono da soli (il browser rifà il conto ogni secondo, senza aspettare
 * il server) e un giorno senza più spettacoli non resta come titolo vuoto.
 */
export function perGiorno(spettacoli: SpettacoloDisplay[], now: Date): GiornoDisplay[] {
  const t = now.getTime();
  const out: GiornoDisplay[] = [];
  for (const s of [...spettacoli].sort((a, b) => a.inizio.localeCompare(b.inizio))) {
    if (Date.parse(s.fine) <= t) continue;
    const chiave = toCinemaDayKey(s.inizio);
    let g = out.find(x => x.chiave === chiave);
    if (!g) {
      g = { chiave, etichetta: giornoDi(s.inizio, now), data: formatShowDayLong(s.inizio), spettacoli: [] };
      out.push(g);
    }
    g.spettacoli.push({ ...s, inCorso: Date.parse(s.inizio) <= t });
  }
  return out;
}

// ─── Le pagine dello schermo ──────────────────────────────────────────────

export type Pagina = GiornoDisplay[];

/**
 * Lo schermo non scorre: se gli spettacoli non ci stanno, si dividono in
 * pagine che si alternano. Ogni giorno vale una riga di titolo più una per
 * spettacolo; il titolo non resta mai solo in fondo, e un giorno lungo si
 * spezza ripetendo il titolo. `righe` è quante ne entrano in una pagina.
 */
export function pagine(giorni: GiornoDisplay[], righe = 7): Pagina[] {
  const capacita = Math.max(2, righe);
  const out: Pagina[] = [];
  let corrente: Pagina = [];
  let usate = 0;
  const chiudi = () => { if (corrente.length) out.push(corrente); corrente = []; usate = 0; };

  for (const g of giorni) {
    let resto = g.spettacoli;
    while (resto.length) {
      if (capacita - usate < 2) chiudi();
      const presi = resto.slice(0, capacita - usate - 1);
      corrente.push({ ...g, spettacoli: presi });
      usate += 1 + presi.length;
      resto = resto.slice(presi.length);
    }
  }
  chiudi();
  return out;
}
