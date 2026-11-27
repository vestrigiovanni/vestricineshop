import prisma from '@/lib/prisma';
import { filmTmdb } from '../tmdb/leggi';
import { fetchMubiAwards, getManualAwards } from '../tmdb/mubi';
import { STUB, riempi, tornaATmdb } from './scheda';

/**
 * Le schede dei film scritte nel database a partire da TMDB, con la regola di
 * `scheda.ts`: i testi di Gio vincono. Le usano la sync con Pretix (i film
 * nuovi) e la stanza Film («Rileggi da TMDB», «Torna come su TMDB»).
 */

/** I premi da MUBI (o quelli scritti a mano nella v1 per i film che MUBI non ha ancora). */
async function premiDi(tmdbId: string, titolo: string, originale: string, uscita: string) {
  const amano = getManualAwards(tmdbId);
  if (amano) return { premi: amano, mubiId: null };
  const m = await fetchMubiAwards(tmdbId, titolo, originale, uscita.slice(0, 4) || undefined).catch(() => null);
  return { premi: m?.awards ?? [], mubiId: m?.mubiId ?? null };
}

async function scriviPremi(tmdbId: string, premi: { type: string; label: string; details?: string | null; year?: number | null }[], mubiId: string | null) {
  await prisma.movieOverride.update({
    where: { tmdbId },
    data: {
      ...(mubiId ? { mubiId } : {}),
      awards: { deleteMany: {}, create: premi.map(a => ({ type: a.type, label: a.label, details: a.details ?? null, year: a.year ?? null })) },
    },
  });
  // I premi valgono anche per il catalogo: è l'unica volta che si hanno in mano.
  await prisma.catalogFilm
    .updateMany({ where: { tmdbId }, data: { awardLabels: premi.map(a => a.label).filter(Boolean), awardsCheckedAt: new Date() } })
    .catch(() => null);
}

/**
 * Riempie (o completa) la scheda di un film da TMDB. Con `forza` rilegge TMDB
 * da capo e riscrive i campi che non sono di Gio. I premi si cercano su MUBI
 * solo se la scheda non ne ha ancora.
 * Risponde `false` se TMDB non conosce il film.
 */
export async function riempiScheda(tmdbId: string, { forza = false, premi = true } = {}): Promise<boolean> {
  const [prima, t] = await Promise.all([
    prisma.movieOverride.findUnique({ where: { tmdbId }, include: { _count: { select: { awards: true } } } }),
    filmTmdb(tmdbId, forza),
  ]);
  if (!t) return false;
  const dati = riempi(prima, t, forza);
  if (!prima) await prisma.movieOverride.create({ data: { tmdbId, isManualOverride: false, isDraft: false, ...dati } });
  else if (Object.keys(dati).length) await prisma.movieOverride.update({ where: { tmdbId }, data: dati });

  if (premi && !prima?._count.awards) {
    const p = await premiDi(tmdbId, t.titolo, t.titoloOriginale, t.uscita);
    if (p.premi.length || p.mubiId) await scriviPremi(tmdbId, p.premi, p.mubiId);
  }
  return true;
}

/** «Aggiorna i premi»: rilegge MUBI anche se la scheda ne ha già. */
export async function aggiornaPremi(tmdbId: string): Promise<number> {
  const s = await prisma.movieOverride.findUnique({ where: { tmdbId }, select: { customTitle: true } });
  const t = await filmTmdb(tmdbId);
  if (!s || !t) throw new Error('Film non trovato.');
  const p = await premiDi(tmdbId, t.titolo, t.titoloOriginale, t.uscita);
  await scriviPremi(tmdbId, p.premi, p.mubiId);
  return p.premi.length;
}

/** «Torna come su TMDB»: la scheda non è più di Gio. */
export async function schedaDiNuovoTmdb(tmdbId: string): Promise<void> {
  const t = await filmTmdb(tmdbId, true);
  if (!t) throw new Error('TMDB non conosce questo film.');
  await prisma.movieOverride.update({ where: { tmdbId }, data: tornaATmdb(t) });
}

/**
 * Per la sync con Pretix: ogni film degli spettacoli deve avere la sua scheda
 * (PretixSync ci punta). Le nuove e quelle rimaste «Caricamento...» si
 * riempiono da TMDB; se TMDB non risponde nasce lo stub, e la prossima sync
 * ci riprova.
 */
export async function assicuraSchede(ids: Iterable<string>): Promise<void> {
  const tutti = [...new Set(ids)];
  if (!tutti.length) return;
  const ci = await prisma.movieOverride.findMany({ where: { tmdbId: { in: tutti } }, select: { tmdbId: true, customTitle: true } });
  const pronti = new Set(ci.filter(s => s.customTitle !== STUB).map(s => s.tmdbId));
  for (const tmdbId of tutti.filter(id => !pronti.has(id))) {
    try {
      if (await riempiScheda(tmdbId)) continue;
    } catch (e) {
      console.error(`[schede] ${tmdbId} non riempita da TMDB:`, e);
    }
    await prisma.movieOverride.upsert({
      where: { tmdbId },
      update: {},
      create: { tmdbId, customTitle: STUB, isManualOverride: false, isDraft: false },
    });
  }
}
