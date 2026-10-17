/**
 * Il gusto della sala.
 *
 * Una monosala d'essai non programma per popolarità: programma come la
 * programmerebbe chi la tiene. Quel gusto è scritto, film per film, nel diario
 * Letterboxd di Gio — voti, cuori, watchlist, la lista "VestriCinema" dei film
 * che vorrebbe in sala e il canone di "Storia del cinema". Lo script
 * `scripts/letterboxd-taste.mjs` lo trasforma in `src/data/gusto-sala.json`;
 * questo modulo lo confronta col catalogo.
 *
 * Resta puro come `autoPick`: riceve i dati e il catalogo, restituisce un
 * giudizio per film. Niente database, niente rete.
 *
 * L'abbinamento è per titolo e anno, perché l'esportazione di Letterboxd non
 * porta l'ID TMDB. Letterboxd scrive i titoli in inglese, il catalogo in
 * italiano e in originale: si provano tutti e tre, e l'anno può scostarsi di
 * uno (uscita in sala contro festival). Un film non trovato non è un film
 * bocciato: semplicemente non ha un voto, e lì entra il regista.
 */

export interface TasteData {
  /** [titolo, anno, stelle 0.5–5 o null se solo cuore, cuore 0/1] */
  ratings: [string, number | null, number | null, number][];
  watchlist: [string, number | null][];
  lists: Partial<Record<'sala' | 'canone', [string, number | null][]>>;
}

export interface TasteFilm {
  tmdbId: string;
  title: string;
  originalTitle?: string | null;
  year: number | null;
  director?: string | null;
}

export interface TasteVerdict {
  /**
   * Quanto il film è "della sala", circa fra -2 e +2. Zero è neutro: nessuno
   * l'ha visto, il regista non dice niente.
   */
  score: number;
  /** Il motivo in parole, per la card. Null se non c'è niente da dire. */
  note: string | null;
  /** Sta nel canone di "Storia del cinema" o del documentario. */
  canon: boolean;
}

/**
 * I registi di riferimento, dal ritratto di Gio nel suo vault. Valgono come un
 * quattro e mezzo anche quando il catalogo non ha ancora un loro film votato.
 */
const MAESTRI = [
  'luca guadagnino',
  'gus van sant',
  'gaspar noe',
  'xavier dolan',
  'wim wenders',
  'nicolas winding refn',
  'sean baker',
];
const MAESTRO_AVG = 4.5;

export const normTitle = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normName = normTitle;

/** Un indice titolo|anno che perdona lo scarto di un anno. */
class TitleIndex<T> {
  private map = new Map<string, T>();
  add(title: string, year: number | null, value: T) {
    const t = normTitle(title);
    if (!t) return;
    const k = `${t}|${year ?? ''}`;
    if (!this.map.has(k)) this.map.set(k, value);
  }
  find(titles: (string | null | undefined)[], year: number | null): T | undefined {
    const years = year == null ? [null] : [year, year - 1, year + 1];
    for (const y of years) {
      for (const title of titles) {
        if (!title) continue;
        const hit = this.map.get(`${normTitle(title)}|${y ?? ''}`);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  }
}

const starsLabel = (s: number) => `${s.toLocaleString('it-IT')}★`;

/** Da stelle Letterboxd a punteggio: il tre è neutro, il cinque vale +1,8. */
const fromStars = (s: number) => (s - 3) * 0.9;

export function judgeTaste(data: TasteData, pool: TasteFilm[]): Map<string, TasteVerdict> {
  const ratings = new TitleIndex<{ stars: number | null; liked: boolean }>();
  for (const [name, year, stars, liked] of data.ratings) ratings.add(name, year, { stars, liked: liked === 1 });
  const watch = new TitleIndex<true>();
  for (const [name, year] of data.watchlist) watch.add(name, year, true);
  const sala = new TitleIndex<true>();
  for (const [name, year] of data.lists.sala ?? []) sala.add(name, year, true);
  const canone = new TitleIndex<true>();
  for (const [name, year] of data.lists.canone ?? []) canone.add(name, year, true);

  const titlesOf = (f: TasteFilm) => [f.title, f.originalTitle];

  // Primo giro: il voto di ciascun film, quando c'è.
  const personal = new Map<string, number | null>();
  const byDirector = new Map<string, number[]>();
  for (const f of pool) {
    const hit = ratings.find(titlesOf(f), f.year);
    if (!hit) continue;
    // Un cuore senza stelle vale un quattro: è piaciuto, non si sa quanto.
    const stars = hit.stars ?? (hit.liked ? 4 : null);
    personal.set(f.tmdbId, stars);
    if (stars != null && f.director) {
      const d = normName(f.director);
      byDirector.set(d, [...(byDirector.get(d) ?? []), stars]);
    }
  }
  for (const m of MAESTRI) if (!byDirector.has(m)) byDirector.set(m, [MAESTRO_AVG]);

  // Secondo giro: chi non ha un voto prende quello del suo regista, se il
  // regista ha già detto abbastanza (due film, o uno solo ma amato).
  const directorAvg = (name: string | null | undefined): number | null => {
    if (!name) return null;
    // "Joel Coen, Ethan Coen": basta che uno dei due sia di casa.
    const avgs = name
      .split(/,|&| e | and /)
      .map((p) => byDirector.get(normName(p)))
      .filter((v): v is number[] => Boolean(v))
      .filter((v) => v.length >= 2 || v[0] >= 4.5 || v[0] <= 1.5)
      .map((v) => v.reduce((a, b) => a + b, 0) / v.length);
    return avgs.length ? Math.max(...avgs) : null;
  };

  const out = new Map<string, TasteVerdict>();
  for (const f of pool) {
    const canon = canone.find(titlesOf(f), f.year) === true;
    const stars = personal.get(f.tmdbId);
    const hit = ratings.find(titlesOf(f), f.year);

    if (stars != null) {
      const score = fromStars(stars) + (hit?.liked ? 0.3 : 0);
      const note =
        stars >= 5 ? 'Cinque stelle per te' : stars >= 4 ? `Ti è piaciuto: ${starsLabel(stars)}` : null;
      out.set(f.tmdbId, { score, note, canon });
      continue;
    }

    let score = 0;
    let note: string | null = null;
    const avg = directorAvg(f.director);
    if (avg != null) {
      score += Math.max(Math.min((avg - 3) * 0.6, 1.1), -1);
      if (avg >= 4) note = `Di ${f.director}, che ami`;
    }
    if (watch.find(titlesOf(f), f.year)) {
      score += 0.7;
      note = 'Nella tua watchlist';
    } else if (sala.find(titlesOf(f), f.year)) {
      score += 0.6;
      note ??= 'Nella tua lista VestriCinema';
    }
    if (canon) {
      score += 0.4;
      note ??= 'Dal canone della storia del cinema';
    }
    out.set(f.tmdbId, { score, note, canon });
  }
  return out;
}
