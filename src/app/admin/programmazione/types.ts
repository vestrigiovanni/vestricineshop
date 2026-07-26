import type { ScheduledShow } from '@/services/scheduling/engine';
import type { Band } from '@/services/scheduling/times';
import type { PlanningFilmInfo } from '@/actions/planningActions';

/** Un film del catalogo, come lo vede il wizard. */
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
  verifyStatus: string;
  scheduledCount: number;
  /**
   * `false` = il film vive solo in questa sessione, preso da TMDB e mai scritto
   * in catalogo. Si può programmare lo stesso — la creazione legge i dati da
   * TMDB — ma la UI deve dirlo, altrimenti sembra un film archiviato.
   * `undefined` sui film che arrivano dal catalogo, dove la domanda non si pone.
   */
  inCatalog?: boolean;
}

/**
 * I due versi del wizard.
 *
 * `period` — dal periodo al film: scegli dove e quando, il motore riempie.
 * `film` — dal film al periodo: scegli il titolo, e sono gli orari liberi a
 * farsi avanti, dal giorno più vicino.
 */
export type PlanningMode = 'period' | 'film';

/** Un film scelto, con le preferenze che l'utente gli ha dato. */
export interface Pick {
  film: CatalogItem;
  /** `undefined` = decide il motore. */
  replicas?: number;
  preferredBand?: Band;
}

export type WizardStep = 1 | 2 | 3 | 4;

export interface PlanState {
  shows: ScheduledShow[];
  warnings: string[];
  filmInfo: PlanningFilmInfo[];
  seed: number;
}

/** Durata utilizzabile di un film, da qualunque fonte l'abbiamo. */
export function runtimeOf(f: Pick['film']): number | null {
  return f.runtime ?? f.durationMin ?? null;
}

/** Identità stabile di uno spettacolo dentro il piano. */
export function showKey(s: ScheduledShow): string {
  return `${s.tmdbId}@${s.startMinute}`;
}

/**
 * Identità di uno spettacolo *già inviato alla creazione*.
 *
 * Deve coincidere con `showKeyOf` di `commitRunner`, perché è la chiave con cui
 * il lavoro riferisce quali spettacoli sono falliti: se le due formule
 * divergono, il "riprova i falliti" non trova più niente da riprovare.
 */
export function commitKey(s: ScheduledShow): string {
  return `${s.tmdbId}@${s.date}T${s.time}`;
}

export const BAND_CHOICES: { value: Band | ''; label: string }[] = [
  { value: '', label: 'Indifferente' },
  { value: 'matinee', label: 'Matinée' },
  { value: 'afternoon', label: 'Pomeriggio' },
  { value: 'evening', label: 'Prima serata' },
  { value: 'night', label: 'Seconda serata' },
];

export function dayLabel(iso: string): string {
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shortDayLabel(iso: string): string {
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
