'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { inviaMetadati, syncSpenta } from '@/biglietteria/sync';
import { soloGestionale } from '../guardia';
import { filmTmdb, mediaTmdb, type Media } from '../tmdb/leggi';
import type { FilmTmdb } from '../tmdb/scelte';
import { aggiornaPremi, riempiScheda, schedaDiNuovoTmdb } from './riempi';
import { CAMPI_MODULO, STUB, daModulo, type Modulo, type Scheda } from './scheda';

/**
 * Le azioni della stanza Film. Ognuna controlla il login per conto suo: le
 * azioni del server si possono chiamare da qualunque pagina.
 */

export type Esito<T = object> = ({ ok: true } & T) | { ok: false; errore: string };

async function prova<T extends object>(fai: () => Promise<T>, errore: string): Promise<Esito<T>> {
  try {
    await soloGestionale();
    return { ok: true, ...(await fai()) };
  } catch (e) {
    console.error('[film]', e);
    const msg = e instanceof Error && e.message.startsWith('Serve il login') ? e.message : errore;
    return { ok: false, errore: msg };
  }
}

const valido = (id: string) => /^\d{1,10}$/.test(id);

export interface Spettacolo {
  pretixId: number;
  dateFrom: string;
  roomName: string | null;
  isSoldOut: boolean;
  availableSeats: number | null;
  totalSeats: number | null;
}

export interface VoceFilm {
  tmdbId: string;
  titolo: string;
  locandina: string | null;
  lingua: string | null;
  sottotitoli: string | null;
  diGio: boolean;
  bozza: boolean;
  stub: boolean;
  spettacoli: Spettacolo[];
}

/** I film delle schede, ciascuno coi suoi spettacoli (anche passati: la stanza guarda avanti da sé). */
export async function elencoFilm(): Promise<Esito<{ film: VoceFilm[] }>> {
  return prova(async () => {
    const [schede, righe] = await Promise.all([
      prisma.movieOverride.findMany({
        select: { tmdbId: true, customTitle: true, customPosterPath: true, versionLanguage: true, subtitles: true, isManualOverride: true, isDraft: true },
      }),
      prisma.pretixSync.findMany({
        where: { active: true, tmdbId: { not: null } },
        orderBy: { dateFrom: 'asc' },
        select: { pretixId: true, tmdbId: true, name: true, dateFrom: true, roomName: true, isSoldOut: true, availableSeats: true, totalSeats: true },
      }),
    ]);
    const perFilm = new Map<string, Spettacolo[]>();
    const nomi = new Map<string, string>();
    for (const r of righe) {
      perFilm.set(r.tmdbId!, [...(perFilm.get(r.tmdbId!) ?? []), {
        pretixId: r.pretixId, dateFrom: r.dateFrom.toISOString(), roomName: r.roomName,
        isSoldOut: r.isSoldOut, availableSeats: r.availableSeats, totalSeats: r.totalSeats,
      }]);
      nomi.set(r.tmdbId!, r.name);
    }
    const film = schede.map(s => ({
      tmdbId: s.tmdbId,
      titolo: (s.customTitle && s.customTitle !== STUB ? s.customTitle : nomi.get(s.tmdbId)) || `TMDB ${s.tmdbId}`,
      locandina: s.customPosterPath,
      lingua: s.versionLanguage,
      sottotitoli: s.subtitles,
      diGio: s.isManualOverride,
      bozza: s.isDraft,
      stub: s.customTitle === STUB,
      spettacoli: perFilm.get(s.tmdbId) ?? [],
    }));
    return { film };
  }, 'Non riesco a leggere i film dal database.');
}

export interface Premio { type: string; label: string; details: string | null; year: number | null }

export interface FilmAperto {
  scheda: Scheda;
  premi: Premio[];
  tmdb: FilmTmdb | null;
  spettacoli: Spettacolo[];
}

async function leggiScheda(tmdbId: string): Promise<FilmAperto> {
  const [s, tmdb, righe] = await Promise.all([
    prisma.movieOverride.findUnique({ where: { tmdbId }, include: { awards: true } }),
    filmTmdb(tmdbId).catch(() => null),
    prisma.pretixSync.findMany({
      where: { tmdbId, active: true },
      orderBy: { dateFrom: 'asc' },
      select: { pretixId: true, dateFrom: true, roomName: true, isSoldOut: true, availableSeats: true, totalSeats: true },
    }),
  ]);
  if (!s) throw new Error('Scheda non trovata.');
  const { awards, updatedAt: _u, isDraft: _d, customVersion: _v, ...scheda } = s;
  return {
    scheda,
    premi: awards.map(a => ({ type: a.type, label: a.label, details: a.details, year: a.year })),
    tmdb,
    spettacoli: righe.map(r => ({ ...r, dateFrom: r.dateFrom.toISOString() })),
  };
}

/**
 * Apre la scheda di un film. Se non c'è ancora, o è rimasta «Caricamento...»,
 * prima la riempie da TMDB (i testi di Gio, se ci sono, non si toccano).
 */
export async function apriFilm(tmdbId: string): Promise<Esito<FilmAperto>> {
  return prova(async () => {
    if (!valido(tmdbId)) throw new Error('Id non valido.');
    const c = await prisma.movieOverride.findUnique({ where: { tmdbId }, select: { customTitle: true } });
    if (!c || c.customTitle === STUB) await riempiScheda(tmdbId).catch(e => console.error('[film] riempi', e));
    return leggiScheda(tmdbId);
  }, 'Non riesco ad aprire questo film. TMDB potrebbe non rispondere: riprova fra poco.');
}

/**
 * Salva la scheda come la scrive Gio: da ora vince su TMDB. Sito e app la
 * vedono subito; il commento degli spettacoli su Pretix si aggiorna adesso,
 * non alla sync della notte.
 */
export async function salvaFilm(tmdbId: string, m: Modulo): Promise<Esito<{ pretix: boolean }>> {
  return prova(async () => {
    if (!valido(tmdbId)) throw new Error('Id non valido.');
    const pulito = Object.fromEntries(CAMPI_MODULO.map(k => [k, k === 'manualSoldOut' ? m[k] === true : String(m[k] ?? '').slice(0, 5000)])) as unknown as Modulo;
    await prisma.movieOverride.update({ where: { tmdbId }, data: daModulo(pulito) });
    let pretix = true;
    if (!syncSpenta()) await inviaMetadati(tmdbId).catch(e => { pretix = false; console.error('[film] pretix', e); });
    revalidatePath('/');
    return { pretix };
  }, 'Il database non ha confermato il salvataggio. Riprova.');
}

/** Rilegge TMDB da capo: riscrive solo quello che non è di Gio. */
export async function rileggiFilm(tmdbId: string): Promise<Esito<FilmAperto>> {
  return prova(async () => {
    if (!valido(tmdbId) || !(await riempiScheda(tmdbId, { forza: true, premi: false }))) throw new Error('TMDB non conosce il film.');
    revalidatePath('/');
    return leggiScheda(tmdbId);
  }, 'TMDB non ha risposto. Riprova fra poco.');
}

/** I testi tornano quelli di TMDB e la scheda non è più di Gio. */
export async function tornaTmdbFilm(tmdbId: string): Promise<Esito<FilmAperto>> {
  return prova(async () => {
    if (!valido(tmdbId)) throw new Error('Id non valido.');
    await schedaDiNuovoTmdb(tmdbId);
    if (!syncSpenta()) await inviaMetadati(tmdbId).catch(() => null);
    revalidatePath('/');
    return leggiScheda(tmdbId);
  }, 'TMDB non ha risposto. Riprova fra poco.');
}

/** Rilegge i premi da MUBI. */
export async function premiFilm(tmdbId: string): Promise<Esito<{ premi: Premio[] }>> {
  return prova(async () => {
    if (!valido(tmdbId)) throw new Error('Id non valido.');
    await aggiornaPremi(tmdbId);
    revalidatePath('/');
    const premi = await prisma.movieAward.findMany({ where: { tmdbId }, select: { type: true, label: true, details: true, year: true } });
    return { premi };
  }, 'MUBI non ha risposto. Riprova fra poco.');
}

/** Tutte le immagini e i trailer del film su TMDB, per sceglierli. */
export async function mediaFilm(tmdbId: string): Promise<Esito<{ media: Media }>> {
  return prova(async () => {
    if (!valido(tmdbId)) throw new Error('Id non valido.');
    return { media: await mediaTmdb(tmdbId) };
  }, 'TMDB non ha risposto. Riprova fra poco.');
}
