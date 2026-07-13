import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';

export interface StoryStats {
  filmCount: number;
  totalHours: number;
  awardsCount: number;
  projectionsCount: number;
  genresCount: number;
}

export type StoryChapter =
  | { kind: 'intro' }
  | { kind: 'tagline'; movie: GroupedMovie }
  | { kind: 'quote'; movie: GroupedMovie; text: string }
  | { kind: 'stripes'; movies: GroupedMovie[]; backdropIndex: number }
  | { kind: 'stats'; stats: StoryStats }
  | { kind: 'logos'; movies: GroupedMovie[] }
  | { kind: 'calendar' }
  | { kind: 'awards'; movies: GroupedMovie[] }
  | { kind: 'mosaic'; movies: GroupedMovie[] }
  | { kind: 'marquee'; movies: GroupedMovie[] }
  | { kind: 'outro' };

const hasTagline = (m: GroupedMovie) => Boolean(m.tagline && m.tagline.trim());
const hasStripeVisual = (m: GroupedMovie) =>
  Boolean((m.extraBackdrops && m.extraBackdrops.length > 0) || m.backdrop_path);

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
export function buildStory(movies: GroupedMovie[]): StoryChapter[] {
  if (movies.length === 0) return [];

  const chapters: StoryChapter[] = [];
  const featured = new Set<number>();
  const taglineMovies = movies.filter(hasTagline);

  chapters.push({ kind: 'intro' });

  // 1° slogan
  const firstTagline = taglineMovies[0];
  if (firstTagline) {
    chapters.push({ kind: 'tagline', movie: firstTagline });
    featured.add(firstTagline.id);
  }

  // Prima serie di strisce backdrop+logo
  let stripesA = movies.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, 3);
  if (stripesA.length === 0 && !firstTagline) {
    stripesA = movies.filter(hasStripeVisual).slice(0, 2);
  }
  if (stripesA.length > 0) {
    chapters.push({ kind: 'stripes', movies: stripesA, backdropIndex: 0 });
    stripesA.forEach(m => featured.add(m.id));
  }

  // I numeri della programmazione
  chapters.push({ kind: 'stats', stats: computeStats(movies) });

  // Muro di loghi
  const logoMovies = movies.filter(m => m.logo_path);
  if (logoMovies.length >= 4) {
    chapters.push({ kind: 'logos', movies: logoMovies });
  }

  chapters.push({ kind: 'calendar' });

  // Citazione dalla trama (per un film senza tagline)
  const quoteMovie =
    movies.find(m => !hasTagline(m) && !featured.has(m.id) && (m.overview || '').trim().length >= 80) ||
    movies.find(m => !hasTagline(m) && (m.overview || '').trim().length >= 80);
  if (quoteMovie) {
    chapters.push({ kind: 'quote', movie: quoteMovie, text: excerptOverview(quoteMovie.overview) });
    featured.add(quoteMovie.id);
  }

  // Premi e riconoscimenti
  const awardMovies = movies
    .filter(m => (m.awards?.length || 0) > 0)
    .sort((a, b) => (b.awards?.length || 0) - (a.awards?.length || 0))
    .slice(0, 3);
  if (awardMovies.length > 0) {
    chapters.push({ kind: 'awards', movies: awardMovies });
  }

  // 2° slogan
  const secondTagline =
    taglineMovies.find(m => !featured.has(m.id)) ||
    taglineMovies.find(m => m.id !== firstTagline?.id);
  if (secondTagline) {
    chapters.push({ kind: 'tagline', movie: secondTagline });
    featured.add(secondTagline.id);
  }

  // Seconda serie di strisce con i film non ancora protagonisti
  const stripesB = movies.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, 3);
  if (stripesB.length > 0) {
    chapters.push({ kind: 'stripes', movies: stripesB, backdropIndex: 1 });
    stripesB.forEach(m => featured.add(m.id));
  }

  // Mosaico in parallax
  const posterMovies = movies.filter(m => m.poster_path);
  if (posterMovies.length >= 3) {
    chapters.push({ kind: 'mosaic', movies: posterMovies });
  }

  // Nastro di poster in scorrimento continuo
  if (posterMovies.length >= 4) {
    chapters.push({ kind: 'marquee', movies: posterMovies });
  }

  chapters.push({ kind: 'outro' });
  return chapters;
}
