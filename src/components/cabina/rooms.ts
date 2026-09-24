/**
 * Le stanze del gestionale. Ogni funzione ha una stanza sola.
 *
 * `mobile` le mette sotto il pollice sul telefono; le altre stanno nel foglio
 * "Altro". `inBar: false` le toglie dalle linguette in alto: Attrezzi si apre
 * dall'icona accanto alla ricerca e da ⌘K.
 */
export type RoomKey = 'oggi' | 'programma' | 'film' | 'catalogo' | 'cassa' | 'sale' | 'display' | 'attrezzi';

export interface Room {
  key: RoomKey;
  label: string;
  href: string;
  /** Sta nella barra in basso sul telefono. */
  mobile: boolean;
  /** Parole in più con cui ⌘K la trova. */
  keywords: string[];
  /** Schermata da banco: la barra del guscio si riduce. */
  compact?: boolean;
  /** `false` = non è fra le linguette in alto. */
  inBar?: boolean;
}

export const ROOMS: Room[] = [
  {
    key: 'oggi',
    label: 'Oggi',
    href: '/admin',
    mobile: true,
    keywords: ['home', 'oggi', 'adesso', 'in sala', 'avvisi'],
  },
  {
    key: 'programma',
    label: 'Programma',
    href: '/admin/programma',
    mobile: true,
    keywords: ['programmazione', 'palinsesto', 'settimana', 'tavolo', 'planner', 'spettacoli', 'sposta', 'pulizia', 'proiezioni vuote', 'riempi'],
  },
  {
    key: 'film',
    label: 'Film',
    href: '/admin/film',
    mobile: true,
    keywords: ['torre di controllo', 'override', 'trama', 'locandina', 'trailer', 'premi', 'lingua', 'colpo d’occhio'],
  },
  {
    key: 'catalogo',
    label: 'Catalogo',
    href: '/admin/catalogo',
    mobile: false,
    keywords: ['libreria', 'plex', 'tmdb', 'importa', 'verifica', 'abbinamento', 'sorprendimi'],
  },
  {
    key: 'cassa',
    label: 'Cassa',
    href: '/admin/cassa',
    mobile: true,
    keywords: ['vendita', 'biglietti', 'stampa', 'banco', 'recupero biglietti', 'ristampa'],
    compact: true,
  },
  {
    key: 'sale',
    label: 'Sale',
    href: '/admin/sale',
    mobile: false,
    keywords: ['sala', 'posti', 'pianta', 'predefinita', 'preferita', 'nascondi'],
  },
  {
    key: 'display',
    label: 'Display',
    href: '/admin/display',
    mobile: false,
    keywords: ['schermo', 'ingresso', 'preroll', 'info on screen', 'monitor'],
  },
  {
    key: 'attrezzi',
    label: 'Attrezzi',
    href: '/admin/attrezzi',
    mobile: false,
    inBar: false,
    keywords: ['cache', 'pretix', 'sincronizza', 'popola', 'premi', 'check-in', 'pulizia', 'strumenti', 'esci'],
  },
];

function clean(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function roomFor(pathname: string): Room | null {
  const path = clean(pathname);
  if (path === '/admin') return ROOMS.find((r) => r.href === '/admin') ?? null;
  return ROOMS.find((r) => r.href !== '/admin' && (path === r.href || path.startsWith(r.href + '/'))) ?? null;
}

export function activeRoom(pathname: string): RoomKey | null {
  return roomFor(pathname)?.key ?? null;
}

export function isCompactRoom(pathname: string): boolean {
  return roomFor(pathname)?.compact === true;
}
