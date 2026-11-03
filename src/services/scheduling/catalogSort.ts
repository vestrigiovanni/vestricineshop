/**
 * I modi di mettere in fila tutta la libreria, per sfogliarla intera nella
 * scelta dei film. "Consigliati" è il caso pesato sul gusto di Gio, "A caso"
 * è il caso e basta; gli altri sono ordini fissi. A parità si va per titolo,
 * così due pagine di fila non si pestano i piedi.
 */
export type CatalogSort =
  | 'mix'
  | 'random'
  | 'arrived'
  | 'title'
  | 'newest'
  | 'oldest'
  | 'director'
  | 'shortest'
  | 'leastShown';

export const CATALOG_SORTS: { value: CatalogSort; label: string }[] = [
  { value: 'mix', label: 'Consigliati' },
  { value: 'random', label: 'A caso' },
  { value: 'arrived', label: 'Ultimi arrivati' },
  { value: 'title', label: 'Titolo A–Z' },
  { value: 'newest', label: 'Più recenti' },
  { value: 'oldest', label: 'Più vecchi' },
  { value: 'director', label: 'Per regista' },
  { value: 'shortest', label: 'Più corti' },
  { value: 'leastShown', label: 'Meno programmati' },
];

export function isCatalogSort(v: unknown): v is CatalogSort {
  return CATALOG_SORTS.some((s) => s.value === v);
}

export interface SortableFilm {
  title: string;
  year: number | null;
  director: string | null;
  runtime: number | null;
  scheduledCount: number;
  /** Quando è arrivato in libreria; null se non si sa. */
  arrivedAt: number | null;
  /** Il punteggio di gusto, per "Consigliati". */
  taste: number;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const byTitle = (a: SortableFilm, b: SortableFilm) => a.title.localeCompare(b.title, 'it', { sensitivity: 'base' });

/** I valori che mancano vanno in fondo, in qualunque verso. */
function missingLast(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

export function sortCatalog<T extends SortableFilm>(films: T[], sort: CatalogSort, seed: number): T[] {
  if (sort === 'mix' || sort === 'random') {
    const rng = seeded(seed);
    const weight = sort === 'mix' ? 1 : 0;
    return films
      .map((f) => ({ f, key: rng() * 3 + f.taste * weight }))
      .sort((x, y) => y.key - x.key)
      .map(({ f }) => f);
  }
  const compare: Record<Exclude<CatalogSort, 'mix' | 'random'>, (a: T, b: T) => number> = {
    arrived: (a, b) => missingLast(a.arrivedAt, b.arrivedAt, -1),
    title: () => 0,
    newest: (a, b) => missingLast(a.year, b.year, -1),
    oldest: (a, b) => missingLast(a.year, b.year, 1),
    director: (a, b) => {
      if (!a.director || !b.director) return a.director ? -1 : b.director ? 1 : 0;
      return a.director.localeCompare(b.director, 'it', { sensitivity: 'base' }) || missingLast(a.year, b.year, 1);
    },
    shortest: (a, b) => missingLast(a.runtime, b.runtime, 1),
    leastShown: (a, b) => a.scheduledCount - b.scheduledCount,
  };
  const cmp = compare[sort];
  return [...films].sort((a, b) => cmp(a, b) || byTitle(a, b));
}
