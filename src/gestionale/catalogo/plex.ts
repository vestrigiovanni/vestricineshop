import prisma from '@/lib/prisma';
import { chiaveDi } from './abbina';

/**
 * Le librerie Plex del cinema nel catalogo (dalla v1, `api/catalog/plex-sync`).
 *
 * Arrivano dal Mac (`scripts/plex-sync.mjs`) già fuse: lo stesso film in
 * «Film» e in «4K» è una riga sola che si porta dietro le sue librerie. Il
 * catalogo elenca opere, non copie. Nessun film si cancella mai: se esce da
 * Plex diventa `inPlex: false`, perché potrebbe essere già programmato.
 */
export interface FilmPlex {
  plexKey: string;
  title: string;
  originalTitle?: string | null;
  year?: number | null;
  durationMin?: number | null;
  director?: string | null;
  summary?: string | null;
  addedAt?: string | null;
  tmdbId?: string | null;
  /** Plex non l'ha riconosciuto: guid `local://` o agente "none". */
  plexUnmatched?: boolean;
  /** In quali librerie vive. Assente sulle versioni vecchie dello script: allora resta quel che c'è. */
  libraries?: string[];
}

/**
 * Sotto l'ora, un titolo che Plex non riconosce non è un film (riprese,
 * corti, lavori propri). Cercarlo su TMDB troverebbe comunque qualcosa: meglio
 * nessun abbinamento che uno sbagliato.
 */
const LUNGOMETRAGGIO = 60;

export function videoDiCasa(f: FilmPlex): boolean {
  return Boolean(f.plexUnmatched) && !f.tmdbId && (f.durationMin ?? 999) < LUNGOMETRAGGIO;
}

/** La riga che corrisponde a un film Plex, dalla chiave più sicura alla più debole. */
async function trova(f: FilmPlex, sourceKey: string) {
  const perPlex = await prisma.catalogFilm.findUnique({ where: { plexKey: f.plexKey } });
  if (perPlex) return { riga: perPlex, via: 'plexKey' as const };
  if (f.tmdbId) {
    // Libera solo se non ha già un altro plexKey attivo (i doppioni in libreria).
    const perTmdb = await prisma.catalogFilm.findFirst({
      where: { tmdbId: f.tmdbId, OR: [{ plexKey: null }, { inPlex: false }] },
      orderBy: { id: 'asc' },
    });
    if (perTmdb) return { riga: perTmdb, via: 'tmdbId' as const };
  }
  const perTitolo = await prisma.catalogFilm.findUnique({ where: { sourceKey } });
  if (perTitolo && (perTitolo.plexKey === null || !perTitolo.inPlex)) return { riga: perTitolo, via: 'sourceKey' as const };
  return null;
}

export async function riceviFilm(films: FilmPlex[]) {
  let created = 0, updated = 0, matchedByTmdb = 0, homeVideo = 0;
  const errors: string[] = [];

  for (const f of films) {
    if (!f?.plexKey || !f?.title) continue;
    const year = Number.isFinite(f.year as number) ? (f.year as number) : null;
    const sourceKey = chiaveDi(f.title, year);
    try {
      const trovato = await trova(f, sourceKey);
      const daPlex = {
        plexKey: f.plexKey,
        inPlex: true,
        plexLibraries: Array.isArray(f.libraries)
          ? f.libraries.filter((l): l is string => typeof l === 'string' && l.trim() !== '')
          : trovato?.riga.plexLibraries ?? [],
        addedAt: f.addedAt ? new Date(f.addedAt) : null,
        durationMin: f.durationMin ?? trovato?.riga.durationMin ?? null,
        originalTitle: f.originalTitle ?? trovato?.riga.originalTitle ?? null,
      };
      const casa = videoDiCasa(f);
      if (casa) homeVideo++;

      if (!trovato) {
        await prisma.catalogFilm.create({
          data: {
            sourceKey, title: f.title, year, director: f.director ?? null, tmdbId: f.tmdbId ?? null, overview: f.summary ?? null,
            verifyStatus: casa ? 'missing' : 'pending', enrichedAt: casa ? new Date() : null, ...daPlex,
          },
        });
        created++;
        if (f.tmdbId) matchedByTmdb++;
        continue;
      }

      const r = trovato.riga;
      // L'id di Plex batte un abbinamento indovinato: la riga torna «pending» per essere riabbinata.
      const meglioPlex = Boolean(f.tmdbId) && r.tmdbId !== f.tmdbId && ['pending', 'suspect', 'missing'].includes(r.verifyStatus);
      await prisma.catalogFilm.update({
        where: { id: r.id },
        data: {
          ...daPlex,
          director: r.director ?? f.director ?? null,
          overview: r.overview ?? f.summary ?? null,
          ...(meglioPlex ? { tmdbId: f.tmdbId, verifyStatus: 'pending', enrichedAt: null } : {}),
        },
      });
      updated++;
      if (trovato.via === 'tmdbId' || meglioPlex) matchedByTmdb++;
    } catch (e) {
      errors.push(`${f.title}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { received: films.length, created, updated, matchedByTmdb, homeVideo, errors };
}

/** I film non più in Plex diventano «usciti dalla libreria». Mai cancellati. */
export async function chiudiGiro(tutteLeChiavi: string[]) {
  const usciti = await prisma.catalogFilm.updateMany({
    where: { inPlex: true, plexKey: { notIn: tutteLeChiavi } },
    data: { inPlex: false },
  });
  const needEnrich = await prisma.catalogFilm.count({ where: { verifyStatus: 'pending' } });
  return { removedFromPlex: usciti.count, needEnrich };
}
