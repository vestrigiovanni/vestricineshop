import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';

export interface StoryStats {
  filmCount: number;
  totalHours: number;
  awardsCount: number;
  projectionsCount: number;
  genresCount: number;
}

export interface WeekendShowtime {
  time: string;
  isSoldOut: boolean;
  roomName?: string;
}

export interface WeekendShow {
  movie: GroupedMovie;
  times: WeekendShowtime[];
}

export interface WeekendDay {
  label: string;
  dateLabel: string;
  isoDate: string;
  shows: WeekendShow[];
}

export type StoryChapter =
  | { kind: 'quote'; movie: GroupedMovie; text: string }
  | { kind: 'stripes'; movies: GroupedMovie[]; backdropIndex: number }
  | { kind: 'stats'; stats: StoryStats }
  | { kind: 'logos'; movies: GroupedMovie[] }
  | { kind: 'weekend'; days: WeekendDay[] }
  | { kind: 'calendar' }
  | { kind: 'awards'; movies: GroupedMovie[] }
  | { kind: 'mosaic'; movies: GroupedMovie[] }
  | { kind: 'marquee'; movies: GroupedMovie[] };

// Quanti film al massimo per le sezioni collettive: con cataloghi grandi
// la rotazione del seed decide quali entrano a ogni refresh.
const MAX_LOGOS = 8;
const MAX_MOSAIC = 12;
const MAX_MARQUEE = 16;

const hasTagline = (m: GroupedMovie) => Boolean(m.tagline && m.tagline.trim());
const hasAwards = (m: GroupedMovie) => (m.awards?.length || 0) > 0;
const hasStripeVisual = (m: GroupedMovie) =>
  Boolean((m.extraBackdrops && m.extraBackdrops.length > 0) || m.backdrop_path);

// Un film ha una "voce" se ha una tagline o una trama abbastanza lunga da citarne l'incipit.
const hasQuote = (m: GroupedMovie) => hasTagline(m) || (m.overview || '').trim().length >= 80;
const quoteTextFor = (m: GroupedMovie) => (hasTagline(m) ? m.tagline!.trim() : excerptOverview(m.overview));

/**
 * Estrae dalla trama una citazione breve da usare come "slogan di riserva":
 * prima frase compiuta, troncata a parola intera se supera il limite.
 */
export function excerptOverview(overview: string, maxLength: number = 150): string {
  const clean = (overview || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';

  const firstSentence = clean.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() || clean;
  if (firstSentence.length <= maxLength) return firstSentence;

  const cut = firstSentence.slice(0, maxLength);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

// PRNG deterministico: lo stesso seed produce la stessa storia, così l'HTML
// generato in SSR coincide con l'hydration client. Il seed cambia a ogni
// richiesta (lo genera page.tsx), quindi a ogni refresh ruotano i film.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface ShowtimeLike {
  date?: string;
  isSoldOut?: boolean;
  roomName?: string;
}

// Tutte le date sono valutate sul fuso di Roma, così il markup generato in SSR
// (che su Vercel gira in UTC) coincide con quello che il browser idrata.
const ROME = 'Europe/Rome';
const romeDateKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: ROME });
const romeTime = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: ROME });

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Raggruppa le proiezioni di venerdì/sabato/domenica del weekend corrente
 * (se già iniziato) o del prossimo. Le proiezioni identiche (stesso film,
 * stesso giorno, stesso orario) vengono unificate.
 */
export function buildWeekend(movies: GroupedMovie[], now: Date = new Date()): WeekendDay[] {
  const dowName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: ROME }).format(now);
  const dow = DOW[dowName] ?? now.getDay();
  const fridayOffset = dow === 6 ? -1 : dow === 0 ? -2 : 5 - dow;

  const labels = ['Venerdì', 'Sabato', 'Domenica'];
  const days: WeekendDay[] = [0, 1, 2].map(i => {
    const date = new Date(now.getTime() + (fridayOffset + i) * 86400000);
    return {
      label: labels[i],
      dateLabel: date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: ROME }),
      isoDate: romeDateKey(date),
      shows: [],
    };
  });

  for (const movie of movies) {
    for (const se of (movie.subevents || []) as ShowtimeLike[]) {
      if (!se?.date) continue;
      const d = new Date(se.date);
      if (isNaN(d.getTime())) continue;

      const day = days.find(x => x.isoDate === romeDateKey(d));
      if (!day) continue;

      let show = day.shows.find(s => s.movie.id === movie.id);
      if (!show) {
        show = { movie, times: [] };
        day.shows.push(show);
      }

      const time = romeTime(d);
      const existing = show.times.find(t => t.time === time);
      if (existing) {
        // Proiezione duplicata: resta prenotabile se almeno una copia lo è.
        existing.isSoldOut = existing.isSoldOut && Boolean(se.isSoldOut);
        continue;
      }
      show.times.push({ time, isSoldOut: Boolean(se.isSoldOut), roomName: se.roomName });
    }
  }

  for (const day of days) {
    day.shows.forEach(s => s.times.sort((a, b) => a.time.localeCompare(b.time)));
    day.shows.sort((a, b) => a.times[0].time.localeCompare(b.times[0].time));
  }
  return days.filter(d => d.shows.length > 0);
}

function computeStats(movies: GroupedMovie[]): StoryStats {
  const totalMinutes = movies.reduce((sum, m) => sum + (m.runtime || 0), 0);
  const genres = new Set(movies.flatMap(m => m.genres || []));
  return {
    filmCount: movies.length,
    totalHours: Math.round(totalMinutes / 60),
    awardsCount: movies.reduce((sum, m) => sum + (m.awards?.length || 0), 0),
    projectionsCount: movies.reduce((sum, m) => sum + (m.subevents?.length || 0), 0),
    genresCount: genres.size,
  };
}

/**
 * Trasforma i film in programmazione nella sequenza di capitoli dello
 * scrollytelling. I capitoli senza contenuto vengono omessi, mai resi vuoti.
 */
export function buildStory(movies: GroupedMovie[], now: Date = new Date(), seed?: number): StoryChapter[] {
  if (movies.length === 0) return [];

  // Con un seed i film ruotano a ogni refresh; senza seed l'ordine resta quello dato.
  const pool = seed == null ? movies : seededShuffle(movies, seed);

  const chapters: StoryChapter[] = [];
  const featured = new Set<number>();

  // Citazione d'apertura: tagline se c'è, altrimenti l'incipit della trama.
  const opening = pool.find(hasQuote);
  if (opening) {
    chapters.push({ kind: 'quote', movie: opening, text: quoteTextFor(opening) });
    featured.add(opening.id);
  }

  // Prima serie di strisce backdrop+logo
  let stripesA = pool.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, 3);
  if (stripesA.length === 0 && !opening) {
    stripesA = pool.filter(hasStripeVisual).slice(0, 2);
  }
  if (stripesA.length > 0) {
    chapters.push({ kind: 'stripes', movies: stripesA, backdropIndex: 0 });
    stripesA.forEach(m => featured.add(m.id));
  }

  // I numeri della programmazione (sempre su tutto il catalogo)
  chapters.push({ kind: 'stats', stats: computeStats(movies) });

  // Muro di loghi
  const logoMovies = pool.filter(m => m.logo_path);
  if (logoMovies.length >= 4) {
    chapters.push({ kind: 'logos', movies: logoMovies.slice(0, MAX_LOGOS) });
  }

  // Questo weekend al cinema (sempre completo, mai ruotato)
  const weekendDays = buildWeekend(movies, now);
  if (weekendDays.length > 0) {
    chapters.push({ kind: 'weekend', days: weekendDays });
  }

  chapters.push({ kind: 'calendar' });

  // Premi e riconoscimenti (la rotazione decide quali premiati mostrare)
  const awardMovies = pool.filter(hasAwards).slice(0, 3);
  if (awardMovies.length > 0) {
    chapters.push({ kind: 'awards', movies: awardMovies });
  }

  // Seconda serie di strisce con i film non ancora protagonisti
  const stripesB = pool.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, 3);
  if (stripesB.length > 0) {
    chapters.push({ kind: 'stripes', movies: stripesB, backdropIndex: 1 });
    stripesB.forEach(m => featured.add(m.id));
  }

  // Mosaico in parallax
  const posterMovies = pool.filter(m => m.poster_path);
  if (posterMovies.length >= 3) {
    chapters.push({ kind: 'mosaic', movies: posterMovies.slice(0, MAX_MOSAIC) });
  }

  // Nastro di poster in scorrimento continuo
  if (posterMovies.length >= 4) {
    chapters.push({ kind: 'marquee', movies: posterMovies.slice(0, MAX_MARQUEE) });
  }

  // Citazione di chiusura: mai un messaggio commerciale, solo un'altra voce
  // dei film — preferendo i premiati mai stati protagonisti.
  const closing =
    pool.find(m => hasQuote(m) && !featured.has(m.id) && hasAwards(m)) ||
    pool.find(m => hasQuote(m) && !featured.has(m.id)) ||
    pool.find(m => hasQuote(m) && m.id !== opening?.id);
  if (closing) {
    chapters.push({ kind: 'quote', movie: closing, text: quoteTextFor(closing) });
  }

  return chapters;
}
