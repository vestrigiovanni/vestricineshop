import type { GroupedMovie } from '../MovieShowcase/MovieShowcase';

export type StoryChapter =
  | { kind: 'tagline'; movie: GroupedMovie }
  | { kind: 'stripes'; movies: GroupedMovie[] }
  | { kind: 'calendar' }
  | { kind: 'mosaic'; movies: GroupedMovie[] }
  | { kind: 'outro' };

const hasTagline = (m: GroupedMovie) => Boolean(m.tagline && m.tagline.trim());
const hasStripeVisual = (m: GroupedMovie) =>
  Boolean((m.extraBackdrops && m.extraBackdrops.length > 0) || m.backdrop_path);

/**
 * Trasforma i film in programmazione nella sequenza di capitoli dello
 * scrollytelling. I capitoli senza contenuto vengono omessi, mai resi vuoti.
 */
export function buildStory(movies: GroupedMovie[]): StoryChapter[] {
  if (movies.length === 0) return [];

  const chapters: StoryChapter[] = [];
  const featured = new Set<number>();
  const taglineMovies = movies.filter(hasTagline);

  const first = taglineMovies[0];
  if (first) {
    chapters.push({ kind: 'tagline', movie: first });
    featured.add(first.id);
  }

  let stripeMovies = movies.filter(m => hasStripeVisual(m) && !featured.has(m.id)).slice(0, 3);
  if (stripeMovies.length === 0 && !first) {
    stripeMovies = movies.filter(hasStripeVisual).slice(0, 2);
  }
  if (stripeMovies.length > 0) {
    chapters.push({ kind: 'stripes', movies: stripeMovies });
    stripeMovies.forEach(m => featured.add(m.id));
  }

  chapters.push({ kind: 'calendar' });

  const second =
    taglineMovies.find(m => !featured.has(m.id)) ||
    taglineMovies.find(m => m.id !== first?.id);
  if (second) {
    chapters.push({ kind: 'tagline', movie: second });
  }

  const mosaicMovies = movies.filter(m => m.poster_path);
  if (mosaicMovies.length >= 3) {
    chapters.push({ kind: 'mosaic', movies: mosaicMovies });
  }

  chapters.push({ kind: 'outro' });
  return chapters;
}
