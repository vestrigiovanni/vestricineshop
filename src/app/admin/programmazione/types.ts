import type { ScheduledShow } from '@/services/scheduling/engine';
import type { Band } from '@/services/scheduling/times';
import type { PlanningFilmInfo, SlotProposal } from '@/actions/planningActions';
import type { ProjectionSpecCode } from '@/constants/projectionSpecs';

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
  /** Le librerie Plex in cui esiste: `["Film"]`, `["4K"]` o entrambe. */
  plexLibraries?: string[];
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
 * I tre modi della programmazione.
 *
 * `period` — dal periodo al film: scegli dove e quando, il motore riempie.
 * `film` — dal film al periodo: scegli il titolo, e sono gli orari liberi a
 * farsi avanti, dal giorno più vicino.
 * `palinsesto` — né l'uno né l'altro: qui non si crea niente, si guarda cosa
 * c'è già e lo si sposta o si elimina. Non è un wizard, è una vista sola.
 */
export type PlanningMode = 'period' | 'film' | 'palinsesto';

/**
 * Un orario scelto, con quello che comporta.
 *
 * `replaces` vuoto è il caso normale: l'orario era libero. Quando non è vuoto,
 * confermare il piano **eliminerà** quegli spettacoli per far posto — ed è per
 * questo che la scelta si porta dietro anche i biglietti venduti e un'etichetta
 * leggibile: sono le due cose che servono per farlo capire prima, non dopo.
 */
export interface ChosenSlot {
  slot: SlotProposal;
  /** Id Pretix da rimuovere per fare posto. Vuoto = nessuna sostituzione. */
  replaces: number[];
  /** Cosa si sta sostituendo, in parole. */
  replacesLabel?: string;
  /** Biglietti già venduti su ciò che verrebbe rimosso. */
  soldTickets: number;
  /** Consenso esplicito a procedere nonostante i biglietti venduti. */
  force: boolean;
  /** Scelto a mano invece che fra le proposte. */
  manual: boolean;
  /**
   * Sfora la fascia d'apertura: comincia prima delle 10:00, oppure il film
   * finisce dopo l'01:00. Le proposte automatiche non lo sono mai; un orario
   * deciso a mano può esserlo, e allora al commit va chiesto esplicitamente
   * (`allowOutsideHours`), altrimenti la creazione lo rifiuta.
   */
  outsideHours?: boolean;
}

/** Identità di un orario: il minuto d'inizio è già unico dentro la finestra. */
export function slotKey(s: SlotProposal): string {
  return `${s.day}@${s.startMinute}`;
}

/** Un film scelto, con le preferenze che l'utente gli ha dato. */
export interface Pick {
  film: CatalogItem;
  /** `undefined` = decide il motore. */
  replicas?: number;
  preferredBand?: Band;
  /**
   * Come lo si proietta: 4K, Dolby Vision, Atmos, versione IMAX.
   *
   * Vale per **tutti** gli spettacoli di quel film in questo piano. Programmare
   * lo stesso titolo con specifiche diverse a orari diversi si fa in due
   * passaggi, ed è la scelta giusta: nel caso normale — un film, una copia — la
   * spunta si dà una volta invece che dieci.
   */
  specs?: ProjectionSpecCode[];
  /** La riga libera, per ciò che le caselle non prevedono. */
  specsNote?: string;
}

/**
 * Le specifiche con cui un film si presenta la prima volta che lo scegli.
 *
 * Se la copia in libreria è quella 4K, il 4K parte spuntato: è l'unica cosa che
 * il catalogo sa già con certezza, e ripetergliela a ogni programmazione
 * sarebbe lavoro inutile. Tutto il resto — Dolby Vision, Atmos, IMAX — dipende
 * da com'è la copia e da come si proietta quella sera, e nessuno lo sa al posto
 * di chi programma. Resta comunque una proposta: si toglie con un clic.
 */
export function defaultSpecsFor(film: CatalogItem): ProjectionSpecCode[] {
  const libraries = film.plexLibraries ?? [];
  return libraries.some((l) => l.trim().toUpperCase() === '4K') ? ['4K'] : [];
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
