import { cinemaToday, formatShowDayLong, formatShowDayShort, formatShowTime, toCinemaDayKey } from '@/utils/cinemaDate';
import { resolveFestival, type FestivalInfo } from './festivals';
import { weighAward, type HomeMovie, type HomeShow } from './programma';

/**
 * Il sistema dei metadati della home (10 novembre 2026): un solo posto dove si
 * decide come si scrive ogni dato di un film e di uno spettacolo, e che cosa
 * si mostra quando un dato manca. Gli atti non compongono più le loro righe a
 * mano: chiedono qui il cartellino del film e lo disegnano con `Dati.tsx`.
 *
 * Solo parole, niente React e niente DOM: così si prova coi test
 * (`metadati.test.ts`). La regola è una: un dato che manca non lascia tracce,
 * né una riga vuota né un separatore orfano. Niente dati inventati.
 */

/** Un film della home: quello che arriva dalla pagina, con i campi che la home legge. */
export interface Film extends HomeMovie {
  director?: string;
  runtime?: number | null;
  release_year?: string;
  cast?: string[];
  genres?: string[];
  voteAverage?: number | null;
  /** Il titolo originale, quando è diverso da quello in sala. */
  originalTitle?: string;
  /** Il divieto: "T", "6+", "14+", "18+". */
  rating?: string;
  isSoldOut?: boolean;
  subevents: Show[];
}

export interface Show extends HomeShow {
  dayLabel?: string;
  timeLabel?: string;
  /** I posti ancora liberi e quelli della sala, quando Pretix li ha detti. */
  availableSeats?: number | null;
  totalSeats?: number | null;
  /** La riga libera delle specifiche ("copia 35mm restaurata"). */
  specsNote?: string;
  format?: string;
}

const pulito = (t?: string | null) => (t || '').trim();

export const maiuscola = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Le parti che ci sono, unite dal punto a mezz'aria: mai un separatore senza niente accanto. */
export const unisci = (parti: (string | null | undefined | false)[], con = ' · ') =>
  parti.map(p => pulito(p || '')).filter(Boolean).join(con);

// ─── Quando ───────────────────────────────────────────────────────────────

export const ora = (s: Show) => s.timeLabel || formatShowTime(s.date);

/** "Oggi", "Domani", "Mercoledì 28 ottobre". */
export function giornoDi(date: string, now: Date): string {
  const key = toCinemaDayKey(date);
  if (key === toCinemaDayKey(now)) return 'Oggi';
  const domani = new Date(cinemaToday(now).getTime() + 24 * 3600 * 1000);
  if (key === toCinemaDayKey(domani)) return 'Domani';
  return maiuscola(formatShowDayLong(date));
}

/** "Oggi", "Domani", "Mer 28 ott": per le linguette dei giorni. */
export function giornoBreve(date: string, now: Date): string {
  const g = giornoDi(date, now);
  return g === 'Oggi' || g === 'Domani' ? g : maiuscola(formatShowDayShort(date));
}

/** "Oggi alle 16:00", "Mercoledì 28 ottobre alle 15:00". */
export const quando = (s: Show, now: Date) => `${giornoDi(s.date, now)} alle ${ora(s)}`;

// ─── Dove ─────────────────────────────────────────────────────────────────

/**
 * "Sala Ca Granda". Nel catalogo le sale sono scritte in maiuscolo ("CA GRANDA"):
 * qui tornano minuscole con l'iniziale. La pagina mette "Sala" quando il nome
 * manca: da solo non dice niente, e allora non si mostra.
 */
export function sala(s: Show): string {
  const nome = pulito(s.roomName).replace(/\s+/g, ' ');
  if (!nome || /^sala$/i.test(nome)) return '';
  const scritto = nome === nome.toUpperCase()
    ? nome.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, prima, lettera) => prima + lettera.toUpperCase())
    : nome;
  return /^sala\b/i.test(scritto) ? maiuscola(scritto) : `Sala ${scritto}`;
}

// ─── Il film ──────────────────────────────────────────────────────────────

/** "2 h 27 min", "52 min", "2 h". */
export function durata(m?: number | null): string {
  if (!m || m <= 0 || !Number.isFinite(m)) return '';
  const h = Math.floor(m / 60), min = Math.round(m % 60);
  if (!h) return `${min} min`;
  return min ? `${h} h ${String(min).padStart(2, '0')} min` : `${h} h`;
}

/** Regia, anno, durata: i crediti, in quest'ordine. */
export const crediti = (f: Film) => [pulito(f.director), pulito(f.release_year), durata(f.runtime)].filter(Boolean);

/** I generi, al massimo due: di più diventano un elenco. */
export const generi = (f: Film, quanti = 2) => (f.genres || []).map(pulito).filter(Boolean).slice(0, quanti);

/** Il voto di TMDB con la virgola: "7,4". Zero vuol dire "nessun voto", e non si mostra. */
export function voto(f: Film): string {
  const v = f.voteAverage;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return '';
  return v.toFixed(1).replace('.', ',');
}

/** Il divieto, solo se c'è: "14+". "T" (per tutti) non si scrive. */
export function divieto(f: Film): string {
  const r = pulito(f.rating).toUpperCase();
  return !r || r === 'T' ? '' : r;
}

/** "Vietato ai minori di 14 anni": il divieto per esteso, per chi ascolta la pagina. */
export function divietoEsteso(f: Film): string {
  const n = divieto(f).match(/\d+/);
  return n ? `Vietato ai minori di ${n[0]} anni` : '';
}

/** Il titolo originale, solo se dice qualcosa in più del titolo in sala. */
export function titoloOriginale(f: Film): string {
  const o = pulito(f.originalTitle);
  const piatto = (t: string) => t.toLowerCase().normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '');
  return o && piatto(o) !== piatto(f.title) ? o : '';
}

// ─── Lo spettacolo ────────────────────────────────────────────────────────

const SENZA_SOTTOTITOLI = /^(nessun[oai]?|no|none|-)$/i;

/** "Francese, sottotitoli in italiano". */
export function lingua(s: Show): string {
  const l = pulito(s.language);
  const parlato = /^(lingua )?originale$/i.test(l) ? 'Versione originale' : l;
  // Nel catalogo "senza sottotitoli" si scrive anche "Nessuno".
  const sub = pulito(s.subtitles).replace(SENZA_SOTTOTITOLI, '');
  return maiuscola([parlato, sub ? `sottotitoli in ${sub.toLowerCase()}` : ''].filter(Boolean).join(', '));
}

/** Come si proietta: "4K", "Dolby Atmos", e la riga libera scritta in programmazione. */
export function tecnica(s: Show): string[] {
  const bollini = (s.specs || []).map(x => x.replace('DOLBY_VISION', 'Dolby Vision').replace('ATMOS', 'Dolby Atmos').replace('IMAX', 'Versione IMAX'));
  return [...bollini, pulito(s.format), pulito(s.specsNote)].filter(Boolean);
}

export type StatoPosti = 'esaurito' | 'ultimi' | 'liberi';
export interface Posti { stato: StatoPosti; testo: string }

/**
 * Ci sono ancora posti? "Esaurito" lo dice Pretix (e il dato dal vivo). "Ultimo
 * posto" solo quando il conto dei posti c'è ed è basso: un quarto della sala o
 * meno. Senza conto si dice soltanto che i posti ci sono.
 */
export function posti(s: Show): Posti {
  if (s.isSoldOut) return { stato: 'esaurito', testo: 'Esaurito' };
  const liberi = s.availableSeats, tutti = s.totalSeats;
  if (typeof liberi === 'number' && typeof tutti === 'number' && tutti > 0 && liberi > 0 && liberi <= Math.max(1, Math.floor(tutti / 4))) {
    return { stato: 'ultimi', testo: liberi === 1 ? 'Ultimo posto' : `Ultimi ${liberi} posti` };
  }
  return { stato: 'liberi', testo: 'Posti disponibili' };
}

// ─── I premi ──────────────────────────────────────────────────────────────

export interface Premio {
  festival: FestivalInfo;
  /** "Palma d'oro", "Candidatura", "Selezione ufficiale". */
  titolo: string;
  /** "Cannes 2022", oppure "Palma d'oro, Cannes 2002" per una candidatura. */
  dove: string;
  vinto: boolean;
  chiave: string;
}

/**
 * I riconoscimenti del film, dal più importante, ognuno col suo festival.
 * Il premio si nomina solo se vinto: una candidatura alla Palma d'oro non è
 * una Palma d'oro, e si scrive "Candidatura".
 */
export function premi(f: Film, quanti = 4): Premio[] {
  return (f.awards || [])
    .map(weighAward)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, quanti)
    .map(p => {
      const festival = resolveFestival(p.type);
      const anno = p.year ? ` ${p.year}` : '';
      const vinto = p.won.length > 0;
      const candidato = !vinto && p.nominated.length > 0;
      return {
        festival,
        titolo: vinto ? maiuscola(p.prize) : candidato ? 'Candidatura' : 'Selezione ufficiale',
        dove: `${candidato ? `${maiuscola(p.prize)}, ` : ''}${festival.breve}${anno}`,
        vinto,
        chiave: `${p.type}-${p.year}-${p.prize}`,
      };
    });
}

/** Il riconoscimento più importante, per le schede piccole. */
export const premio = (f: Film): Premio | null => premi(f, 1)[0] || null;

/** "Palma d'oro · Cannes 2022": il premio in una riga. */
export const premioInRiga = (p: Premio | null) => (p ? unisci([p.titolo, p.dove]) : '');

// ─── Il cartellino ────────────────────────────────────────────────────────

/**
 * Il cartellino di un film per uno spettacolo: le stesse righe in ogni atto,
 * come le etichette di una collezione. Ogni voce è una stringa, vuota se il
 * dato manca.
 */
export interface Cartellino {
  /** "Oggi alle 20:30" */
  quando: string;
  /** "Sala Ca Granda" */
  sala: string;
  /** "Ruben Östlund · 2022 · 2 h 27 min" */
  film: string;
  /** "Inglese, sottotitoli in italiano · 4K" */
  versione: string;
  /** "Commedia · Dramma" */
  generi: string;
  /** "14+" */
  divieto: string;
  premio: Premio | null;
  posti: Posti;
}

export function cartellino(f: Film, s: Show, now: Date): Cartellino {
  return {
    quando: quando(s, now),
    sala: sala(s),
    film: unisci(crediti(f)),
    versione: unisci([lingua(s), ...tecnica(s)]),
    generi: unisci(generi(f)),
    divieto: divieto(f),
    premio: premio(f),
    posti: posti(s),
  };
}

/**
 * Che cosa capisce chi guarda un atto senza aprire niente: che film, quando,
 * in quale sala, in quale lingua, quanto dura, se ci sono posti. Restituisce
 * le voci che mancano (serve ai test e al controllo dei dati).
 */
export function mancanti(f: Film, s: Show): string[] {
  const voci: [string, string][] = [
    ['titolo', pulito(f.title)],
    ['sala', sala(s)],
    ['lingua', lingua(s)],
    ['durata', durata(f.runtime)],
    ['regia', pulito(f.director)],
    ['anno', pulito(f.release_year)],
  ];
  return voci.filter(([, v]) => !v).map(([k]) => k);
}
