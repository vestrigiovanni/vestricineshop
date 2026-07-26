/**
 * Le corsie tematiche del catalogo nel wizard di programmazione.
 *
 * Stanno qui e non in `catalogActions` perché quel file è `'use server'`: da un
 * modulo server si possono esportare solo funzioni async, mai costanti.
 */

export type CatalogRail =
  | 'perfect'      // durata che incastra nei buchi liberi del periodo scelto
  | 'recommended'  // mai programmati, voto alto, generi diversi da quelli in cartellone
  | 'awarded'      // premiati dalla critica (MUBI)
  | 'acclaimed'    // voto TMDB alto e solido
  | 'fresh'        // novità in libreria (addedAt da Plex)
  | 'surprise';    // casuali, ripescabili all'infinito

export const CATALOG_RAIL_LABELS: Record<CatalogRail, string> = {
  perfect: 'Perfetti per questo slot',
  recommended: 'Consigliati',
  awarded: 'Premiati dalla critica',
  acclaimed: 'Acclamati',
  fresh: 'Novità in libreria',
  surprise: 'Sorpresa',
};

export const CATALOG_RAIL_HINTS: Record<CatalogRail, string> = {
  perfect: 'Durate che incastrano nei buchi liberi di questo periodo',
  recommended: 'Mai programmati, con generi diversi da quelli già in cartellone',
  awarded: 'Con premi riconosciuti dalla critica',
  acclaimed: 'Voto alto e tanti voti alle spalle',
  fresh: 'Entrati da poco nella libreria',
  surprise: 'Pescati a caso: ricarica per cambiarli',
};

/** Fasce di durata per il filtro del catalogo. */
export const RUNTIME_BUCKETS = [
  { key: 'short', label: 'meno di 90′', min: undefined, max: 89 },
  { key: 'medium', label: '90–120′', min: 90, max: 120 },
  { key: 'long', label: '120–150′', min: 120, max: 150 },
  { key: 'epic', label: 'oltre 150′', min: 151, max: undefined },
] as const;

export type RuntimeBucketKey = (typeof RUNTIME_BUCKETS)[number]['key'];
