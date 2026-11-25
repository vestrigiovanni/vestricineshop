'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { checkAdminSession } from '@/actions/authActions';
import { tutteLeSpeciali, type SpecialeSalvata } from '@/services/speciali';
import type { Carattere, Citazione, Materiale } from '@/components/Home/proiezioneSpeciale';
import { testo, trovaPagina } from '@/services/stampa/distributori';
import { distribuitoDa, distributoreItaliano, notaArea, type Area } from '@/services/stampa/italiani';
import { slug } from '@/services/stampa/scegli';
import { riempi, type DalDistributore } from '@/services/stampa/riempi';
import { cosaPrende, riassunto, sonda, verdetto, type Sondato, type Verdetto } from '@/services/stampa/sonda';
import { entro, esito, Spiegato, type Esito } from '@/services/esito';

export type { DalDistributore } from '@/services/stampa/riempi';
export type { Esito } from '@/services/esito';

/**
 * La stanza "Speciale" del gestionale (25 novembre 2026): inserire, cambiare,
 * spegnere e togliere la proiezione speciale che apre la home. Ogni azione
 * controlla il login: un'azione del server è un indirizzo pubblico, e la
 * pagina protetta da sola non basta.
 *
 * Nessuna azione lancia: in produzione Next nasconde il messaggio di
 * un'eccezione («An error occurred in the Server Components render…»).
 * Rispondono `{ ok: true, … }` oppure `{ ok: false, errore }` (src/services/esito.ts).
 */
async function soloGestionale() {
  if (!(await checkAdminSession())) throw new Spiegato('Serve il login del gestionale: la sessione è scaduta. Ricarica la pagina ed entra di nuovo.');
}

export interface FilmInProgramma {
  tmdbId: number;
  titolo: string;
  primo: string;
  ultimo: string;
  spettacoli: number;
}

export async function specialeElenco(): Promise<Esito<{ speciali: SpecialeSalvata[]; film: FilmInProgramma[] }>> {
  return esito('Leggere le proiezioni speciali', async () => {
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
  });
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
  carattere: Carattere | null;
  materiale: Materiale | null;
}

const pulito = (t: unknown) => (typeof t === 'string' ? t.trim() : '');

export async function specialeSalva(d: DatiSpeciale): Promise<Esito<{ id: string }>> {
  return esito('Salvare la proiezione speciale', async () => {
    await soloGestionale();
    if (!Number.isInteger(d.tmdbId) || d.tmdbId <= 0) throw new Spiegato('Scegli il film.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.inizio)) throw new Spiegato('Il primo giorno va scritto come AAAA-MM-GG.');
    if (!pulito(d.fondale)) throw new Spiegato('Manca il fotogramma della pagina d’apertura.');
    const citazioni = (d.citazioni || [])
      .map(c => ({ testo: pulito(c.testo), fonte: pulito(c.fonte), fondale: pulito(c.fondale), ...(pulito(c.critico) ? { critico: pulito(c.critico) } : {}) }))
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
      carattere: d.carattere?.src && d.carattere.famiglia
        ? ({ famiglia: pulito(d.carattere.famiglia), peso: Number(d.carattere.peso) || 400, src: pulito(d.carattere.src) } as Prisma.InputJsonValue)
        : Prisma.DbNull,
      materiale: d.materiale ? (d.materiale as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    };
    const riga = d.id
      ? await prisma.proiezioneSpeciale.update({ where: { id: d.id }, data: dati })
      : await prisma.proiezioneSpeciale.create({ data: dati });
    revalidatePath('/');
    return { id: riga.id };
  });
}

export async function specialeAccendi(id: string, attiva: boolean): Promise<Esito> {
  return esito(attiva ? 'Accendere la proiezione' : 'Spegnere la proiezione', async () => {
    await soloGestionale();
    await prisma.proiezioneSpeciale.update({ where: { id }, data: { attiva } });
    revalidatePath('/');
    return {};
  });
}

export async function specialeElimina(id: string): Promise<Esito> {
  return esito('Togliere la proiezione', async () => {
    await soloGestionale();
    await prisma.proiezioneSpeciale.delete({ where: { id } });
    revalidatePath('/');
    return {};
  });
}

export interface FotogrammiTmdb {
  fotogrammi: string[];
  loghiCase: { nome: string; logo: string }[];
  /** Il regista (o i registi) per la riga sopra il titolo. */
  regia: string[];
}

/** I fotogrammi senza scritte di un film e i loghi delle case che lo firmano, da TMDB. */
export async function specialeFotogrammi(tmdbId: number): Promise<Esito<FotogrammiTmdb>> {
  return esito('Leggere i fotogrammi da TMDB', async () => {
    await soloGestionale();
    const chiave = process.env.TMDB_API_KEY;
    if (!chiave) return { fotogrammi: [], loghiCase: [], regia: [] };
    const url = (p: string) => `https://api.themoviedb.org/3/movie/${tmdbId}${p}${p.includes('?') ? '&' : '?'}api_key=${chiave}`;
    const [img, film] = await Promise.all([
      fetch(url('/images'), { cache: 'no-store', signal: AbortSignal.timeout(15000) }).then(r => r.json()).catch(() => null),
      fetch(url('?append_to_response=credits'), { cache: 'no-store', signal: AbortSignal.timeout(15000) }).then(r => r.json()).catch(() => null),
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
  });
}

/** Il film da TMDB in italiano, con quello che serve a riconoscerlo presso i distributori. */
async function filmTmdb(tmdbId: number) {
  const chiave = process.env.TMDB_API_KEY;
  if (!chiave) throw new Spiegato('Manca la chiave di TMDB sul server (TMDB_API_KEY).');
  const film = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${chiave}&language=it-IT&append_to_response=credits,alternative_titles,release_dates`,
    { cache: 'no-store', signal: AbortSignal.timeout(15000) },
  ).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!film) throw new Spiegato('TMDB non ha risposto. Riprova fra poco.');
  const alternativi: string[] = (film.alternative_titles?.titles || [])
    .filter((t: { iso_3166_1: string }) => ['IT', 'US', 'GB'].includes(t.iso_3166_1))
    .map((t: { title: string }) => t.title);
  const chi = {
    titoli: [...new Set<string>([film.title, film.original_title, ...alternativi].filter(Boolean))],
    regia: (film.credits?.crew || []).filter((c: { job: string }) => c.job === 'Director').map((c: { name: string }) => c.name),
  };
  // Gli anni in cui cercarlo su MyMovies: quello del film e quello dell'uscita italiana.
  const it = (film.release_dates?.results || []).find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'IT');
  const anni = [...new Set<string>([
    (film.release_date || '').slice(0, 4),
    ...((it?.release_dates || []) as { release_date: string }[]).map(d => d.release_date.slice(0, 4)),
  ].filter(Boolean))];
  return { film, chi, anni, chiave };
}

/** Il distributore italiano secondo MyMovies (la pagina del film: /film/<anno>/<titolo>/). */
async function daMyMovies(titoli: string[], anni: string[]): Promise<{ nome: string; pagina: string } | null> {
  const slugs = [...new Set(titoli.flatMap(t => [slug(t), slug(t.split(' - ')[0])]).filter(Boolean))].slice(0, 3);
  for (const anno of anni.slice(0, 3)) {
    for (const s of slugs) {
      const pagina = `https://www.mymovies.it/film/${anno}/${s}/`;
      const html = await testo(pagina, 8000).catch(() => '');
      const nome = html && distribuitoDa(html);
      if (nome) return { nome, pagina };
    }
  }
  return null;
}

export interface DistributoreDelFilm {
  /** Il nome com'è nel nostro elenco (o com'è scritto su MyMovies, se non lo conosciamo). */
  nome: string;
  sito?: string;
  /** La pagina del film presso il distributore, quando si trova da sola. */
  pagina?: string;
  /** Il logo TMDB, da mettere accanto a Vestri Cinema. */
  logo?: string;
  area?: Area;
  nota: string;
  /** Da dove viene: «area stampa» o la pagina MyMovies. */
  fonte: string;
}

/** Il logo di una casa su TMDB. */
async function logoCasa(id: number | undefined, chiave: string): Promise<string | undefined> {
  if (!id) return undefined;
  const j = await fetch(`https://api.themoviedb.org/3/company/${id}?api_key=${chiave}`, { signal: AbortSignal.timeout(8000) })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
  return j?.logo_path || undefined;
}

async function trovaDistributore(tmdbId: number): Promise<{ d: DistributoreDelFilm | null; titolo: string; muti: string[] }> {
  const { film, chi, anni, chiave } = await filmTmdb(tmdbId);
  const muti: string[] = [];
  // Prima le aree stampa che sappiamo leggere: lì c'è anche la pagina del film.
  const trovata = await trovaPagina(chi, undefined, muti).catch(() => null);
  const dove = trovata ? null : await daMyMovies(chi.titoli, anni);
  const nome = trovata?.distributore ?? dove?.nome;
  if (!nome) return { d: null, titolo: film.title, muti };
  const noto = distributoreItaliano(nome);
  return {
    titolo: film.title,
    muti,
    d: {
      nome: noto?.nome ?? nome,
      sito: noto?.sito,
      pagina: trovata?.pagina,
      logo: await logoCasa(noto?.tmdb, chiave),
      area: noto?.area,
      nota: notaArea(noto?.area),
      fonte: trovata ? 'area stampa' : dove!.pagina,
    },
  };
}

/** Il distributore italiano del film: nome, logo, sito, pagina del film e com'è la sua area stampa. */
export async function specialeDistributore(tmdbId: number): Promise<Esito<{ distributore: DistributoreDelFilm | null }>> {
  return esito('Cercare il distributore italiano', async () => {
    await soloGestionale();
    return { distributore: (await trovaDistributore(tmdbId)).d };
  });
}

/** La pagina ha due minuti (maxDuration in page.tsx): si smette di aspettare prima, per poter ancora rispondere. */
const SCADENZA_RIEMPI = 100_000;

/**
 * «Riempi dal distributore»: cerca il film fra le aree stampa conosciute (I
 * Wonder, Lucky Red, BIM, Notorious, Teodora), scarica banner, locandina e
 * foto, e li dà alla bozza. Con `pagina` si salta la ricerca. Le immagini
 * vengono salvate come quelle trascinate; la proiezione no: la salva Giovanni.
 */
export async function specialeDalDistributore(tmdbId: number, pagina?: string): Promise<Esito<DalDistributore>> {
  const via = Date.now();
  return esito('Riempire dal distributore', async () => {
    await soloGestionale();
    const { film, chi, anni } = await filmTmdb(tmdbId);
    const indirizzo = pagina?.trim();
    if (indirizzo && !/^https?:\/\//.test(indirizzo)) throw new Spiegato('L’indirizzo della pagina deve cominciare con https://');
    const muti: string[] = [];
    const trovata = await trovaPagina(chi, indirizzo || undefined, muti);
    if (!trovata) {
      const anche = muti.length ? ` (${muti.join(', ')} non ${muti.length > 1 ? 'hanno' : 'ha'} risposto: riprova fra poco)` : '';
      // Chi lo distribuisce davvero, per dire cosa fare invece di un generico «non trovo».
      const altrove = await daMyMovies(chi.titoli, anni).catch(() => null);
      const noto = altrove && distributoreItaliano(altrove.nome);
      if (altrove) {
        const casa = noto?.nome ?? altrove.nome;
        const cosa = noto?.area === 'login'
          ? `${casa} tiene il materiale in un’area stampa con login: scarica banner e foto da lì e trascinali qui.`
          : `${casa} non ha un’area stampa che so leggere: prendi il materiale dalla pagina del film${noto?.sito ? ` su ${noto.sito}` : ''} o chiedilo all’ufficio stampa, poi trascinalo qui.`;
        throw new Spiegato(`«${film.title}» in Italia è di ${casa}${anche}. ${cosa}`);
      }
      throw new Spiegato(`Non trovo «${film.title}» fra I Wonder, Lucky Red, BIM, Notorious e Teodora${anche}. Se sai la pagina del distributore, incollala; se il distributore è un altro, trascina le immagini a mano.`);
    }
    return entro(
      riempi(trovata),
      SCADENZA_RIEMPI - (Date.now() - via),
      `${trovata.distributore} è troppo lento: in ${Math.round(SCADENZA_RIEMPI / 1000)} secondi non ho finito di scaricare. Apri la pagina (${trovata.pagina}) e trascina le immagini a mano, oppure riprova.`,
    );
  });
}

export interface Candidato {
  tmdbId: number;
  verdetto: Verdetto;
  distributore: DistributoreDelFilm | null;
  /** Cosa c'è da scaricare, in due parole. */
  cosa: string;
  materiale?: Sondato;
  /** Perché no, o cosa fare invece. */
  nota: string;
}

/** Le risposte di «Chi ha le foto?» per un'ora: i distributori cambiano poco, e ogni giro sono decine di richieste. */
const sondati = new Map<number, { quando: number; c: Candidato }>();
const SCADENZA_SONDA = 50_000;

/**
 * «Chi ha le foto?»: per un film in programma, il distributore italiano e se
 * il suo materiale si scarica davvero (pagina del film raggiungibile, foto o
 * zip che rispondono). Non scarica e non salva niente.
 */
export async function specialeSonda(tmdbId: number, ancora = false): Promise<Esito<{ candidato: Candidato }>> {
  return esito('Controllare il materiale del distributore', async () => {
    await soloGestionale();
    const m = sondati.get(tmdbId);
    if (m && !ancora && Date.now() - m.quando < 3600_000) return { candidato: m.c };
    const c = await entro(sondaFilm(tmdbId), SCADENZA_SONDA, 'Il distributore è troppo lento a rispondere: riprova più tardi.');
    sondati.set(tmdbId, { quando: Date.now(), c });
    return { candidato: c };
  });
}

async function sondaFilm(tmdbId: number): Promise<Candidato> {
  const { chi, anni, chiave } = await filmTmdb(tmdbId);
  const muti: string[] = [];
  const trovata = await trovaPagina(chi, undefined, muti).catch(err => {
    if (err instanceof Spiegato) return { errore: err.message } as const;
    throw err;
  });
  if (trovata && !('errore' in trovata)) {
    const noto = distributoreItaliano(trovata.distributore);
    const distributore: DistributoreDelFilm = {
      nome: noto?.nome ?? trovata.distributore, sito: noto?.sito, pagina: trovata.pagina,
      logo: await logoCasa(noto?.tmdb, chiave), area: noto?.area, nota: notaArea(noto?.area), fonte: 'area stampa',
    };
    const materiale = await sonda(trovata);
    const v = verdetto(materiale);
    const nota = v === 'pronto'
      ? `«Riempi dal distributore» prende ${cosaPrende(materiale)}${materiale.foto && materiale.foto < 3 && !materiale.zip.length ? ' (poche foto: le altre dai fotogrammi TMDB)' : ''}.` + (materiale.rotti.length ? ` Non rispondono: ${materiale.rotti.slice(0, 3).join(', ')}.` : '')
      : v === 'a-mano'
        ? 'C’è qualcosa, ma va preso a mano dalla pagina del film.'
        : materiale.rotti.length
          ? `La pagina c’è, ma i link non rispondono (${materiale.rotti.slice(0, 3).join(', ')}).`
          : 'La pagina del film c’è, ma senza foto da scaricare (ancora).';
    return { tmdbId, verdetto: v, distributore, cosa: riassunto(materiale), materiale, nota };
  }
  // Non è fra le aree stampa che sappiamo leggere: chi lo distribuisce, per sapere cosa fare.
  const dove = await daMyMovies(chi.titoli, anni).catch(() => null);
  const noto = dove ? distributoreItaliano(dove.nome) : null;
  const distributore: DistributoreDelFilm | null = dove
    ? { nome: noto?.nome ?? dove.nome, sito: noto?.sito, logo: await logoCasa(noto?.tmdb, chiave), area: noto?.area, nota: notaArea(noto?.area), fonte: dove.pagina }
    : null;
  const nota = trovata && 'errore' in trovata
    ? trovata.errore
    : muti.length
      ? `${muti.join(', ')} non ${muti.length > 1 ? 'hanno' : 'ha'} risposto: riprova più tardi.`
      : distributore ? distributore.nota : 'Distributore italiano non trovato (né nelle aree stampa né su MyMovies).';
  return { tmdbId, verdetto: 'niente', distributore, cosa: '', nota };
}

export interface CriticaDalTrailer {
  stato: 'attesa' | 'lavoro' | 'fatto' | 'errore' | 'nessuna';
  messaggio: string;
  trailer: string;
  citazioni: Citazione[];
  carattere: Carattere | null;
  /** Da quanti secondi la riga non cambia: se il Mac non risponde, la scheda lo dice. */
  ferma: number;
}

/**
 * «Critica dal trailer», la richiesta: la scheda la segna qui e poi apre
 * vestricritica://, che fa partire il programma sul Mac. Il trailer si scarica
 * solo da lì (YouTube rifiuta i server), e da lì arrivano le risposte
 * (`/api/speciale/critica`).
 */
export async function specialeCriticaChiedi(tmdbId: number): Promise<Esito> {
  return esito('Chiedere la critica dal trailer', async () => {
    await soloGestionale();
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new Spiegato('Prima scegli il film.');
    const dati = { stato: 'attesa', messaggio: 'Aspetto il Mac…', trailer: '', citazioni: [] as Prisma.InputJsonValue, carattere: Prisma.DbNull };
    await prisma.criticaTrailer.upsert({ where: { tmdbId }, create: { tmdbId, ...dati }, update: dati });
    return {};
  });
}

/** A che punto è la lettura del trailer di un film. */
export async function specialeCriticaStato(tmdbId: number): Promise<Esito<{ critica: CriticaDalTrailer }>> {
  return esito('Leggere la critica dal trailer', async () => {
    await soloGestionale();
    const r = await prisma.criticaTrailer.findUnique({ where: { tmdbId } });
    if (!r) return { critica: { stato: 'nessuna', messaggio: '', trailer: '', citazioni: [], carattere: null, ferma: 0 } as CriticaDalTrailer };
    return {
      critica: {
        stato: r.stato as CriticaDalTrailer['stato'],
        messaggio: r.messaggio,
        trailer: r.trailer,
        citazioni: Array.isArray(r.citazioni) ? (r.citazioni as unknown as Citazione[]) : [],
        carattere: (r.carattere as unknown as Carattere | null) ?? null,
        ferma: Math.round((Date.now() - r.updatedAt.getTime()) / 1000),
      },
    };
  });
}
