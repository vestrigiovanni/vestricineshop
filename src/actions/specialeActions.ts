'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { checkAdminSession } from '@/actions/authActions';
import { tutteLeSpeciali, type SpecialeSalvata } from '@/services/speciali';
import type { Citazione, Materiale } from '@/components/Home/proiezioneSpeciale';
import { trovaPagina } from '@/services/stampa/distributori';
import { riempi, type DalDistributore } from '@/services/stampa/riempi';

export type { DalDistributore } from '@/services/stampa/riempi';

/**
 * La stanza "Speciale" del gestionale (25 novembre 2026): inserire, cambiare,
 * spegnere e togliere la proiezione speciale che apre la home. Ogni azione
 * controlla il login: un'azione del server è un indirizzo pubblico, e la
 * pagina protetta da sola non basta.
 */
async function soloGestionale() {
  if (!(await checkAdminSession())) throw new Error('Serve il login del gestionale.');
}

export interface FilmInProgramma {
  tmdbId: number;
  titolo: string;
  primo: string;
  ultimo: string;
  spettacoli: number;
}

export async function specialeElenco(): Promise<{ speciali: SpecialeSalvata[]; film: FilmInProgramma[] }> {
  await soloGestionale();
  const [speciali, righe] = await Promise.all([
    tutteLeSpeciali(),
    prisma.pretixSync.findMany({
      where: { dateFrom: { gte: new Date(Date.now() - 10 * 60 * 1000) }, tmdbId: { not: null }, active: true },
      select: { tmdbId: true, name: true, dateFrom: true },
      orderBy: { dateFrom: 'asc' },
    }),
  ]);
  const perFilm = new Map<number, FilmInProgramma>();
  for (const r of righe) {
    const id = Number(r.tmdbId);
    if (!Number.isFinite(id)) continue;
    const d = r.dateFrom.toISOString();
    const f = perFilm.get(id);
    if (f) { f.ultimo = d; f.spettacoli++; }
    else perFilm.set(id, { tmdbId: id, titolo: r.name, primo: d, ultimo: d, spettacoli: 1 });
  }
  return { speciali, film: [...perFilm.values()].sort((a, b) => a.titolo.localeCompare(b.titolo, 'it')) };
}

export interface DatiSpeciale {
  id?: string;
  tmdbId: number;
  attiva: boolean;
  inizio: string;
  sopra: string;
  casaNome: string;
  casaLogo: string;
  fondale: string;
  citazioni: Citazione[];
  materiale: Materiale | null;
}

const pulito = (t: unknown) => (typeof t === 'string' ? t.trim() : '');

export async function specialeSalva(d: DatiSpeciale): Promise<{ id: string }> {
  await soloGestionale();
  if (!Number.isInteger(d.tmdbId) || d.tmdbId <= 0) throw new Error('Scegli il film.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inizio)) throw new Error('Il primo giorno va scritto come AAAA-MM-GG.');
  if (!pulito(d.fondale)) throw new Error('Manca il fotogramma della pagina d’apertura.');
  const citazioni = (d.citazioni || [])
    .map(c => ({ testo: pulito(c.testo), fonte: pulito(c.fonte), fondale: pulito(c.fondale) }))
    .filter(c => c.testo && c.fondale);
  const dati = {
    tmdbId: d.tmdbId,
    attiva: !!d.attiva,
    inizio: d.inizio,
    sopra: pulito(d.sopra),
    casaNome: pulito(d.casaNome),
    casaLogo: pulito(d.casaLogo),
    fondale: pulito(d.fondale),
    citazioni: citazioni as unknown as Prisma.InputJsonValue,
    materiale: d.materiale ? (d.materiale as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };
  const riga = d.id
    ? await prisma.proiezioneSpeciale.update({ where: { id: d.id }, data: dati })
    : await prisma.proiezioneSpeciale.create({ data: dati });
  revalidatePath('/');
  return { id: riga.id };
}

export async function specialeAccendi(id: string, attiva: boolean): Promise<void> {
  await soloGestionale();
  await prisma.proiezioneSpeciale.update({ where: { id }, data: { attiva } });
  revalidatePath('/');
}

export async function specialeElimina(id: string): Promise<void> {
  await soloGestionale();
  await prisma.proiezioneSpeciale.delete({ where: { id } });
  revalidatePath('/');
}

export interface FotogrammiTmdb {
  fotogrammi: string[];
  loghiCase: { nome: string; logo: string }[];
  /** Il regista (o i registi) per la riga sopra il titolo. */
  regia: string[];
}

/** I fotogrammi senza scritte di un film e i loghi delle case che lo firmano, da TMDB. */
export async function specialeFotogrammi(tmdbId: number): Promise<FotogrammiTmdb> {
  await soloGestionale();
  const chiave = process.env.TMDB_API_KEY;
  if (!chiave) return { fotogrammi: [], loghiCase: [], regia: [] };
  const url = (p: string) => `https://api.themoviedb.org/3/movie/${tmdbId}${p}${p.includes('?') ? '&' : '?'}api_key=${chiave}`;
  const [img, film] = await Promise.all([
    fetch(url('/images'), { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    fetch(url('?append_to_response=credits'), { cache: 'no-store' }).then(r => r.json()).catch(() => null),
  ]);
  const fotogrammi: string[] = (img?.backdrops || [])
    .filter((b: { iso_639_1: string | null }) => b.iso_639_1 == null)
    .map((b: { file_path: string }) => b.file_path);
  const loghiCase = (film?.production_companies || [])
    .filter((c: { logo_path: string | null }) => c.logo_path)
    .map((c: { name: string; logo_path: string }) => ({ nome: c.name, logo: c.logo_path }));
  const regia = (film?.credits?.crew || [])
    .filter((c: { job: string }) => c.job === 'Director')
    .map((c: { name: string }) => c.name);
  return { fotogrammi, loghiCase, regia };
}

/**
 * «Riempi dal distributore»: cerca il film fra le aree stampa conosciute (I
 * Wonder, Lucky Red, BIM, Notorious, Teodora), scarica banner, locandina e
 * foto, e li dà alla bozza. Con `pagina` si salta la ricerca. Le immagini
 * vengono salvate come quelle trascinate; la proiezione no: la salva Giovanni.
 */
export async function specialeDalDistributore(tmdbId: number, pagina?: string): Promise<DalDistributore> {
  await soloGestionale();
  const chiave = process.env.TMDB_API_KEY;
  if (!chiave) throw new Error('Manca la chiave di TMDB.');
  const film = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${chiave}&language=it-IT&append_to_response=credits,alternative_titles`,
    { cache: 'no-store' },
  ).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!film) throw new Error('TMDB non ha risposto. Riprova fra poco.');
  const alternativi: string[] = (film.alternative_titles?.titles || [])
    .filter((t: { iso_3166_1: string }) => ['IT', 'US', 'GB'].includes(t.iso_3166_1))
    .map((t: { title: string }) => t.title);
  const chi = {
    titoli: [...new Set<string>([film.title, film.original_title, ...alternativi].filter(Boolean))],
    regia: (film.credits?.crew || []).filter((c: { job: string }) => c.job === 'Director').map((c: { name: string }) => c.name),
  };
  const indirizzo = pagina?.trim();
  if (indirizzo && !/^https?:\/\//.test(indirizzo)) throw new Error('L’indirizzo della pagina deve cominciare con https://');
  const trovata = await trovaPagina(chi, indirizzo || undefined);
  if (!trovata) {
    throw new Error(`Non trovo «${film.title}» fra I Wonder, Lucky Red, BIM, Notorious e Teodora. Se sai la pagina del distributore, incollala.`);
  }
  return riempi(trovata);
}
