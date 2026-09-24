import type { Command } from './commandIndex';
import { ROOMS, type RoomKey } from './rooms';

/** Le azioni che ⌘K sa eseguire da qualunque stanza. Chi le esegue è CommandPalette. */
export type ActionId = 'azione:svuota-cache' | 'azione:display' | 'azione:sito' | 'azione:esci';

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
