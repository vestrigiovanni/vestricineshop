import prisma from '@/lib/prisma';
import { aggiornaDisponibilita } from '@/biglietteria/sync';
import { GIORNI_MOSTRATI, spettacoliDa, type RigaDisplay, type SpettacoloDisplay } from './display';

/**
 * Quello che il display d'ingresso chiede al server: gli spettacoli di oggi e
 * dei prossimi giorni con i posti rimasti. I posti sono le quote di Pretix, che
 * `aggiornaDisponibilita` (la stessa della Home e del webhook) scrive nel
 * database al massimo una volta al minuto per spettacolo: il display può
 * chiedere quanto vuole, Pretix non sente di più. Non ha una sua sync e non
 * chiama Pretix da sé.
 */
export interface DatiDisplay {
  /** Quando il server ha letto: il browser lo scrive come «ultimo aggiornamento». */
  generato: string;
  spettacoli: SpettacoloDisplay[];
}

const leggi = (now: Date): Promise<RigaDisplay[]> =>
  prisma.pretixSync.findMany({
    where: {
      active: true,
      isHidden: false,
      // Un film comincia al massimo sei ore prima di essere ancora in corso; il resto lo taglia `spettacoliDa`.
      dateFrom: { gte: new Date(now.getTime() - 6 * 3600_000), lt: new Date(now.getTime() + (GIORNI_MOSTRATI + 1) * 24 * 3600_000) },
    },
    orderBy: { dateFrom: 'asc' },
    select: {
      pretixId: true, dateFrom: true, dateTo: true, roomName: true, isSoldOut: true, availableSeats: true, totalSeats: true, metaLingua: true, metaSottotitoli: true,
      movie: { select: { tmdbId: true, customTitle: true, customPosterPath: true, customBackdropPath: true, customRating: true, customRoomName: true, manualSoldOut: true } },
    },
  });

export async function caricaDisplay(now = new Date()): Promise<DatiDisplay> {
  const prima = await leggi(now);

  // Le quote solo degli spettacoli che non sono ancora cominciati (quando
  // sono in corso la vendita è chiusa, il conto non cambia più). Il freno di
  // un minuto sta dentro `aggiornaDisponibilita`; gli errori di Pretix lì
  // dentro si registrano e il display tiene l'ultimo conto del database.
  const daAggiornare = spettacoliDa(prima, now).filter(s => Date.parse(s.inizio) > now.getTime());
  await Promise.all(daAggiornare.map(s => aggiornaDisponibilita(s.id)));

  const righe = daAggiornare.length ? await leggi(now) : prima;
  return { generato: new Date().toISOString(), spettacoli: spettacoliDa(righe, now) };
}
