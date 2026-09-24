import type { ScheduledShow } from '@/services/scheduling/engine';
import {
  CLOSING_MINUTE,
  MIN_GAP_MINUTES,
  MINUTES_PER_DAY,
  OPENING_MINUTE,
  daysBetweenISO,
  formatClock,
  type Band,
} from '@/services/scheduling/times';
import { normalizeProjectionSpecs, type ProjectionSpecCode } from '@/constants/projectionSpecs';
import { commitKey, defaultSpecsFor, type CatalogItem, type Pick as FilmPick } from '../wizard/types';

export type { FilmPick };

/** Cosa comporta uno spettacolo messo al posto di altri, già in sala. */
export interface Replacement {
  replaces: number[];
  force: boolean;
  label?: string;
  soldTickets: number;
  outsideHours?: boolean;
}

/**
 * La bozza del tavolo.
 *
 * Gli spettacoli portano giorno di programmazione e orario: sono quelli a dire
 * dove stanno. I minuti globali (`startMinute`) sono contati da `origin` e si
 * ricalcolano con `rebase` quando il motore li vuole contati da un'altra data.
 */
export interface Draft {
  origin: string;
  intensity: string;
  shows: ScheduledShow[];
  picks: Record<string, FilmPick>;
  /** Per `commitKey`: sostituzioni e permesso di uscire dall'orario. */
  replacements: Record<string, Replacement>;
  /** Film scartati scambiandoli: non si ripropongono. */
  rejected: string[];
}

export function emptyDraft(origin: string): Draft {
  return { origin, intensity: 'normal', shows: [], picks: {}, replacements: {}, rejected: [] };
}

function clockMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Minuto nel giorno di programmazione: dopo mezzanotte si va oltre le 24:00. */
export function minuteOfDay(show: { time: string }): number {
  const m = clockMinutes(show.time);
  return m < OPENING_MINUTE ? m + MINUTES_PER_DAY : m;
}

/** Lo stesso spettacolo, con i minuti globali contati da `origin`. */
export function rebase(show: ScheduledShow, origin: string): ScheduledShow {
  const start = daysBetweenISO(origin, show.day) * MINUTES_PER_DAY + minuteOfDay(show);
  return { ...show, startMinute: start, endMinute: start + show.runtime };
}

export function draftKey(show: Pick<ScheduledShow, 'tmdbId' | 'date' | 'time'>): string {
  return `d:${commitKey(show as ScheduledShow)}`;
}

export function findDraft(draft: Draft, key: string): ScheduledShow | null {
  return draft.shows.find((s) => draftKey(s) === key) ?? null;
}

export interface DraftBlock {
  key: string;
  show: ScheduledShow;
  start: number;
  end: number;
}

export function draftBlocksOn(draft: Draft, day: string): DraftBlock[] {
  return draft.shows
    .filter((s) => s.day === day)
    .map((s) => {
      const start = minuteOfDay(s);
      return { key: draftKey(s), show: s, start, end: start + s.runtime };
    })
    .sort((a, b) => a.start - b.start);
}

/** Gli spettacoli in bozza contati dal primo giorno del tavolo: così li vuole il motore. */
export function showsFor(draft: Draft, from: string): ScheduledShow[] {
  return draft.shows.map((s) => rebase(s, from));
}

function omit<T>(record: Record<string, T>, keys: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => !keys.has(k)));
}

/** L'origine non resta mai dopo il primo spettacolo, o il wizard lo leggerebbe nel passato. */
function settle(draft: Draft): Draft {
  const earliest = draft.shows.reduce<string | null>((min, s) => (min === null || s.day < min ? s.day : min), null);
  if (earliest === null || earliest >= draft.origin) return draft;
  return { ...draft, origin: earliest, shows: draft.shows.map((s) => rebase(s, earliest)) };
}

export function addShow(draft: Draft, show: ScheduledShow, film?: CatalogItem | null, replacement?: Replacement): Draft {
  const placed = { ...rebase(show, draft.origin), locked: true };
  const picks = { ...draft.picks };
  if (film && !picks[placed.tmdbId]) picks[placed.tmdbId] = { film, specs: defaultSpecsFor(film) };
  const replacements = { ...draft.replacements };
  if (replacement && (replacement.replaces.length > 0 || replacement.outsideHours)) {
    replacements[commitKey(placed)] = replacement;
  }
  return settle({ ...draft, shows: [...draft.shows, placed], picks, replacements });
}

export function removeShow(draft: Draft, key: string): Draft {
  const target = findDraft(draft, key);
  if (!target) return draft;
  return {
    ...draft,
    shows: draft.shows.filter((s) => s !== target),
    replacements: omit(draft.replacements, new Set([commitKey(target)])),
  };
}

/** Lo spettacolo cambia posto: la vecchia sostituzione non vale più. */
export function replaceShow(draft: Draft, key: string, show: ScheduledShow, replacement?: Replacement): Draft {
  return addShow(removeShow(draft, key), show, draft.picks[show.tmdbId]?.film ?? null, replacement);
}

export function setSpecs(
  draft: Draft,
  tmdbId: string,
  patch: { specs?: ProjectionSpecCode[]; specsNote?: string },
): Draft {
  const current = draft.picks[tmdbId];
  if (!current) return draft;
  return { ...draft, picks: { ...draft.picks, [tmdbId]: { ...current, ...patch } } };
}

export interface SlotLike {
  day: string;
  date: string;
  time: string;
  endTime: string;
  startMinute: number;
  endMinute: number;
  band: Band;
}

export function showFromSlot(
  base: Pick<ScheduledShow, 'tmdbId' | 'title' | 'runtime'> & { posterPath?: string },
  slot: SlotLike,
): ScheduledShow {
  return {
    ...base,
    day: slot.day,
    date: slot.date,
    time: slot.time,
    endTime: slot.endTime,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    band: slot.band,
    locked: true,
  };
}

/** Il primo spettacolo in bozza con cui [start, end) si scontra, pausa compresa. */
export function clashesWithDraft(
  draft: Draft,
  day: string,
  start: number,
  end: number,
  exceptKey?: string,
): ScheduledShow | null {
  for (const b of draftBlocksOn(draft, day)) {
    if (b.key === exceptKey) continue;
    if (start < b.end + MIN_GAP_MINUTES && b.start < end + MIN_GAP_MINUTES) return b.show;
  }
  return null;
}

/** I posti proposti che si possono disegnare: senza scontri con la bozza, né fra loro. */
export function visibleSlots<T extends SlotLike>(slots: T[], draft: Draft, runtime: number): (T & { start: number; end: number })[] {
  const taken = new Map<string, { start: number; end: number }[]>();
  const out: (T & { start: number; end: number })[] = [];
  for (const slot of slots) {
    const start = minuteOfDay(slot);
    const end = start + runtime;
    if (clashesWithDraft(draft, slot.day, start, end)) continue;
    const day = taken.get(slot.day) ?? [];
    if (day.some((t) => start < t.end && t.start < end)) continue;
    day.push({ start, end });
    taken.set(slot.day, day);
    out.push({ ...slot, start, end });
  }
  return out;
}

/** Quanto può durare, al massimo, un film che comincia a `start` di quel giorno. */
export function maxRuntimeAt(
  draft: Draft,
  day: string,
  start: number,
  existing: { start: number; end: number }[],
  exceptKey?: string,
): number {
  const nexts = [
    ...draftBlocksOn(draft, day).filter((b) => b.key !== exceptKey).map((b) => b.start),
    ...existing.map((b) => b.start),
  ].filter((s) => s > start);
  const limit = nexts.length ? Math.min(Math.min(...nexts) - MIN_GAP_MINUTES, CLOSING_MINUTE) : CLOSING_MINUTE;
  return Math.max(limit - start, 0);
}

/** Cambia il film di uno spettacolo, o di tutti quelli dello stesso film. */
export function swapFilm(draft: Draft, key: string, film: CatalogItem, scope: 'one' | 'all'): Draft {
  const target = findDraft(draft, key);
  const runtime = film.runtime ?? film.durationMin ?? 0;
  if (!target || !film.tmdbId || runtime <= 0) return draft;
  const oldId = target.tmdbId;
  const touched = (s: ScheduledShow) => (scope === 'all' ? s.tmdbId === oldId : s === target);

  const moved = new Set<string>();
  const replacements: Record<string, Replacement> = {};
  const shows = draft.shows.map((s) => {
    if (!touched(s)) return s;
    const next: ScheduledShow = {
      ...s,
      tmdbId: film.tmdbId!,
      title: film.title,
      runtime,
      posterPath: film.posterPath ?? undefined,
      endTime: formatClock(minuteOfDay(s) + runtime),
      endMinute: s.startMinute + runtime,
      locked: true,
    };
    const old = draft.replacements[commitKey(s)];
    if (old) {
      replacements[commitKey(next)] = old;
      moved.add(commitKey(s));
    }
    return next;
  });

  const picks = { ...draft.picks };
  if (!picks[film.tmdbId]) picks[film.tmdbId] = { film, specs: defaultSpecsFor(film) };
  if (!shows.some((s) => s.tmdbId === oldId)) delete picks[oldId];

  return {
    ...draft,
    shows,
    picks,
    replacements: { ...omit(draft.replacements, moved), ...replacements },
    rejected: draft.rejected.includes(oldId) ? draft.rejected : [...draft.rejected, oldId],
  };
}

/** Toglie dalla bozza gli spettacoli già creati in sala. */
export function withoutCommitted(draft: Draft, created: Set<string>): Draft {
  return {
    ...draft,
    shows: draft.shows.filter((s) => !created.has(commitKey(s))),
    replacements: omit(draft.replacements, created),
  };
}

export interface CommitShowPayload {
  tmdbId: string;
  date: string;
  time: string;
  title: string;
  specs?: ProjectionSpecCode[];
  specsNote?: string;
  replaces?: number[];
  forceReplace?: boolean;
  allowOutsideHours?: boolean;
}

export function commitPayload(draft: Draft): CommitShowPayload[] {
  return [...draft.shows]
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .map((s) => {
      const r = draft.replacements[commitKey(s)];
      const pick = draft.picks[s.tmdbId];
      const specs = normalizeProjectionSpecs(pick?.specs);
      const note = pick?.specsNote?.trim();
      return {
        tmdbId: s.tmdbId,
        date: s.date,
        time: s.time,
        title: s.title,
        ...(specs.length ? { specs } : {}),
        ...(note ? { specsNote: note } : {}),
        ...(r?.replaces.length ? { replaces: r.replaces, forceReplace: r.force } : {}),
        ...(r?.outsideHours ? { allowOutsideHours: true } : {}),
      };
    });
}

export interface SavedDraftLike {
  startDate: string;
  days: number;
  intensity: string;
  state: unknown;
  showCount: number;
}

/** La forma del wizard: una bozza cominciata lì si riprende qui, e viceversa. */
export function toSaved(draft: Draft): SavedDraftLike {
  const last = draft.shows.reduce((m, s) => Math.max(m, daysBetweenISO(draft.origin, s.day)), 0);
  return {
    startDate: draft.origin,
    days: Math.min(Math.max(last + 1, 1), 30),
    intensity: draft.intensity,
    showCount: draft.shows.length,
    state: {
      mode: 'period',
      step: 3,
      picks: Object.entries(draft.picks),
      shows: draft.shows,
      warnings: [],
      replacements: Object.entries(draft.replacements),
      rejected: draft.rejected,
    },
  };
}

export function fromSaved(saved: SavedDraftLike): Draft | null {
  const state = saved.state as {
    shows?: ScheduledShow[];
    picks?: [string, FilmPick][];
    replacements?: [string, Replacement][];
    rejected?: string[];
  } | null;
  if (!state?.shows?.length) return null;
  return {
    origin: saved.startDate,
    intensity: saved.intensity || 'normal',
    shows: state.shows.map((s) => rebase(s, saved.startDate)),
    picks: Object.fromEntries(state.picks ?? []),
    replacements: Object.fromEntries(state.replacements ?? []),
    rejected: state.rejected ?? [],
  };
}
