import prisma from '@/lib/prisma';
import { cambiaSpettacolo, quote, sale, spettacoli, spettacolo } from './pretix';
import { commentoPerPretix, quotaIntero, rigaDaSottoevento, tmdbIdDaCommento } from './regole';

/**
 * Pretix → database unico (Neon), come nella v1:
 * - `syncCompleta`: il cron delle 04:00. Tutti gli spettacoli futuri, la
 *   pulizia di quelli passati o cancellati, i metadati del film rimandati a Pretix.
 * - `syncLeggera`: a ogni visita della Home, al massimo una volta al minuto.
 * - `aggiornaDisponibilita`: i posti liberi di uno spettacolo (dopo una
 *   prenotazione, dal webhook), al massimo una volta al minuto se non è forzata.
 * - `syncSpettacoli`: gli spettacoli aggiunti o cambiati (dal webhook).
 *
 * Con `VESTRI_SYNC_OFF=1` non si scrive niente: serve quando si guarda il sito
 * in locale senza toccare il database vero.
 *
 * Fino alla fetta 6 il film nuovo nasce come scheda «Caricamento…» senza
 * passare da TMDB: la riempie la v1 finché è online, poi il gestionale.
 */
export const syncSpenta = (env: Record<string, string | undefined> = process.env) => env.VESTRI_SYNC_OFF === '1';

const STUB = 'Caricamento...';

/** Le schede dei film che mancano, perché PretixSync possa puntarci. */
async function assicuraFilm(ids: Iterable<string>) {
  for (const tmdbId of ids) {
    await prisma.movieOverride.upsert({
      where: { tmdbId },
      update: {},
      create: { tmdbId, customTitle: STUB, isManualOverride: false, isDraft: false },
    });
  }
}

export async function syncCompleta({ senzaInvio = false } = {}) {
  if (syncSpenta()) return { success: true, upserted: 0, projectionsCleaned: 0, moviesCleaned: 0, duration: 0 };
  const inizio = Date.now();
  const [lista, nomiSale] = await Promise.all([spettacoli({ dalVivo: true }), sale()]);

  // Pretix che non risponde e Pretix vuoto sembrano uguali: senza spettacoli
  // non si pulisce niente, se no si cancellerebbe tutto il programma.
  if (!lista.length) {
    console.warn('[sync] Pretix non ha dato spettacoli: niente pulizia.');
    return { success: true, upserted: 0, projectionsCleaned: 0, moviesCleaned: 0, duration: Date.now() - inizio };
  }

  await assicuraFilm(new Set(lista.map(se => tmdbIdDaCommento(se.comment)).filter((x): x is string => !!x)));
  for (const se of lista) {
    const riga = rigaDaSottoevento(se, nomiSale);
    await prisma.pretixSync.upsert({ where: { pretixId: se.id }, update: riga, create: { pretixId: se.id, ...riga } });
  }

  const ids = lista.map(se => se.id);
  const vecchi = await prisma.pretixSync.deleteMany({ where: { pretixId: { notIn: ids } } });
  const senzaSpettacoli = await prisma.movieOverride.deleteMany({ where: { isDraft: false, projections: { none: {} } } });

  if (!senzaInvio) await inviaMetadati();

  return {
    success: true,
    upserted: lista.length,
    projectionsCleaned: vecchi.count,
    moviesCleaned: senzaSpettacoli.count,
    duration: Date.now() - inizio,
  };
}

/** I metadati del film rimandati nel commento dello spettacolo su Pretix, solo se sono cambiati. */
async function inviaMetadati() {
  const righe = await prisma.pretixSync.findMany({ where: { active: true, tmdbId: { not: null } } });
  const schede = await prisma.movieOverride.findMany({
    where: { tmdbId: { in: [...new Set(righe.map(r => r.tmdbId!))] } },
    include: { awards: true },
  });
  const perId = new Map(schede.map(s => [s.tmdbId, s]));
  for (const r of righe) {
    const s = perId.get(r.tmdbId!);
    if (!s || s.customTitle === STUB) continue;
    const commento = JSON.stringify(commentoPerPretix(r.tmdbId!, s));
    if (r.comment === commento) continue;
    try {
      await cambiaSpettacolo(r.pretixId, {
        comment: commento,
        meta_data: { lingua: s.versionLanguage?.trim() || 'ITA', sottotitoli: s.subtitles?.trim() || 'NESSUNO' },
      });
    } catch (e) {
      console.error(`[sync] metadati non inviati a Pretix per ${r.pretixId}:`, e);
    }
  }
}

// ─── I posti liberi ───────────────────────────────────────────────────────

const MINUTO = 60_000;
const ultimaVolta = new Map<number, number>();

export async function aggiornaDisponibilita(spettacoloId: number, forza = false) {
  if (syncSpenta()) return;
  const ora = Date.now();
  if (!forza && ora - (ultimaVolta.get(spettacoloId) ?? 0) < MINUTO) return;
  try {
    const riga = await prisma.pretixSync.findUnique({ where: { pretixId: spettacoloId }, select: { updatedAt: true } });
    if (!riga) return;
    if (!forza && ora - riga.updatedAt.getTime() < MINUTO) return;
    ultimaVolta.set(spettacoloId, ora);
    const q = quotaIntero(await quote(spettacoloId));
    if (!q) return;
    const liberi = q.available_number ?? null;
    await prisma.pretixSync.update({
      where: { pretixId: spettacoloId },
      data: { isSoldOut: liberi !== null && liberi <= 0, availableSeats: liberi, totalSeats: q.size ?? null, updatedAt: new Date() },
    });
  } catch (e) {
    console.error(`[sync] disponibilità di ${spettacoloId} non aggiornata:`, e);
  }
}

let ultimaLeggera = 0;

/** A ogni visita della Home, al massimo una volta al minuto: pulizia e posti liberi. */
export async function syncLeggera() {
  if (syncSpenta() || Date.now() - ultimaLeggera < MINUTO) return;
  ultimaLeggera = Date.now();
  try {
    const lista = await spettacoli({ dalVivo: true });
    if (!lista.length) return;
    await prisma.pretixSync.deleteMany({ where: { pretixId: { notIn: lista.map(s => s.id) } } });
    await prisma.movieOverride.deleteMany({ where: { isDraft: false, projections: { none: {} } } });
    let n = 0;
    for (const se of lista) {
      await aggiornaDisponibilita(se.id);
      if (++n % 5 === 0) await new Promise(r => setTimeout(r, 100));
    }
  } catch (e) {
    console.error('[sync] sync leggera non riuscita:', e);
  }
}

/** Gli spettacoli appena aggiunti o cambiati su Pretix (dal webhook). */
export async function syncSpettacoli(ids: number[]) {
  if (syncSpenta()) return;
  const nomiSale = await sale();
  for (const id of ids) {
    try {
      const se = await spettacolo(id);
      if (!se) continue;
      const riga = rigaDaSottoevento(se, nomiSale);
      if (riga.tmdbId) await assicuraFilm([riga.tmdbId]);
      await prisma.pretixSync.upsert({
        where: { pretixId: id },
        update: riga,
        create: { pretixId: id, ...riga, isSoldOut: false, availableSeats: null, totalSeats: null },
      });
    } catch (e) {
      console.error(`[sync] spettacolo ${id} non sincronizzato:`, e);
    }
  }
}

/**
 * Un film con tutti gli spettacoli esauriti si segna esaurito
 * (`manualSoldOut`), e si riapre da solo quando un posto torna libero.
 */
export async function esauritiDeiFilm() {
  if (syncSpenta()) return;
  try {
    const righe = await prisma.pretixSync.findMany({ where: { active: true, tmdbId: { not: null } }, select: { tmdbId: true, isSoldOut: true } });
    const perFilm = new Map<string, boolean[]>();
    for (const r of righe) perFilm.set(r.tmdbId!, [...(perFilm.get(r.tmdbId!) ?? []), r.isSoldOut]);
    const schede = await prisma.movieOverride.findMany({ where: { tmdbId: { in: [...perFilm.keys()] } }, select: { tmdbId: true, manualSoldOut: true } });
    for (const s of schede) {
      const tutto = (perFilm.get(s.tmdbId) ?? []).every(Boolean);
      if (tutto !== s.manualSoldOut) await prisma.movieOverride.update({ where: { tmdbId: s.tmdbId }, data: { manualSoldOut: tutto } });
    }
  } catch (e) {
    console.error('[sync] controllo dei film esauriti non riuscito:', e);
  }
}
