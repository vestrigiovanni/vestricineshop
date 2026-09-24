import type { ProjectionSpecCode } from '@/constants/projectionSpecs';
import type { ScheduledShow } from '@/services/scheduling/engine';
import type { Band } from '@/services/scheduling/times';

/** Un film del catalogo, come lo vede il tavolo. */
export interface CatalogItem {
  id: number;
  title: string;
  year: number | null;
  durationMin: number | null;
  runtime: number | null;
  director: string | null;
  tmdbId: string | null;
  posterPath: string | null;
  genres: string[];
  voteAverage: number | null;
  awardLabels: string[];
  inPlex: boolean;
  /** Le librerie Plex in cui esiste: `["Film"]`, `["4K"]` o entrambe. */
  plexLibraries?: string[];
  verifyStatus: string;
  scheduledCount: number;
  /** `false` = preso da TMDB e mai scritto in catalogo: vive solo nella bozza. */
  inCatalog?: boolean;
}

/** Un film in bozza, con le scelte che valgono per tutti i suoi spettacoli. */
export interface FilmPick {
  film: CatalogItem;
  replicas?: number;
  preferredBand?: Band;
  /** 4K, Dolby Vision, Atmos, IMAX: si copiano su ogni spettacolo alla conferma. */
  specs?: ProjectionSpecCode[];
  /** La riga libera, per ciò che le caselle non prevedono. */
  specsNote?: string;
}

/**
 * Se la copia in libreria è quella 4K, il 4K parte spuntato: è l'unica cosa
 * che il catalogo sa già con certezza. Il resto dipende da come si proietta
 * quella sera, e lo decide chi programma.
 */
export function defaultSpecsFor(film: CatalogItem): ProjectionSpecCode[] {
  const libraries = film.plexLibraries ?? [];
  return libraries.some((l) => l.trim().toUpperCase() === '4K') ? ['4K'] : [];
}

/**
 * Identità di uno spettacolo alla conferma. Deve coincidere con `showKeyOf` di
 * `commitRunner`: è la chiave con cui il lavoro riferisce i falliti.
 */
export function commitKey(s: Pick<ScheduledShow, 'tmdbId' | 'date' | 'time'>): string {
  return `${s.tmdbId}@${s.date}T${s.time}`;
}

export const BAND_CHOICES: { value: Band | ''; label: string }[] = [
  { value: '', label: 'Fascia: indifferente' },
  { value: 'matinee', label: 'Matinée' },
  { value: 'afternoon', label: 'Pomeriggio' },
  { value: 'evening', label: 'Prima serata' },
  { value: 'night', label: 'Seconda serata' },
];
