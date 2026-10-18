'use client';

import { useEffect, useState } from 'react';
import { planningFilmCard, type PlanningFilmCard } from '@/actions/planningActions';
import type { CatalogItem } from './types';

/** Un film come lo mostrano gli scaffali: quello del tavolo, più ciò che serve alla card. */
export type BrowserFilm = CatalogItem & { tasteNote?: string | null; addedAt?: number | null; arrivedAt?: number | null };

// Le schede si chiedono una volta per sessione: riaprire un film è immediato,
// e passarci sopra col mouse prima di cliccare la fa già arrivare.
const cache = new Map<string, Promise<PlanningFilmCard | null>>();

export function loadFilmCard(tmdbId: string): Promise<PlanningFilmCard | null> {
  let p = cache.get(tmdbId);
  if (!p) {
    p = planningFilmCard(tmdbId).catch(() => {
      cache.delete(tmdbId);
      return null;
    });
    cache.set(tmdbId, p);
  }
  return p;
}

/** `card` è `undefined` mentre arriva, `null` se non c'è. */
export function useFilmCard(tmdbId: string | null): PlanningFilmCard | null | undefined {
  const [state, setState] = useState<{ id: string; card: PlanningFilmCard | null } | null>(null);
  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    loadFilmCard(tmdbId).then((card) => {
      if (!cancelled) setState({ id: tmdbId, card });
    });
    return () => {
      cancelled = true;
    };
  }, [tmdbId]);
  return tmdbId && state?.id === tmdbId ? state.card : undefined;
}

const NEW_FOR_MS = 30 * 86_400_000;

/** È entrato in libreria nell'ultimo mese. */
export function isNew(f: { addedAt?: number | null; arrivedAt?: number | null }, now = Date.now()): boolean {
  const at = f.arrivedAt ?? f.addedAt;
  return at != null && now - at < NEW_FOR_MS;
}

export function is4K(f: { plexLibraries?: string[] }): boolean {
  return (f.plexLibraries ?? []).some((l) => l.trim().toUpperCase() === '4K');
}

/** "1994 · 154′ · ★ 8,3" */
export function metaLine(f: { year: number | null; runtime?: number | null; durationMin?: number | null; voteAverage?: number | null }): string {
  const runtime = f.runtime ?? f.durationMin;
  return [
    f.year,
    runtime ? `${runtime}′` : null,
    f.voteAverage ? `★ ${f.voteAverage.toFixed(1).replace('.', ',')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
