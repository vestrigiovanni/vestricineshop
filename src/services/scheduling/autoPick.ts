/**
 * Chi va in sala, e in che fascia.
 *
 * Il motore (`engine.ts`) sa disporre nel tempo i film che gli dai; non sa
 * *quali* film dargli. Finora quella scelta era tutta a mano: prima di vedere
 * un solo orario bisognava spuntare venti titoli dal catalogo, ed è la parte
 * che costava le ore.
 *
 * Questo modulo la fa al posto tuo. Resta **puro** come il motore — stessi
 * ingressi, stesso esito — perché è una scelta che va poi corretta: se
 * rigenerare desse ogni volta un risultato diverso per conto suo, non si
 * capirebbe mai se una modifica ha funzionato.
 *
 * L'IDEA — una giornata di cinema non è piatta. La mattina passa gente diversa
 * dalla seconda serata, e un film che tiene la prima serata non è lo stesso che
 * tiene le 10:30. Quindi non si sceglie "i venti film migliori" e poi li si
 * spalma: si guarda quanti posti ha ogni fascia, e per ogni fascia si cerca chi
 * ci sta bene. Le affinità qui sotto sono grossolane di proposito — sono un
 * punto di partenza da correggere in due clic, non un verdetto.
 */

import { BAND_WINDOWS, MIN_GAP_MINUTES, type Band } from './times';

/** Un film candidato, come lo conosce il catalogo. */
export interface AutoPickFilm {
  tmdbId: string;
  title: string;
  /** Durata in minuti. Senza, il film non è programmabile e viene scartato. */
  runtime: number;
  genres: string[];
  year: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  awardLabels: string[];
  /** Quando è entrato in libreria, in millisecondi. Le novità pesano di più. */
  addedAt: number | null;
  /** Quante volte è già stato programmato in passato. */
  scheduledCount: number;
  posterPath?: string | null;
  director?: string | null;
}

export interface AutoPickInput {
  pool: AutoPickFilm[];
  /** Quanti spettacoli ci sono da riempire in tutto. */
  capacity: number;
  /**
   * Quante volte, all'incirca, ogni film dovrebbe tornare.
   * Tre è il compromesso osservato: meno e il catalogo si svuota, più e la
   * settimana diventa monotona.
   */
  targetReplicas?: number;
  /** Cambia il seed per una proposta diversa ma riproducibile. */
  seed?: number;
  /** Film che l'utente ha già approvato: restano comunque. */
  keep?: string[];
  /** Film che l'utente ha scartato: non si ripropongono. */
  exclude?: string[];
  /** Generi già in cartellone nel periodo: se ne cercano di diversi. */
  genresInSchedule?: string[];
}

export interface AutoPickChoice {
  tmdbId: string;
  title: string;
  runtime: number;
  posterPath?: string | null;
  preferredBand: Band;
  replicas: number;
  /** Perché è finito lì, in parole: la UI lo mostra sulla card. */
  reason: string;
}

export interface AutoPickResult {
  films: AutoPickChoice[];
  warnings: string[];
}

/**
 * Quanti spettacoli entrano in ogni fascia, in proporzione.
 *
 * Ricavati dall'ampiezza delle fasce in `times.ts` divisa per la durata tipica
 * di uno spettacolo: il pomeriggio è largo cinque ore e mezza e ne regge più
 * del doppio della matinée. Non sono quote rigide — il motore poi fa come può —
 * ma dicono quanti titoli servono per ogni momento della giornata.
 */
const TYPICAL_SLOT = 120 + MIN_GAP_MINUTES;

function bandCapacityShare(): Record<Band, number> {
  const widths = (Object.keys(BAND_WINDOWS) as Band[]).map((b) => {
    const w = BAND_WINDOWS[b];
    // La matinée comincia all'apertura, non a mezzanotte.
    const from = b === 'matinee' ? 10 * 60 : w.from;
    return [b, Math.max(w.to - from, 0) / TYPICAL_SLOT] as const;
  });
  const total = widths.reduce((sum, [, v]) => sum + v, 0) || 1;
  return Object.fromEntries(widths.map(([b, v]) => [b, v / total])) as Record<Band, number>;
}

/**
 * Le affinità di genere, per fascia.
 *
 * Sono deliberatamente semplici, e nominate sia in italiano (TMDB risponde in
 * it-IT) sia in inglese, perché un catalogo importato in epoche diverse può
 * avere le due forme mescolate e un film non deve perdere la sua fascia per
 * come è stato scritto il suo genere.
 */
const BAND_GENRES: Record<Band, string[]> = {
  matinee: ['animazione', 'animation', 'famiglia', 'family', 'commedia', 'comedy', 'avventura', 'adventure', 'musica', 'music', 'documentario', 'documentary'],
  afternoon: ['commedia', 'comedy', 'avventura', 'adventure', 'azione', 'action', 'famiglia', 'family', 'fantasy', 'storia', 'history', 'romance', 'romantico'],
  evening: ['dramma', 'drama', 'azione', 'action', 'thriller', 'fantascienza', 'science fiction', 'avventura', 'adventure', 'crime', 'commedia', 'comedy'],
  night: ['horror', 'thriller', 'mistero', 'mystery', 'crime', 'guerra', 'war', 'western', 'fantascienza', 'science fiction', 'dramma', 'drama'],
};

/** Durate che stanno bene in ogni fascia: fuori da qui si paga un pegno. */
const BAND_RUNTIME: Record<Band, { ideal: number; max: number }> = {
  matinee: { ideal: 100, max: 135 },
  afternoon: { ideal: 115, max: 165 },
  evening: { ideal: 120, max: 175 },
  // La seconda serata è l'unica che può reggere il film lungo: comincia tardi
  // ma non deve finire prima di una certa ora, deve solo finire entro l'una.
  night: { ideal: 115, max: 185 },
};

/** PRNG deterministico (mulberry32): serve la varietà, non la crittografia. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Quanto è "forte" un film, indipendentemente dall'ora.
 *
 * Il voto da solo non basta: un 8,4 con quaranta voti non è un 8,4. Il numero
 * di voti entra come smorzatore, così un capolavoro poco visto resta buono ma
 * non scavalca un film amato da tutti quando c'è in gioco la prima serata.
 */
function strengthOf(f: AutoPickFilm): number {
  const vote = f.voteAverage ?? 6;
  const count = f.voteCount ?? 0;
  const confidence = count / (count + 400); // 0 senza voti, ~0.7 a 1000
  const base = 5 + (vote - 6) * confidence * 2.2;
  const awards = Math.min(f.awardLabels.length, 4) * 0.45;
  return base + awards;
}

/** Quanto è nuovo in libreria: 1 arrivato adesso, 0 da più di un anno. */
function freshnessOf(f: AutoPickFilm, now: number): number {
  if (!f.addedAt) return 0;
  const days = (now - f.addedAt) / 86_400_000;
  if (days <= 0) return 1;
  if (days >= 365) return 0;
  return 1 - days / 365;
}

function genreScore(f: AutoPickFilm, band: Band): number {
  const wanted = BAND_GENRES[band];
  const mine = f.genres.map(norm);
  const hits = mine.filter((g) => wanted.includes(g)).length;
  if (hits === 0) return 0;
  return Math.min(hits, 2) / 2;
}

function runtimeScore(f: AutoPickFilm, band: Band): number {
  const { ideal, max } = BAND_RUNTIME[band];
  if (f.runtime > max) return -1.2;
  const off = Math.abs(f.runtime - ideal);
  return Math.max(0, 1 - off / 60);
}

/**
 * Quanto sta bene questo film in questa fascia.
 *
 * La prima serata pesa la forza del film, la seconda serata la premia meno e
 * accetta il film lungo e difficile, la matinée guarda soprattutto la durata e
 * il genere. Sono pesi, non regole: nessuna fascia esclude nessuno, e il
 * risultato resta una proposta.
 */
export function bandAffinity(f: AutoPickFilm, band: Band, now: number): number {
  const g = genreScore(f, band);
  const r = runtimeScore(f, band);
  const s = strengthOf(f);
  const fresh = freshnessOf(f, now);

  switch (band) {
    case 'matinee':
      // La mattina vince la leggerezza, e un film corto: chi entra alle 10:30
      // non è venuto per tre ore di cinema d'autore.
      return g * 2.2 + r * 1.8 + s * 0.35 - (f.runtime > 140 ? 1.2 : 0);
    case 'afternoon':
      return g * 1.5 + r * 1.3 + s * 0.6 + fresh * 0.4;
    case 'evening':
      // La fascia che vale di più: ci va il film più forte che hai, e le novità
      // di libreria hanno la precedenza perché è lì che si fanno vedere.
      return s * 1.6 + g * 1.1 + r * 0.8 + fresh * 1.1 + Math.min(f.awardLabels.length, 3) * 0.3;
    case 'night':
      // Seconda serata: il film lungo, il genere che di mattina non si può
      // mettere, il titolo per chi resta.
      return g * 1.9 + s * 0.7 + r * 0.6 + (f.runtime >= 130 ? 0.6 : 0);
  }
}

/**
 * Sceglie i film e li assegna alle fasce.
 *
 * Il giro è per fascia, non per film: si guarda quanti spettacoli servono la
 * mattina, si prendono i film che ci stanno meglio, e si passa al pomeriggio.
 * Scegliere prima i film "migliori" e poi spalmarli produrrebbe una matinée
 * fatta di drammi da due ore e mezza — ed è esattamente ciò che succedeva.
 */
export function autoPick(input: AutoPickInput): AutoPickResult {
  const warnings: string[] = [];
  const now = Date.now();
  const rng = makeRng(input.seed ?? 1);
  const capacity = Math.max(Math.trunc(input.capacity), 0);
  const targetReplicas = Math.min(Math.max(input.targetReplicas ?? 3, 1), 8);

  if (capacity === 0) return { films: [], warnings: ['Non c\'è spazio da riempire in questo periodo.'] };

  const excluded = new Set(input.exclude ?? []);
  const kept = new Set(input.keep ?? []);
  const tired = new Set((input.genresInSchedule ?? []).map(norm));

  const pool = input.pool.filter(
    (f) => f.tmdbId && Number.isFinite(f.runtime) && f.runtime > 0 && !excluded.has(f.tmdbId)
  );

  if (pool.length === 0) {
    return {
      films: [],
      warnings: ['Nessun film utilizzabile in catalogo: servono titoli con una durata nota.'],
    };
  }

  const share = bandCapacityShare();
  const bands: Band[] = ['evening', 'night', 'afternoon', 'matinee'];

  // Quanti spettacoli per fascia, e quindi quanti titoli servono per ognuna.
  // Si parte dalla prima serata perché è la fascia che vale di più: se i film
  // forti sono pochi, devono finire lì e non essere già stati spesi altrove.
  const slotsPerBand = new Map<Band, number>();
  let assigned = 0;
  bands.forEach((b, i) => {
    const n = i === bands.length - 1 ? capacity - assigned : Math.round(capacity * share[b]);
    slotsPerBand.set(b, Math.max(n, 0));
    assigned += Math.max(n, 0);
  });

  const taken = new Set<string>();
  const usedGenres = new Map<string, number>();
  const usedDirectors = new Map<string, number>();
  const chosen: AutoPickChoice[] = [];

  /**
   * Il pegno della ripetizione: ogni volta che un genere o un regista torna,
   * il successivo dello stesso tipo vale un po' meno. È così che una settimana
   * non diventa sei thriller e un documentario.
   */
  const varietyPenalty = (f: AutoPickFilm): number => {
    const g = f.genres.map(norm).reduce((sum, name) => sum + (usedGenres.get(name) ?? 0), 0);
    const d = f.director ? (usedDirectors.get(norm(f.director)) ?? 0) : 0;
    const stale = f.genres.map(norm).some((name) => tired.has(name)) ? 0.5 : 0;
    // Un film già passato in sala non è escluso, ma parte indietro rispetto a
    // uno che non hai mai proiettato.
    const seen = Math.min(f.scheduledCount, 3) * 0.4;
    return g * 0.35 + d * 0.8 + stale + seen;
  };

  const remember = (f: AutoPickFilm) => {
    for (const g of f.genres.map(norm)) usedGenres.set(g, (usedGenres.get(g) ?? 0) + 1);
    if (f.director) usedDirectors.set(norm(f.director), (usedDirectors.get(norm(f.director)) ?? 0) + 1);
    taken.add(f.tmdbId);
  };

  const byId = new Map(pool.map((f) => [f.tmdbId, f]));

  // ── I film che l'utente vuole tenere entrano per primi ─────────────────────
  // Sono una decisione già presa: si mettono nella fascia che li valorizza di
  // più e non competono con nessuno.
  for (const id of kept) {
    const f = byId.get(id);
    if (!f || taken.has(id)) continue;
    const band = bands.reduce((best, b) =>
      bandAffinity(f, b, now) > bandAffinity(f, best, now) ? b : best
    , bands[0]);
    chosen.push({
      tmdbId: f.tmdbId,
      title: f.title,
      runtime: f.runtime,
      posterPath: f.posterPath,
      preferredBand: band,
      replicas: 0, // assegnate più sotto, quando si conoscono tutti
      reason: 'L\'hai voluto tu',
    });
    remember(f);
    slotsPerBand.set(band, Math.max((slotsPerBand.get(band) ?? 0) - targetReplicas, 0));
  }

  // ── Poi si riempie fascia per fascia ──────────────────────────────────────
  for (const band of bands) {
    const slots = slotsPerBand.get(band) ?? 0;
    if (slots <= 0) continue;
    const wanted = Math.max(Math.ceil(slots / targetReplicas), 1);

    // Il pizzico di caso serve a non ottenere due volte di fila la stessa
    // identica settimana quando si chiede "rigenera": resta piccolo perché non
    // deve ribaltare una scelta, solo scioglierne i pareggi. Si sorteggia una
    // volta per film e resta fisso, altrimenti la classifica cambierebbe fra
    // una scelta e l'altra e il seed non garantirebbe più niente.
    const jitter = new Map(pool.map((f) => [f.tmdbId, rng() * 0.35]));

    // Si sceglie uno alla volta, e ogni volta si rifà la classifica: il pegno
    // di varietà cambia dopo ogni scelta, quindi una graduatoria calcolata in
    // partenza sarebbe già vecchia al secondo titolo — ed è proprio lì che
    // serve, perché è al secondo titolo che comincia a ripetersi il genere.
    for (let i = 0; i < wanted; i++) {
      let best: AutoPickFilm | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const f of pool) {
        if (taken.has(f.tmdbId)) continue;
        const score = bandAffinity(f, band, now) - varietyPenalty(f) + (jitter.get(f.tmdbId) ?? 0);
        if (score > bestScore) {
          bestScore = score;
          best = f;
        }
      }

      if (!best) break; // catalogo esaurito: meglio pochi film che un doppione

      chosen.push({
        tmdbId: best.tmdbId,
        title: best.title,
        runtime: best.runtime,
        posterPath: best.posterPath,
        preferredBand: band,
        replicas: 0,
        reason: reasonFor(best, band, now),
      });
      remember(best);
    }
  }

  if (chosen.length === 0) {
    return { films: [], warnings: ['Non sono riuscito a scegliere nessun film dal catalogo.'] };
  }

  // ── Le repliche ───────────────────────────────────────────────────────────
  // Si distribuiscono dentro ogni fascia, così i posti della prima serata
  // restano alla prima serata anche se i film scelti per la mattina sono di più.
  for (const band of bands) {
    const mine = chosen.filter((c) => c.preferredBand === band);
    if (mine.length === 0) continue;
    const slots = Math.round(capacity * share[band]);
    const base = Math.floor(slots / mine.length);
    const rest = slots % mine.length;
    mine.forEach((c, i) => {
      c.replicas = Math.max(base + (i < rest ? 1 : 0), 1);
    });
  }

  const planned = chosen.reduce((sum, c) => sum + c.replicas, 0);
  if (planned < capacity * 0.7) {
    warnings.push(
      `Il catalogo utilizzabile basta per ${planned} spettacoli su ${capacity}: allarga i filtri o aggiungi film in libreria.`
    );
  }

  return { films: chosen, warnings };
}

/** Perché questo film in questa fascia, in una riga leggibile. */
function reasonFor(f: AutoPickFilm, band: Band, now: number): string {
  if (f.awardLabels.length > 0 && band === 'evening') {
    return `Premiato (${f.awardLabels.slice(0, 2).join(', ')})`;
  }
  if (freshnessOf(f, now) > 0.7) return 'Appena entrato in libreria';
  if ((f.voteAverage ?? 0) >= 7.5 && (f.voteCount ?? 0) >= 500) {
    return `Acclamato · ${f.voteAverage?.toFixed(1)}`;
  }
  if (band === 'matinee' && f.runtime <= 110) return 'Corto e leggero, buono di mattina';
  if (band === 'night' && f.runtime >= 130) return 'Lungo: ci sta in seconda serata';
  const g = f.genres[0];
  if (g) return `${g}, adatto alla fascia`;
  return 'Scelto dal catalogo';
}
