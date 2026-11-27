'use server';

import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { soloGestionale } from '../guardia';
import { cercaTmdb, dettagli, type Trovato } from '../tmdb/leggi';
import { abbinaInAttesa, campiTmdb, chiaveDi, completaSchede } from './abbina';

/**
 * Le azioni della stanza Catalogo: i film della libreria (Plex), il loro
 * abbinamento con TMDB, e le correzioni a mano. Ognuna controlla il login.
 */

export type Esito<T = object> = ({ ok: true } & T) | { ok: false; errore: string };

async function prova<T extends object>(fai: () => Promise<T>, errore: string): Promise<Esito<T>> {
  try {
    await soloGestionale();
    return { ok: true, ...(await fai()) };
  } catch (e) {
    console.error('[catalogo]', e);
    const msg = e instanceof Error && (e.message.startsWith('Serve il login') || e.message.startsWith('TMDB non')) ? e.message : errore;
    return { ok: false, errore: msg };
  }
}

export interface Filtri {
  cerca?: string;
  genere?: string;
  decennio?: number;
  daVerificare?: boolean;
  maiProgrammati?: boolean;
  soloInPlex?: boolean;
  ordine?: 'novita' | 'titolo' | 'anno' | 'voto';
}

export interface VoceCatalogo {
  id: number;
  title: string;
  year: number | null;
  durationMin: number | null;
  runtime: number | null;
  director: string | null;
  tmdbId: string | null;
  tmdbTitle: string | null;
  originalTitle: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  genres: string[];
  voteAverage: number | null;
  awardLabels: string[];
  verifyStatus: string;
  inPlex: boolean;
  plexLibraries: string[];
  addedAt: string | null;
  programmato: number;
}

const CAMPI = {
  id: true, title: true, year: true, durationMin: true, runtime: true, director: true, tmdbId: true, tmdbTitle: true,
  originalTitle: true, posterPath: true, backdropPath: true, overview: true, genres: true, voteAverage: true,
  awardLabels: true, verifyStatus: true, inPlex: true, plexLibraries: true, addedAt: true,
} as const;

async function dove(f: Filtri): Promise<Prisma.CatalogFilmWhereInput> {
  const w: Prisma.CatalogFilmWhereInput = {};
  const q = f.cerca?.trim().slice(0, 100);
  if (q) {
    w.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { tmdbTitle: { contains: q, mode: 'insensitive' } },
      { originalTitle: { contains: q, mode: 'insensitive' } },
      { director: { contains: q, mode: 'insensitive' } },
      ...(/^\d+$/.test(q) ? [{ tmdbId: q }] : []),
    ];
  }
  if (f.genere) w.genres = { has: f.genere };
  if (typeof f.decennio === 'number') w.year = { gte: f.decennio, lt: f.decennio + 10 };
  if (f.daVerificare) w.verifyStatus = { in: ['suspect', 'missing'] };
  if (f.soloInPlex) w.inPlex = true;
  if (f.maiProgrammati) {
    const fatti = await prisma.pretixSync.findMany({ where: { tmdbId: { not: null } }, select: { tmdbId: true }, distinct: ['tmdbId'] });
    w.NOT = { tmdbId: { in: fatti.map(x => x.tmdbId!) } };
  }
  return w;
}

async function conProgrammati(righe: Prisma.CatalogFilmGetPayload<{ select: typeof CAMPI }>[]): Promise<VoceCatalogo[]> {
  const ids = righe.map(r => r.tmdbId).filter((x): x is string => !!x);
  const gruppi = ids.length
    ? await prisma.pretixSync.groupBy({ by: ['tmdbId'], where: { tmdbId: { in: ids } }, _count: { _all: true } })
    : [];
  const quanti = new Map(gruppi.map(g => [g.tmdbId, g._count._all]));
  return righe.map(r => ({ ...r, addedAt: r.addedAt?.toISOString() ?? null, programmato: r.tmdbId ? quanti.get(r.tmdbId) ?? 0 : 0 }));
}

const PAGINA = 60;

export async function elencoCatalogo(f: Filtri, pagina = 1): Promise<Esito<{ film: VoceCatalogo[]; totale: number; ancora: boolean }>> {
  return prova(async () => {
    const w = await dove(f);
    const orderBy: Prisma.CatalogFilmOrderByWithRelationInput[] =
      f.ordine === 'titolo' ? [{ title: 'asc' }]
      : f.ordine === 'anno' ? [{ year: { sort: 'desc', nulls: 'last' } }, { title: 'asc' }]
      : f.ordine === 'voto' ? [{ voteAverage: { sort: 'desc', nulls: 'last' } }, { title: 'asc' }]
      : [{ addedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    const [righe, totale] = await Promise.all([
      prisma.catalogFilm.findMany({ where: w, orderBy, skip: (Math.max(1, pagina) - 1) * PAGINA, take: PAGINA, select: CAMPI }),
      prisma.catalogFilm.count({ where: w }),
    ]);
    return { film: await conProgrammati(righe), totale, ancora: pagina * PAGINA < totale };
  }, 'Non riesco a leggere il catalogo.');
}

/** Venti film a caso fra quelli dei filtri (mai programmati, se non si dice altro). */
export async function sorprendimi(f: Filtri): Promise<Esito<{ film: VoceCatalogo[] }>> {
  return prova(async () => {
    const w = await dove({ ...f, maiProgrammati: f.maiProgrammati ?? true });
    const ids = (await prisma.catalogFilm.findMany({ where: { AND: [w, { verifyStatus: { not: 'missing' } }] }, select: { id: true } })).map(x => x.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const scelti = ids.slice(0, 20);
    const righe = await prisma.catalogFilm.findMany({ where: { id: { in: scelti } }, select: CAMPI });
    const perId = new Map(righe.map(r => [r.id, r]));
    return { film: await conProgrammati(scelti.map(id => perId.get(id)!).filter(Boolean)) };
  }, 'Non sono riuscito a pescare a caso.');
}

export async function quadro(): Promise<Esito<{ conti: Record<string, number>; generi: string[]; decenni: number[] }>> {
  return prova(async () => {
    const [stati, inPlex, righe] = await Promise.all([
      prisma.catalogFilm.groupBy({ by: ['verifyStatus'], _count: { _all: true } }),
      prisma.catalogFilm.count({ where: { inPlex: true } }),
      prisma.catalogFilm.findMany({ select: { genres: true, year: true } }),
    ]);
    const conti: Record<string, number> = { totale: 0, inPlex };
    for (const s of stati) {
      conti[s.verifyStatus] = s._count._all;
      conti.totale += s._count._all;
    }
    const generi = new Set<string>();
    const decenni = new Set<number>();
    for (const r of righe) {
      r.genres.forEach(g => generi.add(g));
      if (r.year) decenni.add(Math.floor(r.year / 10) * 10);
    }
    return { conti, generi: [...generi].sort((a, b) => a.localeCompare(b, 'it')), decenni: [...decenni].sort((a, b) => b - a) };
  }, 'Non riesco a contare il catalogo.');
}

/** Un giro di abbinamento: prima i film in attesa, poi le schede da completare. */
export async function abbinaUnGiro(): Promise<Esito<{ fase: 'abbino' | 'completo' | 'fatto'; fatti: number; restano: number }>> {
  return prova(async () => {
    const a = await abbinaInAttesa(25);
    if (a.processed > 0 || a.remaining > 0) return { fase: 'abbino' as const, fatti: a.processed, restano: a.remaining };
    const c = await completaSchede(25);
    return { fase: c.remaining > 0 ? ('completo' as const) : ('fatto' as const), fatti: c.updated, restano: c.remaining };
  }, 'TMDB non ha risposto. Rilancia: riprende da dove era.');
}

export async function cercaPerCorreggere(testo: string): Promise<Esito<{ trovati: Trovato[] }>> {
  return prova(async () => ({ trovati: await cercaTmdb(testo.slice(0, 200)) }), 'TMDB non ha risposto.');
}

/** «Sì, è lui»: l'abbinamento indovinato è confermato a mano. */
export async function conferma(id: number): Promise<Esito> {
  return prova(async () => {
    await prisma.catalogFilm.update({ where: { id }, data: { verifyStatus: 'fixed', enrichedAt: new Date() } });
    return {};
  }, 'Non sono riuscito a confermarlo.');
}

/** Il film giusto è un altro: lo si collega a mano. */
export async function correggi(id: number, tmdbId: string): Promise<Esito<{ film: VoceCatalogo }>> {
  return prova(async () => {
    const b = /^\d+$/.test(tmdbId) ? await dettagli(tmdbId) : null;
    if (!b) throw new Error('TMDB non conosce questo id.');
    const r = await prisma.catalogFilm.update({
      where: { id },
      data: { ...campiTmdb(b), tmdbId, verifyStatus: 'fixed', enrichedAt: new Date() },
      select: CAMPI,
    });
    return { film: (await conProgrammati([r]))[0] };
  }, 'Non sono riuscito a correggere l’abbinamento.');
}

/** Toglie un film dal catalogo. Gli spettacoli già in sala non si toccano. */
export async function togli(id: number): Promise<Esito> {
  return prova(async () => {
    await prisma.catalogFilm.delete({ where: { id } });
    return {};
  }, 'Non sono riuscito a toglierlo.');
}

/** Aggiunge (o aggiorna) un film a partire dal suo id TMDB: è confermato per definizione. */
export async function aggiungiTmdb(tmdbId: string): Promise<Esito<{ titolo: string }>> {
  return prova(async () => {
    const b = /^\d+$/.test(tmdbId.trim()) ? await dettagli(tmdbId.trim()) : null;
    if (!b) throw new Error('TMDB non conosce questo id.');
    const sourceKey = chiaveDi(b.titolo, b.anno);
    const dati = { ...campiTmdb(b), title: b.titolo, year: b.anno, durationMin: b.durata, director: b.regia[0] ?? null, tmdbId: b.tmdbId, verifyStatus: 'fixed', enrichedAt: new Date() };
    const giaCe = await prisma.catalogFilm.findFirst({ where: { tmdbId: b.tmdbId }, select: { id: true } });
    if (giaCe) await prisma.catalogFilm.update({ where: { id: giaCe.id }, data: dati });
    else await prisma.catalogFilm.upsert({ where: { sourceKey }, update: dati, create: { sourceKey, ...dati } });
    return { titolo: b.titolo };
  }, 'Non sono riuscito ad aggiungerlo.');
}
