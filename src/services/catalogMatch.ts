// Logica pura di abbinamento CSV ⇄ TMDB. Nessuna dipendenza da rete/DB: testabile in isolamento.

export function normalizeText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove accenti
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function yearOf(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const y = parseInt(String(releaseDate).slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export function yearMatches(
  csvYear: number | null | undefined,
  releaseDate: string | null | undefined,
  tolerance = 1,
): boolean {
  if (csvYear == null) return true; // niente anno da confrontare → non penalizzare
  const y = yearOf(releaseDate);
  if (y == null) return false;
  return Math.abs(y - csvYear) <= tolerance;
}

export function directorMatches(
  csvDirector: string | null | undefined,
  tmdbDirectors: string[],
): boolean {
  const a = normalizeText(csvDirector);
  if (!a) return false;
  return tmdbDirectors.some((d) => {
    const b = normalizeText(d);
    if (!b) return false;
    if (a === b) return true;
    const la = a.split(' ').pop() || '';
    const lb = b.split(' ').pop() || '';
    return la.length > 2 && la === lb; // fallback sul cognome
  });
}

export interface MatchCandidate {
  id: string;
  title: string;
  releaseDate?: string | null;
  directors: string[];
}

export interface CsvRowForMatch {
  title: string;
  year: number | null;
  director: string | null;
}

export function pickBestMatch(
  row: CsvRowForMatch,
  candidates: MatchCandidate[],
): { tmdbId: string; status: 'ok' | 'suspect' } | null {
  if (!candidates.length) return null;
  const titleNorm = normalizeText(row.title);

  const strong = candidates.find(
    (c) => yearMatches(row.year, c.releaseDate) && directorMatches(row.director, c.directors),
  );
  if (strong) return { tmdbId: strong.id, status: 'ok' };

  const yearTitle = candidates.find(
    (c) => yearMatches(row.year, c.releaseDate) && normalizeText(c.title) === titleNorm,
  );
  if (yearTitle) return { tmdbId: yearTitle.id, status: 'suspect' };

  const anyYear = candidates.find((c) => yearMatches(row.year, c.releaseDate));
  if (anyYear) return { tmdbId: anyYear.id, status: 'suspect' };

  const exactTitle = candidates.find((c) => normalizeText(c.title) === titleNorm);
  if (exactTitle) return { tmdbId: exactTitle.id, status: 'suspect' };

  return null;
}
