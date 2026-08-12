/**
 * Riceve le librerie Plex dal Mac del cinema (`scripts/plex-sync.mjs`).
 *
 * Le librerie sono più d'una — "Film" e "4K" — ma i film arrivano già fusi:
 * lo stesso titolo in due librerie è **una** riga di catalogo che si porta
 * dietro l'elenco delle librerie in cui esiste. Il catalogo elenca opere, non
 * copie, ed è quello che rende possibile programmarne una senza scegliere ogni
 * volta fra due voci identiche.
 *
 * Il flusso è a blocchi: N chiamate con `{ films }`, poi una chiamata con
 * `{ finalize: true, allPlexKeys }` che marca come usciti dalla libreria i film
 * non più presenti. Nessun film viene mai cancellato: potrebbe essere già
 * programmato, e perderlo dal catalogo significherebbe perdere il collegamento
 * con la proiezione.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normalizeText } from '@/services/catalogMatch';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

interface PlexFilm {
  plexKey: string;
  title: string;
  originalTitle?: string | null;
  year?: number | null;
  durationMin?: number | null;
  director?: string | null;
  summary?: string | null;
  addedAt?: string | null;
  tmdbId?: string | null;
  /** Plex non ha riconosciuto il film: guid `local://` o agente "none". */
  plexUnmatched?: boolean;
  /**
   * In quali librerie vive il film: `["Film"]`, `["4K"]` o entrambe. Lo script
   * fonde le copie prima di mandarle, quindi qui arriva un film per opera.
   * Assente sulle versioni vecchie dello script — e in quel caso ciò che è già
   * scritto in catalogo resta, invece di essere azzerato.
   */
  libraries?: string[];
}

/**
 * Sotto questa durata un titolo che Plex non riconosce non è un film: nella
 * libreria del cinema sono riprese, cortometraggi e lavori propri.
 * È la soglia convenzionale del lungometraggio.
 */
const FEATURE_MIN_MINUTES = 60;

/**
 * Vale la pena cercare questo titolo su TMDB?
 *
 * Se Plex non lo riconosce ed è breve, la risposta è no — e non per risparmiare
 * chiamate: la ricerca per titolo *troverebbe comunque qualcosa*. Un video di
 * tre minuti chiamato "Il conto" verrebbe abbinato a un film vero e finirebbe
 * fra quelli programmabili. Meglio nessun abbinamento che uno sbagliato.
 */
function looksLikeHomeVideo(film: PlexFilm): boolean {
  return Boolean(film.plexUnmatched) && !film.tmdbId && (film.durationMin ?? 999) < FEATURE_MIN_MINUTES;
}

function unauthorized() {
  return NextResponse.json({ error: 'Non autorizzato.' }, { status: 401 });
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CATALOG_SYNC_SECRET;
  if (!secret) return false; // senza segreto configurato l'endpoint resta chiuso
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Trova la riga di catalogo che corrisponde a un film Plex, dalla chiave più
 * affidabile alla più debole. L'ordine conta: `plexKey` identifica il film
 * senza ambiguità, `tmdbId` è certo quando Plex lo conosce, il titolo
 * normalizzato è l'ultima spiaggia ed è l'unico che può sbagliare.
 */
async function findExisting(film: PlexFilm, sourceKey: string) {
  const byPlex = await prisma.catalogFilm.findUnique({ where: { plexKey: film.plexKey } });
  if (byPlex) return { row: byPlex, via: 'plexKey' as const };

  if (film.tmdbId) {
    // `plexKey: null` evita di rubare la riga a un altro film già sincronizzato
    // (succede con i doppioni in libreria).
    const byTmdb = await prisma.catalogFilm.findFirst({
      where: { tmdbId: film.tmdbId, plexKey: null },
      orderBy: { id: 'asc' },
    });
    if (byTmdb) return { row: byTmdb, via: 'tmdbId' as const };
  }

  const bySource = await prisma.catalogFilm.findUnique({ where: { sourceKey } });
  if (bySource && bySource.plexKey === null) return { row: bySource, via: 'sourceKey' as const };

  return null;
}

async function ingestFilms(films: PlexFilm[]) {
  let created = 0;
  let updated = 0;
  let matchedByTmdb = 0;
  let homeVideo = 0;
  const errors: string[] = [];

  for (const film of films) {
    if (!film?.plexKey || !film?.title) continue;
    const year = Number.isFinite(film.year as number) ? (film.year as number) : null;
    const sourceKey = `${normalizeText(film.title)}|${year ?? ''}`;

    try {
      const match = await findExisting(film, sourceKey);

      // Campi che vengono da Plex e sono sempre autorevoli.
      const fromPlex = {
        plexKey: film.plexKey,
        inPlex: true,
        plexLibraries: Array.isArray(film.libraries)
          ? film.libraries.filter((l): l is string => typeof l === 'string' && l.trim() !== '')
          : match?.row.plexLibraries ?? [],
        addedAt: film.addedAt ? new Date(film.addedAt) : null,
        durationMin: film.durationMin ?? match?.row.durationMin ?? null,
        originalTitle: film.originalTitle ?? match?.row.originalTitle ?? null,
      };

      const home = looksLikeHomeVideo(film);
      if (home) homeVideo++;

      if (!match) {
        // Un film nuovo nasce "pending": l'arricchimento TMDB gli darà poster,
        // generi e voto. Se Plex conosce già il tmdbId, l'arricchimento lo userà
        // direttamente invece di cercare per titolo.
        // I video di casa nascono già "missing": nessuno li cercherà su TMDB e
        // nessuno li proporrà come programmabili, ma restano visibili in
        // catalogo perché sono davvero in libreria.
        await prisma.catalogFilm.create({
          data: {
            sourceKey,
            title: film.title,
            year,
            director: film.director ?? null,
            tmdbId: film.tmdbId ?? null,
            overview: film.summary ?? null,
            verifyStatus: home ? 'missing' : 'pending',
            enrichedAt: home ? new Date() : null,
            ...fromPlex,
          },
        });
        created++;
        if (film.tmdbId) matchedByTmdb++;
        continue;
      }

      const row = match.row;
      // Un tmdbId noto a Plex batte un abbinamento fuzzy: se la riga era
      // "suspect" o "missing", la promuoviamo a "pending" perché venga
      // riarricchita con l'id giusto.
      const tmdbFromPlexIsBetter =
        Boolean(film.tmdbId) &&
        (row.tmdbId !== film.tmdbId) &&
        ['pending', 'suspect', 'missing'].includes(row.verifyStatus);

      await prisma.catalogFilm.update({
        where: { id: row.id },
        data: {
          ...fromPlex,
          director: row.director ?? film.director ?? null,
          overview: row.overview ?? film.summary ?? null,
          ...(tmdbFromPlexIsBetter
            ? { tmdbId: film.tmdbId, verifyStatus: 'pending', enrichedAt: null }
            : {}),
        },
      });
      updated++;
      if (match.via === 'tmdbId' || tmdbFromPlexIsBetter) matchedByTmdb++;
    } catch (err) {
      errors.push(`${film.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { received: films.length, created, updated, matchedByTmdb, homeVideo, errors };
}

async function finalize(allPlexKeys: string[]) {
  const removed = await prisma.catalogFilm.updateMany({
    where: { inPlex: true, plexKey: { notIn: allPlexKeys } },
    data: { inPlex: false },
  });
  const needEnrich = await prisma.catalogFilm.count({ where: { verifyStatus: 'pending' } });
  return { removedFromPlex: removed.count, needEnrich };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  let body: { films?: PlexFilm[]; finalize?: boolean; allPlexKeys?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non valido.' }, { status: 400 });
  }

  try {
    if (body.finalize) {
      if (!Array.isArray(body.allPlexKeys) || body.allPlexKeys.length === 0) {
        // Una lista vuota vorrebbe dire "svuota la libreria": rifiutiamo, perché
        // quasi sempre significa che il sync si è interrotto a metà.
        return NextResponse.json(
          { error: 'allPlexKeys mancante o vuoto: non marco l\'intera libreria come uscita.' },
          { status: 400 }
        );
      }
      return NextResponse.json(await finalize(body.allPlexKeys));
    }

    if (!Array.isArray(body.films)) {
      return NextResponse.json({ error: 'Serve `films` (array) oppure `finalize: true`.' }, { status: 400 });
    }

    return NextResponse.json(await ingestFilms(body.films));
  } catch (err) {
    console.error('[plex-sync] ❌', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Errore interno.' },
      { status: 500 }
    );
  }
}
