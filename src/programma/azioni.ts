'use server';

import { soloGestionale } from '@/gestionale/guardia';
import { cercaTmdb, type Trovato } from '@/gestionale/tmdb/leggi';
import { aggiornaDisponibilita, esauritiDeiFilm } from '@/biglietteria/sync';
import * as p from './planning';
import { catalogPreviewTmdb } from './catalogo';
import { quoteDi, spettacoliFuturi } from './sala';
import type { CommitInput } from './motore/commitRunner';
import type { ScheduledShow } from './motore/engine';
import type { Band } from './motore/times';

/**
 * Le azioni delle stanze Programma e Oggi. Ognuna ricontrolla il cookie del
 * gestionale (il proxy è solo la porta) e poi chiama la stessa logica delle
 * rotte `/api/planning/*`: quello che fa il tavolo è quello che fa l'app.
 */

export async function trovaPosti(input: p.PlanningFindSlotsInput) {
  await soloGestionale();
  return p.planningFindSlots(input);
}

export async function genera(input: p.PlanningGenerateInput) {
  await soloGestionale();
  return p.planningGenerate(input);
}

export async function sceltaAutomatica(input: p.PlanningAutoPlanInput) {
  await soloGestionale();
  return p.planningAutoPlan(input);
}

export async function aggancia(
  show: ScheduledShow,
  desiredStartMinute: number,
  context: { seatingPlanId: number; startDate: string; days: number; otherShows: ScheduledShow[] },
) {
  await soloGestionale();
  return p.planningSnapShow(show, desiredStartMinute, context);
}

export async function alternative(input: { band: Band; maxRuntime: number; exclude?: string[]; count?: number; seed?: number }) {
  await soloGestionale();
  return p.planningAlternatives(input);
}

export async function tabellone(input: Parameters<typeof p.planningCatalogBoard>[0]) {
  await soloGestionale();
  return p.planningCatalogBoard(input);
}

export async function controllaOrario(input: Parameters<typeof p.planningCheckManualSlot>[0]) {
  await soloGestionale();
  return p.planningCheckManualSlot(input);
}

export async function controllaSpostamento(input: Parameters<typeof p.planningCheckMove>[0]) {
  await soloGestionale();
  return p.planningCheckMove(input);
}

/** Scrive su Pretix: solo dopo la conferma nel pannello. */
export async function sposta(input: Parameters<typeof p.planningMoveShow>[0]) {
  await soloGestionale();
  return p.planningMoveShow(input);
}

/** Scrive su Pretix: solo dopo la conferma nella finestra. */
export async function elimina(pretixId: number, force = false) {
  await soloGestionale();
  return p.planningDeleteShow(pretixId, force);
}

/** Registra il piano; Pretix comincia a lavorare solo al primo `avanza`. */
export async function mandaInSala(input: CommitInput) {
  await soloGestionale();
  return p.planningCommitStart(input);
}

export async function avanza(jobId: string) {
  await soloGestionale();
  return p.planningCommitTick(jobId);
}

export async function statoLavoro(jobId: string) {
  await soloGestionale();
  return p.planningCommitStatus(jobId);
}

export async function riprovaFalliti(jobId: string) {
  await soloGestionale();
  return p.planningCommitRetry(jobId);
}

export async function lavoroAperto(seatingPlanId: number) {
  await soloGestionale();
  return p.planningFindOpenCommit(seatingPlanId);
}

export async function salvaBozza(seatingPlanId: number, draft: p.PlanningDraftPayload) {
  await soloGestionale();
  return p.planningSaveDraft(seatingPlanId, draft);
}

export async function leggiBozza(seatingPlanId: number) {
  await soloGestionale();
  return p.planningLoadDraft(seatingPlanId);
}

export async function buttaBozza(seatingPlanId: number) {
  await soloGestionale();
  return p.planningDropDraft(seatingPlanId);
}

export async function filmDaTmdb(tmdbId: string) {
  await soloGestionale();
  return catalogPreviewTmdb(tmdbId);
}

export async function cercaSuTmdb(testo: string): Promise<Trovato[]> {
  await soloGestionale();
  return cercaTmdb(testo);
}

export async function quoteSpettacolo(pretixId: number) {
  await soloGestionale();
  return quoteDi(pretixId);
}

/** «Rileggi da Pretix»: i posti liberi di tutti gli spettacoli futuri, dal vivo. */
export async function rileggiPosti(): Promise<{ count: number }> {
  await soloGestionale();
  const lista = await spettacoliFuturi(true);
  let n = 0;
  for (const se of lista) {
    await aggiornaDisponibilita(se.id, true);
    if (++n % 5 === 0) await new Promise((r) => setTimeout(r, 100));
  }
  await esauritiDeiFilm();
  return { count: n };
}
