/**
 * Le stanze del gestionale.
 *
 * Nella barra compaiono solo le stanze che hanno già una pagina: Sale, Display e
 * Attrezzi entrano quando nascono (tappa 6 del restyling). Fino ad
 * allora le loro funzioni vivono nel vecchio pannello, nella stanza provvisoria
 * "Pannello", e per questo le loro parole chiave, per ora, puntano lì.
 */
export type RoomKey = 'oggi' | 'programma' | 'film' | 'catalogo' | 'cassa' | 'pannello';

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
    keywords: ['programmazione', 'palinsesto', 'settimana', 'tavolo', 'planner', 'spettacoli', 'sposta', 'pulizia', 'proiezioni vuote'],
  },
  {
    key: 'film',
    label: 'Film',
    href: '/admin/film',
    mobile: true,
    keywords: ['torre di controllo', 'override', 'trama', 'locandina', 'trailer', 'premi', 'lingua'],
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
    // Provvisoria: il vecchio pannello, finché Sale e Display non hanno una
    // stanza loro (tappa 6).
    key: 'pannello',
    label: 'Pannello',
    href: '/admin/pannello',
    mobile: false,
    keywords: ['sale', 'display', 'preroll', 'pretix'],
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
