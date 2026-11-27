/**
 * Gli scaffali del catalogo, come in una videoteca.
 *
 * Cento poster tutti uguali in una griglia non si sfogliano: si scorrono finché
 * l'occhio smette di vederli. Divisi in righe con un nome — arrivati da poco,
 * il cinema di un regista, sotto i cento minuti — ogni riga è già una domanda
 * a cui si risponde al volo: "stasera voglio qualcosa di così".
 *
 * Puro come `autoPick` e `taste`: riceve il catalogo già giudicato e
 * restituisce righe di ID. Niente database, niente rete.
 */

export interface ShelfFilm {
  tmdbId: string;
  title: string;
  year: number | null;
  runtime: number | null;
  director: string | null;
  genres: string[];
  voteAverage: number | null;
  voteCount: number | null;
  awardLabels: string[];
  scheduledCount: number;
  /** Quando è arrivato (vedi `arrivalTimes`), in millisecondi. */
  addedAt: number | null;
  /** Il gusto della sala, circa fra -2 e +2 (vedi `taste.ts`). */
  taste: number;
  canon: boolean;
  stars?: number;
  watchlist?: boolean;
  salaList?: boolean;
}

export interface Shelf {
  key: string;
  title: string;
  /** Una riga che spiega perché quei film stanno insieme. */
  hint: string;
  ids: string[];
}

export interface ShelvesResult {
  shelves: Shelf[];
  /** I film da mettere in vetrina in cima, in ordine. */
  heroIds: string[];
}

interface Options {
  /** Cambia il "pescati a caso", i registi di scorta e la vetrina. */
  seed: number;
  /** Il presente, per sapere cos'è "di recente". */
  now: number;
  perShelf?: number;
}

/** Sotto questa soglia una riga non è una riga: sono due poster spaiati. */
const MIN_SHELF = 4;

const GENRE_TITLES: Record<string, string> = {
  Commedia: 'Commedie',
  Dramma: 'Drammi',
  Documentario: 'Documentari',
  Animazione: 'Animazione',
  Fantascienza: 'Fantascienza',
  Horror: 'Horror',
  Thriller: 'Thriller',
  Romance: 'Storie d’amore',
  Crime: 'Crime e noir',
  Western: 'Western',
  Guerra: 'Film di guerra',
  Musica: 'Musica in sala',
  Famiglia: 'Per famiglie',
  Storia: 'La storia al cinema',
  Mistero: 'Misteri',
  Avventura: 'Avventura',
  Azione: 'Azione',
  Fantasy: 'Fantasy',
};

const DECADE_NAMES: Record<number, string> = {
  1920: 'Venti', 1930: 'Trenta', 1940: 'Quaranta', 1950: 'Cinquanta',
  1960: 'Sessanta', 1970: 'Settanta', 1980: 'Ottanta', 1990: 'Novanta',
};

/**
 * Quando è arrivato ogni film. Vale la data di Plex, quando c'è. Altrimenti
 * quella in cui il film è entrato in catalogo — ma non per l'importazione
 * iniziale: novecento film scritti lo stesso giorno non sono "arrivati di
 * recente", sono il catalogo. Un giorno con più di un film su cinque (e almeno
 * quaranta) è un'importazione in blocco, e i suoi film restano senza data.
 */
export function arrivalTimes(
  films: { tmdbId: string; addedAt: number | null; catalogedAt: number | null }[],
): Map<string, number | null> {
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const perDay = new Map<string, number>();
  for (const f of films) if (f.catalogedAt != null) perDay.set(dayOf(f.catalogedAt), (perDay.get(dayOf(f.catalogedAt)) ?? 0) + 1);
  const bulk = Math.max(40, films.length / 5);
  return new Map(
    films.map((f) => {
      if (f.addedAt != null) return [f.tmdbId, f.addedAt];
      if (f.catalogedAt == null || (perDay.get(dayOf(f.catalogedAt)) ?? 0) > bulk) return [f.tmdbId, null];
      return [f.tmdbId, f.catalogedAt];
    }),
  );
}

function rngOf(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** I registi di un film: "Joel Coen, Ethan Coen" sono due. */
export function directorsOf(f: Pick<ShelfFilm, 'director'>): string[] {
  if (!f.director) return [];
  return f.director
    .split(/,|&/)
    .map((d) => d.trim())
    .filter(Boolean);
}

/**
 * Quanto un film merita di stare davanti in una riga qualunque: il gusto della
 * sala prima di tutto, poi un voto che abbia abbastanza voti alle spalle.
 */
function merit(f: ShelfFilm): number {
  const votes = f.voteCount ?? 0;
  const vote = f.voteAverage != null && votes >= 50 ? (f.voteAverage - 6.5) * 0.5 : 0;
  return f.taste + vote + (f.awardLabels.length ? 0.3 : 0);
}

export function buildShelves(films: ShelfFilm[], opts: Options): ShelvesResult {
  const per = opts.perShelf ?? 30;
  const rng = rngOf(opts.seed);
  // Un po' di rumore fisso per seme: due film di pari merito non si contendono
  // il primo posto, e "rimescola" cambia davvero le righe.
  const jitter = new Map(films.map((f) => [f.tmdbId, rng() * 0.6]));
  const rank = (f: ShelfFilm) => merit(f) + (jitter.get(f.tmdbId) ?? 0);
  const byRank = (a: ShelfFilm, b: ShelfFilm) => rank(b) - rank(a);

  const shelves: Shelf[] = [];
  // I film già visti in testa a una riga precedente. Le righe ordinate per
  // merito si aprono tutte con gli stessi tre capolavori, e la quinta volta che
  // li vedi smetti di guardare: lì passano in fondo, e davanti va chi non si è
  // ancora visto. Le righe con un ordine loro (le date, il voto) restano com'è.
  const front = new Set<string>();
  const FRONT = 10;
  const push = (key: string, title: string, hint: string, list: ShelfFilm[], min = MIN_SHELF, spread = true) => {
    if (list.length < min) return;
    const ordered = spread
      ? [...list.filter((f) => !front.has(f.tmdbId)), ...list.filter((f) => front.has(f.tmdbId))]
      : list;
    const ids = ordered.slice(0, per).map((f) => f.tmdbId);
    for (const id of ids.slice(0, FRONT)) front.add(id);
    shelves.push({ key, title, hint, ids });
  };
  const ranked = (list: ShelfFilm[]) => [...list].sort(byRank);

  const thisYear = new Date(opts.now).getFullYear();

  // ── Le righe fisse ────────────────────────────────────────────────────────
  const fresh = films
    .filter((f) => f.addedAt != null)
    .sort((a, b) => b.addedAt! - a.addedAt! || byRank(a, b));
  const forYou = films.filter((f) => f.taste >= 0.6).sort(byRank);
  const released = films
    .filter((f) => f.year != null && f.year >= thisYear - 3)
    .sort((a, b) => b.year! - a.year! || byRank(a, b));
  const never = ranked(films.filter((f) => f.scheduledCount === 0));
  const watch = ranked(films.filter((f) => f.watchlist));
  const sala = ranked(films.filter((f) => f.salaList));
  const awarded = films
    .filter((f) => f.awardLabels.length > 0)
    .sort((a, b) => b.awardLabels.length - a.awardLabels.length || byRank(a, b));
  const acclaimed = films
    .filter((f) => (f.voteAverage ?? 0) >= 7.4 && (f.voteCount ?? 0) >= 200)
    .sort((a, b) => b.voteAverage! - a.voteAverage!);
  const loved = films
    .filter((f) => (f.stars ?? 0) >= 4)
    .sort((a, b) => b.stars! - a.stars! || byRank(a, b));
  const short = ranked(films.filter((f) => f.runtime != null && f.runtime > 0 && f.runtime < 100));
  const long = ranked(films.filter((f) => (f.runtime ?? 0) > 150));
  const canon = ranked(films.filter((f) => f.canon));
  const again = films
    .filter((f) => f.scheduledCount > 0)
    .sort((a, b) => b.scheduledCount - a.scheduledCount || byRank(a, b));
  const random = [...films].sort((a, b) => (jitter.get(a.tmdbId) ?? 0) - (jitter.get(b.tmdbId) ?? 0));

  // ── I registi ─────────────────────────────────────────────────────────────
  // Un regista ha la sua riga se in libreria ha almeno tre film. Davanti quelli
  // che la sala ama di più; in coda, a turno secondo il seme, gli altri.
  const byDirector = new Map<string, ShelfFilm[]>();
  for (const f of films) {
    for (const d of directorsOf(f)) byDirector.set(d, [...(byDirector.get(d) ?? []), f]);
  }
  const directors = [...byDirector.entries()]
    .filter(([, list]) => list.length >= 3)
    .map(([name, list]) => ({
      name,
      list: ranked(list),
      score: list.reduce((s, f) => s + f.taste, 0) / list.length + Math.log2(list.length) * 0.3,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const leading = directors.slice(0, 6);
  const rest = directors.slice(6).map((d) => ({ d, k: rng() })).sort((a, b) => a.k - b.k).map(({ d }) => d);
  const directorShelves = [...leading, ...rest.slice(0, 6)];
  const directorShelf = (d: { name: string; list: ShelfFilm[] }) =>
    push(`director:${d.name}`, `Il cinema di ${d.name}`, `${d.list.length} film in libreria`, d.list, 3, false);

  // ── I generi ──────────────────────────────────────────────────────────────
  const byGenre = new Map<string, ShelfFilm[]>();
  for (const f of films) for (const g of f.genres) byGenre.set(g, [...(byGenre.get(g) ?? []), f]);
  const genres = [...byGenre.entries()]
    .filter(([, list]) => list.length >= 6)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 9);

  // ── I decenni ─────────────────────────────────────────────────────────────
  const byDecade = new Map<number, ShelfFilm[]>();
  for (const f of films) {
    if (f.year == null || f.year >= 2000) continue;
    const d = Math.floor(f.year / 10) * 10;
    byDecade.set(d, [...(byDecade.get(d) ?? []), f]);
  }
  const decades = [...byDecade.entries()].filter(([, list]) => list.length >= 6).sort((a, b) => a[0] - b[0]);

  // ── L'ordine delle righe ──────────────────────────────────────────────────
  push('fresh', 'Arrivati di recente', 'Gli ultimi entrati nella libreria', fresh, MIN_SHELF, false);
  push('forYou', 'Scelti per la sala', 'Dal tuo diario Letterboxd e dai registi che ami', forYou, MIN_SHELF, false);
  push('released', 'Usciti di recente', `Film dal ${thisYear - 3} a oggi`, released, MIN_SHELF, false);
  push('watchlist', 'Nella tua watchlist', 'Quelli che volevi vedere: in sala li vedi', watch, 3);
  push('never', 'Mai programmati', 'Non sono ancora passati in sala', never);
  push('sala', 'La tua lista VestriCinema', 'I film che hai segnato per la sala', sala, 3);
  directorShelves.slice(0, 3).forEach(directorShelf);
  push('awarded', 'Premiati dalla critica', 'Con premi riconosciuti nei festival', awarded);
  push('acclaimed', 'Acclamati', 'Voto alto, e tanti voti alle spalle', acclaimed, MIN_SHELF, false);
  push('loved', 'I tuoi preferiti', 'Quattro stelle e più nel tuo diario', loved);
  directorShelves.slice(3, 6).forEach(directorShelf);
  push('short', 'Sotto i 100 minuti', 'Entrano in quasi ogni buco', short);
  push('canon', 'La storia del cinema', 'Dal canone dei film da conoscere', canon);
  for (const [g, list] of genres) push(`genre:${g}`, GENRE_TITLES[g] ?? g, `${list.length} film in libreria`, ranked(list));
  directorShelves.slice(6).forEach(directorShelf);
  for (const [d, list] of decades) {
    push(`decade:${d}`, DECADE_NAMES[d] ? `Gli anni ${DECADE_NAMES[d]}` : `Gli anni ${d}`, `Dal ${d} al ${d + 9}`, ranked(list));
  }
  push('long', 'Una serata intera', 'Oltre due ore e mezza', long);
  push('again', 'Già passati in sala', 'I film che hai programmato più spesso', again, MIN_SHELF, false);
  push('random', 'Pescati a caso', 'Rimescola per cambiarli', random, MIN_SHELF, false);

  // ── La vetrina ────────────────────────────────────────────────────────────
  // Cinque film fra i migliori arrivati da poco e i più "della sala", alternati.
  const heroPool: ShelfFilm[] = [];
  const seen = new Set<string>();
  const a = fresh.slice(0, 12).filter((f) => f.taste >= 0 || f.awardLabels.length);
  const b = forYou.slice(0, 16);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    for (const f of [a[i], b[i]]) {
      if (f && !seen.has(f.tmdbId)) {
        seen.add(f.tmdbId);
        heroPool.push(f);
      }
    }
  }
  if (heroPool.length < 5) for (const f of ranked(films)) if (!seen.has(f.tmdbId) && heroPool.push(f) >= 12) break;
  const heroIds = heroPool
    .map((f, i) => ({ f, k: i + rng() * 6 }))
    .sort((x, y) => x.k - y.k)
    .slice(0, 8)
    .map(({ f }) => f.tmdbId);

  return { shelves, heroIds };
}
