#!/usr/bin/env node
/**
 * Sincronizza la libreria Plex del cinema con il catalogo del sito.
 *
 * PERCHÉ È LO SCRIPT A SPINGERE — il sito gira su Vercel, il server Plex sta
 * nella LAN del cinema: Vercel non lo raggiunge. Quindi è il Mac del cinema a
 * leggere la libreria e a mandarla al sito, non il contrario. Il token Plex non
 * lascia mai questa macchina.
 *
 * IL PEZZO PREZIOSO — Plex conosce già l'id TMDB di ogni film (nei `Guid` c'è
 * `tmdb://12345`). Portandoselo dietro sparisce l'abbinamento fuzzy
 * titolo→TMDB, che è ciò che oggi lascia decine di film in `verifyStatus:
 * suspect`.
 *
 * USO
 *   npm run plex:sync            invia al sito configurato in CATALOG_SYNC_URL
 *   npm run plex:sync -- --dry   legge Plex e mostra cosa manderebbe, senza inviare
 *
 * VARIABILI (in .env.local, solo su questa macchina)
 *   PLEX_URL            es. http://localhost:32400
 *   PLEX_TOKEN          il token del server Plex
 *   PLEX_LIBRARIES      librerie da leggere, separate da virgola (default: "Film,4K")
 *   CATALOG_SYNC_URL    es. https://vestricinema.com/api/catalog/plex-sync
 *   CATALOG_SYNC_SECRET lo stesso segreto configurato sul sito
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mergeAcrossLibraries } from './plexMerge.mjs';

const BATCH_SIZE = 150;

// ── Configurazione ───────────────────────────────────────────────────────────

/** Legge .env.local senza dipendenze: poche righe `CHIAVE=valore`. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

const DRY_RUN = process.argv.includes('--dry');

/**
 * Token del server Plex, senza farlo passare per le mani di nessuno.
 *
 * Quando lo script gira sulla stessa macchina del server — il caso normale, il
 * Mac del cinema — il token è già nelle preferenze di Plex: leggerlo da lì
 * evita di doverlo copiare a mano in `.env.local`, e quindi di averlo in un
 * file in più. `PLEX_TOKEN` resta disponibile per gli altri casi e ha la
 * precedenza.
 */
function readLocalPlexToken() {
  if (process.platform !== 'darwin') return null;
  try {
    const token = execFileSync(
      '/usr/bin/defaults',
      ['read', 'com.plexapp.plexmediaserver', 'PlexOnlineToken'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    return token || null;
  } catch {
    return null; // Plex non è su questa macchina, o non ha mai fatto login
  }
}

const PLEX_URL = (process.env.PLEX_URL || 'http://localhost:32400').replace(/\/+$/, '');
const PLEX_TOKEN = process.env.PLEX_TOKEN || readLocalPlexToken();

/**
 * Le librerie da leggere, per nome ed **elencate a mano**.
 *
 * Un elenco esplicito e non "tutte quelle di tipo film": sul server del cinema
 * convivono anche librerie di servizio, e una libreria creata domani non deve
 * finire in catalogo — e sotto gli occhi del pubblico — solo perché è nata.
 *
 * L'ordine conta: quando lo stesso film sta in più librerie, la prima
 * dell'elenco è quella che dà l'identità alla riga di catalogo.
 */
const PLEX_LIBRARIES = (process.env.PLEX_LIBRARIES || 'Film,4K')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SYNC_URL = process.env.CATALOG_SYNC_URL;
const SYNC_SECRET = process.env.CATALOG_SYNC_SECRET;

function die(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!PLEX_TOKEN) {
  die(
    'Non ho trovato il token Plex.\n' +
    '  Se Plex gira su questa macchina dovrebbe bastare aprirlo e fare login una volta.\n' +
    '  Altrimenti aggiungi PLEX_TOKEN in .env.local: in Plex apri un film → ⋮ →\n' +
    '  "Ottieni info" → "Visualizza XML", e copia X-Plex-Token dall\'URL.'
  );
}
if (!DRY_RUN && (!SYNC_URL || !SYNC_SECRET)) {
  die('Mancano CATALOG_SYNC_URL o CATALOG_SYNC_SECRET in .env.local.\n  (Con --dry puoi comunque provare la lettura da Plex.)');
}

// ── Lettura da Plex ──────────────────────────────────────────────────────────

async function plexGet(pathname, params = {}) {
  const url = new URL(PLEX_URL + pathname);
  url.searchParams.set('X-Plex-Token', PLEX_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Plex ha risposto ${res.status} ${res.statusText} su ${pathname}`);
  }
  return res.json();
}

/**
 * Le sezioni Plex che corrispondono alle librerie chieste, nell'ordine chiesto.
 *
 * Una libreria dell'elenco che non esiste **ferma tutto** invece di essere
 * saltata: sincronizzare metà catalogo credendo di averlo fatto tutto è peggio
 * che non sincronizzare, perché poi il passo finale marca come "uscito dalla
 * libreria" tutto ciò che non è arrivato.
 */
async function findMovieSections() {
  const data = await plexGet('/library/sections');
  const sections = data?.MediaContainer?.Directory ?? [];
  const movieSections = sections.filter((s) => s.type === 'movie');

  if (movieSections.length === 0) {
    throw new Error('Nessuna libreria di tipo "film" trovata su questo server Plex.');
  }

  const found = [];
  for (const wanted of PLEX_LIBRARIES) {
    const hit = movieSections.find((s) => s.title.toLowerCase() === wanted.toLowerCase());
    if (!hit) {
      const names = movieSections.map((s) => `"${s.title}"`).join(', ');
      throw new Error(
        `Libreria "${wanted}" non trovata. Su questo Plex ci sono: ${names}.\n` +
        `  Correggi PLEX_LIBRARIES in .env.local (ora vale "${PLEX_LIBRARIES.join(',')}").`
      );
    }
    found.push(hit);
  }
  return found;
}

/** Estrae l'id di un provider dai Guid di Plex (`tmdb://550` → "550"). */
function guidOf(item, provider) {
  const guids = item?.Guid ?? [];
  const hit = guids.find((g) => typeof g?.id === 'string' && g.id.startsWith(`${provider}://`));
  if (hit) return hit.id.slice(provider.length + 3);

  // I server più vecchi mettono un solo guid nel campo omonimo.
  if (typeof item?.guid === 'string' && item.guid.includes(`${provider}://`)) {
    const m = item.guid.match(new RegExp(`${provider}://([^?/]+)`));
    if (m) return m[1];
  }
  return null;
}

/**
 * Plex dichiara di non sapere che film sia.
 *
 * `local://` e `tv.plex.agents.none://` sono i guid che Plex assegna a ciò che
 * non ha riconosciuto: nella libreria del Vestri sono i video di casa e i
 * lavori propri (cortometraggi, riprese, elaborati). Vale la pena saperlo,
 * perché cercarli su TMDB per titolo produrrebbe abbinamenti sbagliati.
 */
function isUnmatchedInPlex(item) {
  const guid = String(item?.guid ?? '');
  if (guid.startsWith('local://') || guid.startsWith('tv.plex.agents.none://')) return true;
  // Nessun guid di provider e nessun Guid[]: Plex non ha proprio idea.
  return !guid && !(item?.Guid?.length > 0);
}

function normalizeFilm(item, libraryTitle) {
  return {
    plexKey: String(item.ratingKey),
    libraries: [libraryTitle],
    plexUnmatched: isUnmatchedInPlex(item),
    title: (item.title || '').trim(),
    originalTitle: (item.originalTitle || '').trim() || null,
    year: Number.isFinite(item.year) ? item.year : null,
    // Plex tiene la durata in millisecondi.
    durationMin: item.duration ? Math.round(item.duration / 60000) : null,
    director: item.Director?.[0]?.tag ?? null,
    summary: (item.summary || '').trim() || null,
    contentRating: item.contentRating || null,
    // addedAt di Plex è in secondi epoch.
    addedAt: item.addedAt ? new Date(item.addedAt * 1000).toISOString() : null,
    tmdbId: guidOf(item, 'tmdb'),
    imdbId: guidOf(item, 'imdb'),
  };
}

// ── Invio al sito ────────────────────────────────────────────────────────────

async function post(body) {
  const res = await fetch(SYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SYNC_SECRET}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    throw new Error(`Il sito ha risposto ${res.status}: ${payload.error ?? payload.raw ?? text.slice(0, 200)}`);
  }
  return payload;
}

// ── Programma ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🎬 Sincronizzazione catalogo da Plex\n   ${PLEX_URL}\n`);

  const sections = await findMovieSections();

  // Le copie così come stanno su Plex: una voce per file, doppioni compresi.
  const copies = [];
  for (const section of sections) {
    const data = await plexGet(`/library/sections/${section.key}/all`, {
      includeGuids: '1',
      type: '1', // solo film
    });
    const raw = data?.MediaContainer?.Metadata ?? [];
    const fromHere = raw.map((item) => normalizeFilm(item, section.title)).filter((f) => f.title);
    console.log(`   Libreria "${section.title}": ${fromHere.length} film`);
    copies.push(...fromHere);
  }

  const films = mergeAcrossLibraries(copies);
  const inBoth = films.filter((f) => f.libraries.length > 1).length;
  if (inBoth > 0) {
    console.log(`   ${inBoth} presenti in più di una libreria: uniti in una riga sola`);
  }

  const withTmdb = films.filter((f) => f.tmdbId).length;
  const homeVideo = films.filter((f) => f.plexUnmatched && (f.durationMin ?? 999) < 60);
  console.log(`   Trovati ${films.length} film · ${withTmdb} con id TMDB già noto a Plex`);
  if (homeVideo.length) {
    console.log(
      `   ${homeVideo.length} sono video brevi che Plex non riconosce (lavori tuoi, riprese):\n` +
      `     restano in catalogo ma non entrano fra i film programmabili.`
    );
  }

  if (films.length === 0) die('Le librerie sono vuote: non mando nulla.');

  if (withTmdb === 0 && films.length > 0) {
    console.log(
      '\n   ⚠ Nessun film ha un id TMDB. Il tuo Plex probabilmente usa l\'agente\n' +
      '     "Plex Movie" legacy: il catalogo funzionerà lo stesso, ma i film\n' +
      '     verranno abbinati a TMDB per titolo, con qualche imprecisione.\n'
    );
  }

  if (DRY_RUN) {
    console.log('\n   --dry: ecco i primi 5 film che manderei\n');
    console.log(JSON.stringify(films.slice(0, 5), null, 2));
    console.log(`\n✓ Prova conclusa. ${films.length} film pronti, niente inviato.\n`);
    return;
  }

  const totals = { received: 0, created: 0, updated: 0, matchedByTmdb: 0, errors: [] };

  for (let i = 0; i < films.length; i += BATCH_SIZE) {
    const batch = films.slice(i, i + BATCH_SIZE);
    const n = Math.floor(i / BATCH_SIZE) + 1;
    const of = Math.ceil(films.length / BATCH_SIZE);
    process.stdout.write(`   Invio blocco ${n}/${of} (${batch.length} film)… `);

    const res = await post({ films: batch });
    totals.received += res.received ?? 0;
    totals.created += res.created ?? 0;
    totals.updated += res.updated ?? 0;
    totals.matchedByTmdb += res.matchedByTmdb ?? 0;
    if (res.errors?.length) totals.errors.push(...res.errors);
    console.log(`✓ ${res.created} nuovi, ${res.updated} aggiornati`);
  }

  // Ultima chiamata: la lista completa delle chiavi permette al sito di capire
  // quali film sono spariti dalla libreria. Non vengono cancellati — potrebbero
  // essere già programmati — ma solo marcati come non più in Plex.
  process.stdout.write('   Segnalo i film usciti dalla libreria… ');
  // Tutte le chiavi viste, comprese quelle delle copie che la fusione ha messo
  // da parte: una riga di catalogo agganciata alla copia 4K non deve risultare
  // "uscita dalla libreria" solo perché stavolta ha vinto la copia normale.
  const finale = await post({ finalize: true, allPlexKeys: copies.map((c) => c.plexKey) });
  console.log(`✓ ${finale.removedFromPlex} usciti`);

  console.log(
    `\n✓ Fatto.\n` +
    `   ${totals.created} nuovi · ${totals.updated} aggiornati · ${finale.removedFromPlex} usciti dalla libreria\n` +
    `   ${totals.matchedByTmdb} abbinati direttamente per id TMDB (nessun matching per titolo)\n` +
    `   ${finale.needEnrich} in attesa di arricchimento TMDB` +
    (totals.errors.length ? `\n   ⚠ ${totals.errors.length} errori:\n     ${totals.errors.slice(0, 10).join('\n     ')}` : '') +
    `\n`
  );
}

main().catch((err) => {
  const hint = err.cause?.code === 'ECONNREFUSED'
    ? `\n  Plex non risponde su ${PLEX_URL}. È acceso? L'indirizzo è giusto?`
    : '';
  die(`${err.message}${hint}`);
});
