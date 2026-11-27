/**
 * Da più librerie Plex a un elenco di film, uno per opera.
 *
 * Sta in un file suo — e senza nessun effetto al caricamento — perché è l'unica
 * parte di `plex-sync.mjs` che si può sbagliare in silenzio: un doppione non
 * riconosciuto diventa una riga in più in catalogo, e ci si accorge del guaio
 * settimane dopo, programmando. Qui è codice puro, e quindi è codice testato.
 */

/**
 * Chi è questo film, indipendentemente da quale libreria lo ospita.
 *
 * L'id TMDB quando c'è, perché è lo stesso per la copia normale e per quella
 * 4K. Altrimenti titolo e anno normalizzati, che è il meglio che resta quando
 * Plex non ha riconosciuto il film.
 */
export function identityOf(film) {
  if (film.tmdbId) return `tmdb:${film.tmdbId}`;
  const title = String(film.title ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `title:${title}|${film.year ?? ''}`;
}

/** I campi che una copia in un'altra libreria può riempire se alla prima mancano. */
const FILLABLE = [
  'tmdbId',
  'imdbId',
  'originalTitle',
  'director',
  'summary',
  'contentRating',
  'durationMin',
  'year',
];

/**
 * IL PUNTO — la copia normale e quella 4K sono lo stesso film, e il catalogo
 * elenca film, non file. Mandarle come due voci distinte significherebbe due
 * righe in catalogo con lo stesso titolo: doppioni fra cui scegliere a ogni
 * programmazione, e doppioni in home. La riga resta una, e si porta dietro
 * l'elenco delle librerie in cui quel film esiste.
 *
 * La prima libreria dell'elenco dà l'identità (il `plexKey`, cioè la riga di
 * catalogo); le altre riempiono solo i campi che alla prima mancano. Così
 * l'identità della riga non balla da una sincronizzazione all'altra.
 */
export function mergeAcrossLibraries(films) {
  // ── Primo giro: per identità ────────────────────────────────────────────
  const byIdentity = new Map();
  const entries = [];
  const orderOf = new Map();

  for (const film of films) {
    const id = identityOf(film);
    const seen = byIdentity.get(id);
    if (seen) {
      mergeInto(seen, film);
      continue;
    }
    const entry = { ...film, libraries: [...film.libraries] };
    byIdentity.set(id, entry);
    orderOf.set(entry, entries.length);
    entries.push(entry);
  }

  // ── Secondo giro: le copie che Plex non ha riconosciuto ─────────────────
  // Capita che lo stesso film sia riconosciuto in una libreria e non nell'altra
  // — il rip 4K con un nome file storto, tipicamente. Al primo giro le due
  // copie hanno identità diverse (una per id TMDB, l'altra per titolo) e
  // resterebbero due righe di catalogo per lo stesso film: il doppione che
  // tutto questo lavoro serve a evitare. Qui la copia senza id si riattacca al
  // film riconosciuto che ha lo stesso titolo e lo stesso anno.
  const byTitle = new Map();
  for (const entry of entries) {
    if (entry.tmdbId) byTitle.set(titleKeyOf(entry), entry);
  }

  const dropped = new Set();
  for (const entry of entries) {
    if (entry.tmdbId || dropped.has(entry)) continue;
    const host = byTitle.get(titleKeyOf(entry));
    if (!host || host === entry || dropped.has(host)) continue;

    // A tenere l'identità — e quindi il `plexKey`, che è la riga di catalogo —
    // è sempre la copia letta per prima, cioè quella della libreria che viene
    // prima nell'elenco. Vale anche qui, altrimenti la stessa libreria darebbe
    // l'identità o no a seconda di quale copia Plex ha riconosciuto.
    const hostFirst = orderOf.get(host) < orderOf.get(entry);
    const target = hostFirst ? host : entry;
    const source = hostFirst ? entry : host;

    mergeInto(target, source);
    dropped.add(source);
    byTitle.set(titleKeyOf(target), target);
  }

  return entries.filter((e) => !dropped.has(e));
}

/** Titolo e anno normalizzati, per riconoscere due copie dello stesso film. */
function titleKeyOf(film) {
  return identityOf({ ...film, tmdbId: null });
}

/** Versa `source` dentro `target`, senza mai sovrascrivere ciò che c'è già. */
function mergeInto(target, source) {
  for (const lib of source.libraries) {
    if (!target.libraries.includes(lib)) target.libraries.push(lib);
  }

  // La copia in un'altra libreria può sapere cose che alla prima mancano:
  // tipicamente l'id TMDB, quando una delle due è stata riconosciuta e l'altra no.
  for (const field of FILLABLE) {
    if (target[field] == null && source[field] != null) target[field] = source[field];
  }

  // Quando il film è entrato in libreria: la data della copia più vecchia.
  // Aggiungere oggi la versione 4K di un film che hai da un anno non lo rimette
  // fra le novità.
  if (source.addedAt && (!target.addedAt || source.addedAt < target.addedAt)) {
    target.addedAt = source.addedAt;
  }

  // Sconosciuto a Plex solo se lo è in tutte le librerie: basta una copia
  // riconosciuta perché il film sia riconosciuto.
  target.plexUnmatched = target.plexUnmatched && source.plexUnmatched;
}
