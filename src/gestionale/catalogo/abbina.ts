import prisma from '@/lib/prisma';
import { candidati, dettagli, type Base } from '../tmdb/leggi';
import { normalizeText, pickBestMatch } from './catalogMatch';

/**
 * Il catalogo e TMDB, dalla v1 (`services/catalogImport.ts`), senza più il
 * CSV: i film arrivano da Plex. Due passi, ripetibili a blocchi finché
 * `remaining` è zero:
 * 1. `abbinaInAttesa`: i film «pending» trovano il loro film su TMDB (subito
 *    se Plex ne sa l'id, se no per titolo, anno e regia);
 * 2. `completaSchede`: ai film già abbinati si aggiungono voto, trama, fondale.
 */

export const chiaveDi = (titolo: string, anno: number | null) => `${normalizeText(titolo)}|${anno ?? ''}`;

/** I campi del catalogo che arrivano da TMDB. */
export function campiTmdb(b: Base) {
  return {
    tmdbTitle: b.titolo,
    tmdbYear: b.anno,
    posterPath: b.locandina,
    genres: b.generi,
    runtime: b.durata,
    originalTitle: b.titoloOriginale,
    originalLanguage: b.linguaOriginale,
    overview: b.trama,
    backdropPath: b.fondale,
    voteAverage: b.voto ?? 0,
    voteCount: b.voti,
    popularity: b.popolarita,
  };
}

async function aBlocchi<T>(cose: T[], quanti: number, fai: (x: T) => Promise<void>) {
  for (let i = 0; i < cose.length; i += quanti) await Promise.all(cose.slice(i, i + quanti).map(fai));
}

type Stato = 'ok' | 'suspect' | 'missing';

async function abbinaUno(f: { id: number; title: string; year: number | null; director: string | null; tmdbId: string | null }): Promise<Stato> {
  // L'id lo sa già Plex: niente da indovinare.
  if (f.tmdbId) {
    const b = await dettagli(f.tmdbId);
    if (b) {
      await prisma.catalogFilm.update({
        where: { id: f.id },
        data: { ...campiTmdb(b), director: f.director ?? b.regia[0] ?? null, verifyStatus: 'ok', enrichedAt: new Date() },
      });
      return 'ok';
    }
    // L'id di Plex non risponde su TMDB: si prova per titolo.
  }

  const trovati = await candidati(f.title, f.year);
  const scelta = pickBestMatch(
    { title: f.title, year: f.year, director: f.director },
    trovati.map(c => ({ id: String(c.trovato.id), title: c.trovato.title, releaseDate: c.trovato.release_date, directors: c.base?.regia ?? [] })),
  );
  if (!scelta) {
    await prisma.catalogFilm.update({ where: { id: f.id }, data: { verifyStatus: 'missing', enrichedAt: new Date() } });
    return 'missing';
  }
  const c = trovati.find(x => String(x.trovato.id) === scelta.tmdbId)!;
  await prisma.catalogFilm.update({
    where: { id: f.id },
    data: {
      ...(c.base ? campiTmdb(c.base) : { tmdbTitle: c.trovato.title, posterPath: c.trovato.poster_path ?? null }),
      tmdbId: scelta.tmdbId,
      verifyStatus: scelta.status,
      enrichedAt: new Date(),
    },
  });
  return scelta.status;
}

export async function abbinaInAttesa(quanti = 25) {
  const film = await prisma.catalogFilm.findMany({ where: { verifyStatus: 'pending' }, orderBy: { id: 'asc' }, take: quanti });
  const conti = { ok: 0, suspect: 0, missing: 0 };
  await aBlocchi(film, 6, async f => {
    try {
      conti[await abbinaUno(f)]++;
    } catch (e) {
      console.error(`[catalogo] abbinamento non riuscito per ${f.id} «${f.title}»`, e);
    }
  });
  const remaining = await prisma.catalogFilm.count({ where: { verifyStatus: 'pending' } });
  return { processed: conti.ok + conti.suspect + conti.missing, remaining, ...conti };
}

export async function completaSchede(quanti = 25) {
  const dove = { tmdbId: { not: null }, voteAverage: null } as const;
  const film = await prisma.catalogFilm.findMany({ where: dove, orderBy: { id: 'asc' }, take: quanti, select: { id: true, tmdbId: true } });
  let updated = 0;
  await aBlocchi(film, 6, async f => {
    try {
      const b = await dettagli(f.tmdbId!);
      // Senza un segno tornerebbe a ogni giro: zero vuol dire «nessun voto».
      if (!b) return void (await prisma.catalogFilm.update({ where: { id: f.id }, data: { voteAverage: 0 } }));
      const { tmdbTitle: _t, tmdbYear: _y, ...resto } = campiTmdb(b);
      await prisma.catalogFilm.update({ where: { id: f.id }, data: resto });
      updated++;
    } catch (e) {
      console.error(`[catalogo] completamento non riuscito per ${f.id}`, e);
    }
  });
  const remaining = await prisma.catalogFilm.count({ where: dove });
  return { processed: film.length, remaining, updated };
}
