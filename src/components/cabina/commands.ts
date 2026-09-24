import { romeClock, romeParts } from '@/services/scheduling/rome';
import { OPENING_MINUTE, addDaysISO } from '@/services/scheduling/times';
import type { Command } from './commandIndex';
import { ROOMS, type RoomKey } from './rooms';

/** Le azioni che ⌘K sa eseguire da qualunque stanza. Chi le esegue è CommandPalette. */
export type ActionId = 'azione:svuota-cache' | 'azione:display' | 'azione:sito' | 'azione:esci' | 'azione:riempi' | 'azione:pretix' | 'azione:checkin';

export function roomCommandId(key: RoomKey): string {
  return `stanza:${key}`;
}

export const ADMIN_COMMANDS: Command[] = [
  ...ROOMS.map((room) => ({
    id: roomCommandId(room.key),
    label: room.label,
    kind: 'stanza' as const,
    hint: 'Stanza',
    keywords: room.keywords,
  })),
  {
    id: 'azione:svuota-cache',
    label: 'Svuota la cache',
    kind: 'azione',
    hint: 'Rilegge Pretix alla prossima visita',
    keywords: ['cache', 'aggiorna', 'pretix', 'ricarica'],
  },
  {
    id: 'azione:display',
    label: 'Lancia il display d’ingresso',
    kind: 'azione',
    hint: 'Si apre in una nuova finestra',
    keywords: ['schermo', 'display', 'ingresso', 'info on screen'],
  },
  {
    id: 'azione:riempi',
    label: 'Riempi i buchi',
    kind: 'azione',
    hint: 'Sul tavolo della programmazione',
    keywords: ['autoprogramma', 'programma', 'buchi', 'settimana'],
    href: '/admin/programma',
  },
  {
    id: 'azione:pretix',
    label: 'Apri Pretix',
    kind: 'azione',
    hint: 'In una scheda nuova',
    keywords: ['pretix', 'ordini', 'rimborsi', 'biglietteria'],
    href: 'https://pretix.eu/vestri/npkez/',
  },
  {
    id: 'azione:checkin',
    label: 'Check-in all’ingresso',
    kind: 'azione',
    hint: 'Pretix, in una scheda nuova',
    keywords: ['check-in', 'ingresso', 'qr', 'controllo biglietti'],
    href: 'https://pretix.eu/control/event/vestri/npkez/webcheckin/',
  },
  {
    id: 'azione:sito',
    label: 'Vai al sito pubblico',
    kind: 'azione',
    keywords: ['home', 'sito', 'pubblico'],
  },
  {
    id: 'azione:esci',
    label: 'Esci dal gestionale',
    kind: 'azione',
    keywords: ['logout', 'esci', 'disconnetti'],
  },
];

/** Quel che serve di un film in programma per cercarlo con ⌘K. */
export interface ProgrammedLike {
  tmdbId: string;
  title: string;
  projections: { pretixId: number; dateFrom: string | Date }[];
}

/** Quanti giorni avanti ⌘K conosce gli spettacoli uno per uno. */
const SHOW_HORIZON_DAYS = 14;

function weekdayDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.toLocaleDateString('it-IT', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')} ${d.getUTCDate()}`;
}

/**
 * I film in arrivo aprono la loro scheda; gli spettacoli dei prossimi giorni
 * aprono il tavolo sul loro giorno di programmazione (le 00:30 di venerdì
 * stanno nella serata di giovedì, come sul tavolo).
 */
export function dynamicCommands(programmed: ProgrammedLike[], nowMs: number): Command[] {
  const horizon = nowMs + SHOW_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  const films: Command[] = [];
  const shows: Command[] = [];
  for (const p of programmed) {
    const future = p.projections
      .map((x) => ({ id: x.pretixId, ms: new Date(x.dateFrom).getTime() }))
      .filter((x) => x.ms >= nowMs)
      .sort((a, b) => a.ms - b.ms);
    if (future.length === 0) continue;
    const next = romeParts(future[0].ms);
    films.push({
      id: `film:${p.tmdbId}`,
      label: p.title,
      kind: 'film',
      hint: `Film · prossima ${weekdayDay(next.date)}`,
      keywords: ['film', 'scheda'],
      href: `/admin/film?tmdb=${encodeURIComponent(p.tmdbId)}`,
    });
    for (const x of future.filter((f) => f.ms <= horizon)) {
      const { date, minute } = romeParts(x.ms);
      const day = minute < OPENING_MINUTE ? addDaysISO(date, -1) : date;
      shows.push({
        id: `spettacolo:${x.id}`,
        label: `${p.title} · ${weekdayDay(day)} alle ${romeClock(x.ms)}`,
        kind: 'spettacolo',
        hint: 'Spettacolo',
        keywords: ['spettacolo'],
        href: `/admin/programma?from=${day}&days=1`,
      });
    }
  }
  return [...films, ...shows];
}
