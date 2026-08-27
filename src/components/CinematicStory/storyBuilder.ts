import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';
import { FESTIVAL_HOMEPAGE, FESTIVAL_PRESTIGE, FESTIVALS, FestivalInfo, resolveFestival } from './festivals';

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

export interface SoireeShowtime {
  time: string;
  isSoldOut: boolean;
}

/** Una scena del palcoscenico d'apertura: un film in una delle prossime sere. */
export interface SoireeItem {
  movie: GroupedMovie;
  /** Data ISO del giorno (chiave stabile per il rendering). */
  dayKey: string;
  /** "Stasera" / "Domani sera" / "Dopodomani sera" */
  dayLabel: string;
  /** Data breve per i giorni futuri (es. "sab 19"), vuota per stasera. */
  dateLabel: string;
  /** Il metadato più sorprendente del film, già in forma di frase. */
  hook: string;
  times: SoireeShowtime[];
}

/** L'umore della programmazione: genere dominante e tinta d'accento. */
export interface StoryMood {
  genre: string | null;
  accent: string;
}

export interface FestivalFilm {
  movie: GroupedMovie;
  /** Riconoscimento principale a questo festival, es. "Palma d'Oro · 2024" */
  awardLabel: string;
}

export interface FestivalGroup {
  festival: FestivalInfo;
  films: FestivalFilm[];
}

export type StoryChapter =
  | { kind: 'quote'; movie: GroupedMovie; text: string }
  | { kind: 'soirees'; items: SoireeItem[] }
  | { kind: 'stripes'; movies: GroupedMovie[]; backdropIndex: number }
  | { kind: 'stats'; stats: StoryStats }
  | { kind: 'logos'; movies: GroupedMovie[] }
  | { kind: 'weekend'; days: WeekendDay[] }
  | { kind: 'reveal'; movies: GroupedMovie[] }
  | { kind: 'calendar' }
  | { kind: 'festival'; groups: FestivalGroup[] }
  | { kind: 'marquee'; movies: GroupedMovie[] };

// Quanti film al massimo per le sezioni collettive: con cataloghi grandi
// la rotazione del seed decide quali entrano a ogni refresh.
const MAX_LOGOS = 12;
const MAX_MARQUEE = 16;
const MAX_REVEAL = 4;
const MIN_REVEAL = 2;

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
  language?: string;
  subtitles?: string;
  format?: string;
}

// Tutte le date sono valutate sul fuso di Roma, così il markup generato in SSR
// (che su Vercel gira in UTC) coincide con quello che il browser idrata.
const ROME = 'Europe/Rome';
const romeDateKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: ROME });
const romeTime = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: ROME });

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const SOIREE_LABELS = ['Stasera', 'Domani sera', 'Dopodomani sera'];

// Nome breve del festival declinato per la frase ("Palma d'Oro a Cannes").
const FESTIVAL_SHORT: Record<string, string> = {
  cannes: 'a Cannes',
  venice: 'a Venezia',
  berlin: 'alla Berlinale',
  oscar: 'agli Oscar',
  bafta: 'ai BAFTA',
  ssiff: 'a San Sebastián',
  telluride: 'a Telluride',
  toronto: 'a Toronto',
  locarno: 'a Locarno',
  davids: 'ai David di Donatello',
  nastri: "ai Nastri d'Argento",
  romacinemafest: 'alla Festa di Roma',
};

/** Chiave festival SOLO se il tipo è riconosciuto davvero (niente fallback
 *  Oscar di resolveFestival: una frase sbagliata è peggio di nessuna frase). */
function strictFestivalKey(type: string): string | null {
  const t = (type || '').toLowerCase().trim();
  if (t.includes('toronto') || t.includes('tiff')) return 'toronto';
  return FESTIVALS[t] ? t : null;
}

const fmtRuntime = (min?: number | null): string => {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const CLASSIC_AGE_YEARS = 25;
const HOOK_MIN_VOTE = 7.5;

/**
 * Estrae il metadato più sorprendente del film e lo trasforma in una frase
 * da palcoscenico. Priorità: premio vinto → candidatura → classico che torna
 * in sala → formato speciale → lingua originale → voto del pubblico →
 * cast → regia → genere e durata. Mai una frase generica.
 */
export function buildSoireeHook(movie: GroupedMovie, shows: ShowtimeLike[] = [], now: Date = new Date()): string {
  // 1-2. Premi: vince il "Vincitore", poi la candidatura; a parità decide il
  // prestigio del festival, poi l'anno più recente.
  type Candidate = { win: boolean; prestige: number; year: number; text: string };
  const candidates: Candidate[] = [];

  for (const award of (movie.awards || []) as AwardLike[]) {
    const key = strictFestivalKey(award.type || '');
    if (!key) continue;
    const short = FESTIVAL_SHORT[key] || `al ${resolveFestival(key).name}`;
    const details = (award.details || '').trim();
    const year = award.year || 0;
    const suffix = year ? ` · ${year}` : '';

    const win = details.match(/Vincitore:\s*([^·]+)/i)?.[1]?.split(',')[0]?.trim();
    const nomination = details.match(/Candidatura:\s*([^·]+)/i)?.[1]?.split(',')[0]?.trim();
    const prestige = FESTIVAL_PRESTIGE.indexOf(key);

    if (win) {
      candidates.push({ win: true, prestige, year, text: `${win} ${short}${suffix}` });
    } else if (nomination) {
      candidates.push({ win: false, prestige, year, text: `Candidato ${short}${suffix}` });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) =>
      Number(b.win) - Number(a.win) || a.prestige - b.prestige || b.year - a.year
    );
    return candidates[0].text;
  }

  // 3. Un classico che torna sul grande schermo.
  const year = parseInt((movie.release_date || '').slice(0, 4), 10);
  if (year && now.getFullYear() - year >= CLASSIC_AGE_YEARS) {
    return `Il classico del ${year} torna sul grande schermo`;
  }

  // 4. Formato di proiezione speciale (35mm, 70mm, 4K, IMAX, 3D…).
  const format = shows.map(s => (s.format || '').trim()).find(f => /35\s*mm|70\s*mm|4k|imax|3d/i.test(f));
  if (format) return `Proiezione in ${format}`;

  // 5. Versione in lingua originale.
  const voShow = shows.find(s => {
    const lang = (s.language || '').trim();
    return lang !== '' && !/ital/i.test(lang);
  });
  if (voShow) {
    const hasSubs = Boolean((voShow.subtitles || '').trim());
    return hasSubs ? 'In lingua originale, sottotitolato in italiano' : 'In lingua originale';
  }

  // 6. Il voto del pubblico mondiale.
  if ((movie.voteAverage || 0) >= HOOK_MIN_VOTE) {
    return `Voto ${movie.voteAverage!.toFixed(1).replace('.', ',')} su 10 per il pubblico mondiale`;
  }

  // 7-8. Le persone: cast, poi regia.
  const cast = (movie.cast || []).filter(Boolean);
  if (cast.length > 0) {
    return cast.length > 1 ? `Con ${cast[0]} e ${cast[1]}` : `Con ${cast[0]}`;
  }
  if (movie.director) return `La regia di ${movie.director}`;

  // 9. Ultima risorsa: genere e durata.
  const genre = (movie.genres || [])[0];
  const runtime = fmtRuntime(movie.runtime);
  return [genre, runtime].filter(Boolean).join(' · ');
}
/** Le "serate" partono dalle 17: prima è pomeriggio, non entra nel carosello. */
const SOIREE_EVENING_HOUR = 17;
const MAX_SOIREES_PER_DAY = 3;

const romeHour = (d: Date) =>
  parseInt(d.toLocaleTimeString('it-IT', { hour: '2-digit', hour12: false, timeZone: ROME }), 10);

/**
 * Le migliori proiezioni serali di oggi, domani e dopodomani per il carosello
 * d'apertura. Per ogni sera i film sono ordinati per "qualità" (premi, poi
 * voto TMDB) e ne entrano al massimo MAX_SOIREES_PER_DAY; gli orari identici
 * dello stesso film vengono unificati come nel weekend.
 */
export function buildSoirees(movies: GroupedMovie[], now: Date = new Date()): SoireeItem[] {
  const items: SoireeItem[] = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getTime() + i * 86400000);
    const dayKey = romeDateKey(date);
    const perMovie = new Map<number, SoireeItem>();
    // Le proiezioni grezze della sera servono al gancio (formato, lingua…).
    const rawShows = new Map<number, ShowtimeLike[]>();

    for (const movie of movies) {
      for (const se of (movie.subevents || []) as ShowtimeLike[]) {
        if (!se?.date) continue;
        const d = new Date(se.date);
        if (isNaN(d.getTime())) continue;
        if (romeDateKey(d) !== dayKey) continue;
        if (romeHour(d) < SOIREE_EVENING_HOUR) continue;

        let item = perMovie.get(movie.id);
        if (!item) {
          item = {
            movie,
            dayKey,
            dayLabel: SOIREE_LABELS[i],
            dateLabel: i === 0 ? '' : date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', timeZone: ROME }),
            hook: '',
            times: [],
          };
          perMovie.set(movie.id, item);
          rawShows.set(movie.id, []);
        }
        rawShows.get(movie.id)!.push(se);

        const time = romeTime(d);
        const existing = item.times.find(t => t.time === time);
        if (existing) {
          existing.isSoldOut = existing.isSoldOut && Boolean(se.isSoldOut);
          continue;
        }
        item.times.push({ time, isSoldOut: Boolean(se.isSoldOut) });
      }
    }

    for (const item of perMovie.values()) {
      item.hook = buildSoireeHook(item.movie, rawShows.get(item.movie.id) || [], now);
    }

    const dayItems = Array.from(perMovie.values());
    dayItems.forEach(it => it.times.sort((a, b) => a.time.localeCompare(b.time)));
    dayItems.sort((a, b) =>
      (b.movie.awards?.length || 0) - (a.movie.awards?.length || 0) ||
      (b.movie.voteAverage || 0) - (a.movie.voteAverage || 0) ||
      a.times[0].time.localeCompare(b.times[0].time)
    );
    items.push(...dayItems.slice(0, MAX_SOIREES_PER_DAY));
  }

  return items;
}

/**
 * Raggruppa le proiezioni di sabato e domenica del weekend corrente
 * (se già iniziato) o del prossimo. Le proiezioni identiche (stesso film,
 * stesso giorno, stesso orario) vengono unificate.
 */
export function buildWeekend(movies: GroupedMovie[], now: Date = new Date()): WeekendDay[] {
  const dowName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: ROME }).format(now);
  const dow = DOW[dowName] ?? now.getDay();
  // Sabato del weekend "attivo": se è domenica il sabato è ieri (resterà
  // vuoto e sparirà dal filtro finale), altrimenti il prossimo sabato.
  const saturdayOffset = dow === 0 ? -1 : 6 - dow;

  const labels = ['Sabato', 'Domenica'];
  const days: WeekendDay[] = [0, 1].map(i => {
    const date = new Date(now.getTime() + (saturdayOffset + i) * 86400000);
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

interface AwardLike {
  type?: string;
  label?: string;
  details?: string | null;
  year?: number | null;
}

/**
 * Estrae il riconoscimento da mostrare sotto il poster: il premio vinto,
 * altrimenti la candidatura, altrimenti il testo dei details così com'è
 * (es. "Selezione Ufficiale"). `label` è il nome del festival, mai usato qui.
 * Il rank decide quale riconoscimento vince quando un film ne ha più d'uno
 * allo stesso festival: Vincitore > Candidatura > il resto.
 */
function awardHighlight(award: AwardLike): { text: string; rank: number } {
  const details = (award.details || '').trim();
  const year = award.year ? String(award.year) : '';
  const withYear = (t: string) => (t && year ? `${t} · ${year}` : t || year);

  const win = details.match(/Vincitore:\s*([^·]+)/i)?.[1]?.split(',')[0]?.trim();
  if (win) return { text: withYear(win), rank: 2 };

  const nomination = details.match(/Candidatura:\s*([^·]+)/i)?.[1]?.split(',')[0]?.trim();
  if (nomination) return { text: withYear(`Candidatura: ${nomination}`), rank: 1 };

  return { text: withYear(details), rank: 0 };
}

/**
 * Raggruppa i film premiati per festival: il festival è il protagonista,
 * sotto di lui i poster dei film in programmazione candidati o vincitori.
 * In homepage entrano solo i festival della whitelist FESTIVAL_HOMEPAGE.
 */
export function buildFestivalGroups(movies: GroupedMovie[]): FestivalGroup[] {
  const map = new Map<string, { festival: FestivalInfo; films: Map<number, FestivalFilm & { rank: number }> }>();

  for (const movie of movies) {
    for (const award of (movie.awards || []) as AwardLike[]) {
      const festival = resolveFestival(award.type || '');
      if (!FESTIVAL_HOMEPAGE.has(festival.key)) continue;

      let group = map.get(festival.key);
      if (!group) {
        group = { festival, films: new Map() };
        map.set(festival.key, group);
      }
      const { text, rank } = awardHighlight(award);
      const existing = group.films.get(movie.id);
      // Il riconoscimento migliore diventa l'etichetta sotto il poster.
      if (!existing || rank > existing.rank) {
        group.films.set(movie.id, { movie, awardLabel: text, rank });
      }
    }
  }

  const prestige = (key: string) => {
    const i = FESTIVAL_PRESTIGE.indexOf(key);
    return i === -1 ? FESTIVAL_PRESTIGE.length : i;
  };

  return Array.from(map.values())
    .map(g => ({
      festival: g.festival,
      films: Array.from(g.films.values()).map(({ movie, awardLabel }) => ({ movie, awardLabel })),
    }))
    .sort((a, b) => b.films.length - a.films.length || prestige(a.festival.key) - prestige(b.festival.key));
}

// Ogni genere ha la sua tinta: la homepage cambia colore con il cartellone.
const GENRE_ACCENTS: Record<string, string> = {
  'Azione': '#f2784b',
  'Avventura': '#6fcf97',
  'Animazione': '#ffa94d',
  'Commedia': '#ffd166',
  'Crime': '#9b8ec4',
  'Documentario': '#7fc8a9',
  'Dramma': '#e8b45a',
  'Famiglia': '#ffb677',
  'Fantasy': '#b28dff',
  'Storia': '#d4b483',
  'Horror': '#e05a5a',
  'Musica': '#ff8fab',
  'Mistero': '#8fa3e8',
  'Romance': '#f48fb1',
  'Fantascienza': '#6ac8e8',
  'Thriller': '#c95d7f',
  'Guerra': '#b8a06a',
  'Western': '#d99a6c',
};

const DEFAULT_ACCENT = '#e8b45a';

/**
 * Il "colore della settimana": genere dominante della programmazione, pesato
 * sul numero di proiezioni (non di film — 5 spettacoli di un horror tingono
 * più di 1 spettacolo di una commedia). Deterministico: stesso catalogo,
 * stessa tinta, così SSR e hydration coincidono.
 */
export function buildMood(movies: GroupedMovie[]): StoryMood {
  const weights = new Map<string, number>();
  for (const m of movies) {
    const w = Math.max(1, m.subevents?.length || 0);
    for (const g of m.genres || []) {
      weights.set(g, (weights.get(g) || 0) + w);
    }
  }

  let genre: string | null = null;
  let best = 0;
  for (const [g, w] of weights) {
    if (w > best) {
      genre = g;
      best = w;
    }
  }

  return { genre, accent: (genre && GENRE_ACCENTS[genre]) || DEFAULT_ACCENT };
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

  // Apertura: il carosello delle prossime serate. Se il calendario delle
  // prossime tre sere è quasi vuoto si torna alla citazione d'apertura.
  let openingQuoteId: number | null = null;
  const soirees = buildSoirees(movies, now);
  if (soirees.length >= 2) {
    chapters.push({ kind: 'soirees', items: soirees });
  } else {
    const opening = pool.find(hasQuote);
    if (opening) {
      chapters.push({ kind: 'quote', movie: opening, text: quoteTextFor(opening) });
      featured.add(opening.id);
      openingQuoteId = opening.id;
    }
  }

  // Prima serie di strisce backdrop+logo
  let stripesA = pool.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, 3);
  if (stripesA.length === 0 && chapters.length === 0) {
    stripesA = pool.filter(hasStripeVisual).slice(0, 2);
  }
  if (stripesA.length > 0) {
    chapters.push({ kind: 'stripes', movies: stripesA, backdropIndex: 0 });
    stripesA.forEach(m => featured.add(m.id));
  }

  // I numeri della programmazione (sempre su tutto il catalogo)
  chapters.push({ kind: 'stats', stats: computeStats(movies) });

  // Muro di loghi (max 12: la rotazione del seed decide quali entrano)
  const logoMovies = pool.filter(m => m.logo_path);
  if (logoMovies.length >= 4) {
    chapters.push({ kind: 'logos', movies: logoMovies.slice(0, MAX_LOGOS) });
  }

  // Questo weekend al cinema (sempre completo, mai ruotato)
  const weekendDays = buildWeekend(movies, now);
  if (weekendDays.length > 0) {
    chapters.push({ kind: 'weekend', days: weekendDays });
  }

  // Reveal: dissolvenze a schermo pieno con i film non ancora protagonisti.
  const revealMovies = pool.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, MAX_REVEAL);
  if (revealMovies.length >= MIN_REVEAL) {
    chapters.push({ kind: 'reveal', movies: revealMovies });
    revealMovies.forEach(m => featured.add(m.id));
  }

  chapters.push({ kind: 'calendar' });

  // Dai festival alla nostra sala: blocchi per festival, non per film.
  const festivalGroups = buildFestivalGroups(pool);
  if (festivalGroups.length > 0) {
    chapters.push({ kind: 'festival', groups: festivalGroups });
  }

  // Seconda serie di strisce con i film non ancora protagonisti
  const stripesB = pool.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, 3);
  if (stripesB.length > 0) {
    chapters.push({ kind: 'stripes', movies: stripesB, backdropIndex: 1 });
    stripesB.forEach(m => featured.add(m.id));
  }

  const posterMovies = pool.filter(m => m.poster_path);

  // Nastro di poster in scorrimento continuo
  if (posterMovies.length >= 4) {
    chapters.push({ kind: 'marquee', movies: posterMovies.slice(0, MAX_MARQUEE) });
  }

  // Citazione di chiusura: mai un messaggio commerciale, solo un'altra voce
  // dei film — preferendo i premiati mai stati protagonisti.
  const closing =
    pool.find(m => hasQuote(m) && !featured.has(m.id) && hasAwards(m)) ||
    pool.find(m => hasQuote(m) && !featured.has(m.id)) ||
    pool.find(m => hasQuote(m) && m.id !== openingQuoteId);
  if (closing) {
    chapters.push({ kind: 'quote', movie: closing, text: quoteTextFor(closing) });
  }

  return chapters;
}

/**
 * Quanti elementi restano nelle sezioni collettive sul telefono.
 *
 * La storia completa arriva a una novantina di immagini: sul desktop non si
 * sente, su uno schermo piccolo è la ragione per cui lo scorrimento va a
 * scatti. Qui si taglia solo la versione telefono — il desktop riceve i
 * capitoli esattamente come li costruisce `buildStory`.
 */
export const PHONE_LIMITS = {
  logos: 6,
  marquee: 8,
  reveal: 3,
  stripes: 2,
} as const;

export function trimChaptersForPhone(chapters: StoryChapter[]): StoryChapter[] {
  return chapters.map(chapter => {
    switch (chapter.kind) {
      case 'logos':
        return { ...chapter, movies: chapter.movies.slice(0, PHONE_LIMITS.logos) };
      case 'marquee':
        return { ...chapter, movies: chapter.movies.slice(0, PHONE_LIMITS.marquee) };
      case 'reveal':
        return { ...chapter, movies: chapter.movies.slice(0, PHONE_LIMITS.reveal) };
      case 'stripes':
        return { ...chapter, movies: chapter.movies.slice(0, PHONE_LIMITS.stripes) };
      default:
        return chapter;
    }
  });
}
