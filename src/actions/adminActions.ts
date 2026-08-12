'use server';

import fs from 'fs';
import { searchMovies, getMovieDetails, getDirector, getCast, getMovieLogo, getItalianRating, getEnhancedRating, getEnrichedMovieMetadata } from '@/services/tmdb';
import {
  createSubEvent,
  deleteSubEvent,
  updateSubEvent,
  listSubEvents,
  createQuota,
  setSubEventPriceOverrides,
  getSeatingPlan,
  getSeatingPlanDetail,
  getSubEvent,
  listQuotas,
  updateQuota,
  deleteQuota,
  getQuotaAvailability,
  updateSeatingPlan,
  createSeatingPlan,
  clearPretixCache,
  listSeatingPlans,
  syncSoldOutStatus
} from '@/services/pretix';
import { ITEM_INTERO_ID, ITEM_VIP_ID, SEATING_PLANS_CACHE_FILE } from '@/constants/pretix';
import { revalidatePath } from 'next/cache';
import { toDate, formatInTimeZone } from 'date-fns-tz';
import { calculatePretixDateTime } from '@/utils/dateUtils';
import { deleteMovieMetadata } from '@/services/db.service';
import { CLOSING_MINUTE, MIN_GAP_MINUTES, OPENING_MINUTE } from '@/services/scheduling/times';

// Admin logic for Pretix management

const TIMEZONE = 'Europe/Rome';
const pad = (n: number) => n.toString().padStart(2, '0');

/**
 * Custom ISO formatter to bypass server UTC shifts.
 * Hardcoded to Europe/Rome (+02:00 for CEST).
 * USES PURE MATH PIECES TO PREVENT TIMEZONE GHOSTS.
 */
function formatManualISO(d: Date) {
  // Usiamo formatInTimeZone SOLO per estrarre i pezzi (anno, mese, giorno, ora, min)
  // garantendo che siano quelli di Roma, ignorando il fuso di sistema di Vercel.
  const datestr = formatInTimeZone(d, TIMEZONE, 'yyyy-MM-dd');
  const timestr = formatInTimeZone(d, TIMEZONE, 'HH:mm');
  return `${datestr}T${timestr}:00+02:00`;
}

/**
 * Gli intervalli occupati di una sala: [inizio, fine + pausa].
 *
 * La durata si cerca dove costa meno, in quest'ordine: i metadati che lo
 * spettacolo si porta dietro, poi `MovieOverride.runtime` nel database, poi
 * `date_to`, e solo alla fine un valore prudente.
 *
 * Prima qui si interrogava TMDB — una ricerca per titolo più una lettura dei
 * dettagli — per ogni proiezione senza durata nei metadati. Questa funzione
 * viene chiamata *una volta per ogni spettacolo creato*, quindi durante una
 * programmazione da quaranta film quelle chiamate si moltiplicavano per
 * quaranta. Il database sa già tutto e risponde in una query sola.
 */
async function getBlockedIntervals(seatingPlanId: number) {
  const events = await listSubEvents(true);
  // La pausa fra due spettacoli ha un'unica definizione, quella del motore.
  // Prima qui erano 15 minuti mentre la creazione ne chiedeva 10: uno
  // spettacolo piazzato a 10 minuti da uno esistente veniva generato come
  // valido e poi rifiutato al salvataggio, senza che le due regole si
  // vedessero mai in faccia.
  const CLEANING_BUFFER_EXISTING = MIN_GAP_MINUTES * 60000;

  type SubEvent = {
    active?: boolean; seating_plan?: number | string; date_from: string;
    date_to?: string | null; comment?: unknown; name?: { it?: string } | string;
  };

  const mine = (events as SubEvent[]).filter(
    (e) => e.active === true && Number(e.seating_plan) === seatingPlanId
  );

  const metaOf = (e: SubEvent): { runtime?: number; tmdbId?: string } => {
    if (typeof e.comment !== 'string') return {};
    try {
      return JSON.parse(e.comment) ?? {};
    } catch {
      return {};
    }
  };

  // Una sola lettura per tutte le durate mancanti, invece di due chiamate di
  // rete per proiezione.
  const missing = mine
    .map((e) => metaOf(e))
    .filter((m) => !m.runtime && m.tmdbId)
    .map((m) => m.tmdbId as string);

  const runtimeByTmdb = new Map<string, number>();
  if (missing.length > 0) {
    const prisma = (await import('@/lib/prisma')).default;
    const rows = await prisma.movieOverride.findMany({
      where: { tmdbId: { in: [...new Set(missing)] }, runtime: { not: null } },
      select: { tmdbId: true, runtime: true },
    });
    for (const r of rows) runtimeByTmdb.set(r.tmdbId, r.runtime!);
  }

  return mine.map((e) => {
    const s = new Date(e.date_from).getTime();
    const meta = metaOf(e);
    const runtimeMin =
      meta.runtime ||
      (meta.tmdbId ? runtimeByTmdb.get(meta.tmdbId) : undefined) ||
      120; // prudente: più lungo del film medio, quindi non fa passare sovrapposizioni

    // `date_to` più lungo significa che qualcuno l'ha allungato a mano: vince.
    let e_end = s + runtimeMin * 60000;
    if (e.date_to) {
      const dTo = new Date(e.date_to).getTime();
      if (dTo > e_end) e_end = dTo;
    }

    return {
      start: s,
      end: e_end + CLEANING_BUFFER_EXISTING,
      title: (typeof e.name === 'object' ? e.name?.it : e.name) || 'Senza titolo',
      runtime: runtimeMin,
    };
  });
}

export async function adminClearCache() {
  clearPretixCache();
  revalidatePath('/');
  revalidatePath('/admin');
}

/**
 * HELPER: Returns the UTC timestamp for 00:00:00 in Europe/Rome timezone
 * for the day containing the given Date reference.
 *
 * CRITICAL: Never use `new Date(d).setHours(0,0,0,0)` on a UTC server (Vercel).
 * That gives UTC midnight, off by -2h from Roman midnight, causing the entire
 * bitmap to be misaligned by 120 minutes.
 */
function getRomeDayStartMs(d: Date): number {
  const dateStr = formatInTimeZone(d, TIMEZONE, 'yyyy-MM-dd');
  // Build the explicit Rome midnight with +02:00 suffix so new Date() parses it correctly
  return new Date(`${dateStr}T00:00:00+02:00`).getTime();
}

/**
 * HELPER: Checks if a slot [startMs, endMs] is within the cinema's opening hours
 * for the day defined by dayStartMs.
 */
function isWithinOpeningHours(startMs: number, endMs: number, dayStartMs: number, runtimeMs?: number): boolean {
  const transitionDateMs = getRomeDayStartMs(new Date('2026-06-09'));
  
  if (dayStartMs < transitionDateMs) {
    // OLD LOGIC: 08:00 to last show starting by 23:30
    const minStartMs = dayStartMs + 8 * 60 * 60 * 1000;
    const maxStartMs = dayStartMs + (23 * 60 + 30) * 60 * 1000;
    return startMs >= minStartMs && startMs <= maxStartMs;
  } else {
    // NEW LOGIC: first show starts from 10:00, last show must finish by 01:00 of next day
    // Note: The movie itself must end by 01:00 (maxEndMs). The cleaning buffer can go past 01:00.
    const minStartMs = dayStartMs + 10 * 60 * 60 * 1000;
    const maxEndMs = dayStartMs + 25 * 60 * 60 * 1000;
    const movieEndMs = runtimeMs ? (startMs + runtimeMs) : (endMs - 10 * 60000);
    return startMs >= minStartMs && movieEndMs <= maxEndMs;
  }
}

/**
 * HELPER: Generates a minute-by-minute occupancy map for a specific day.
 * Array of 1440 entries (0 = free, 1 = occupied).
 *
 * Index 0 = 00:00 Rome, Index 1 = 00:01 Rome, ..., Index 1439 = 23:59 Rome.
 */
function getDayOccupancyMap(intervals: any[], dayDate: Date) {
  const map = new Uint8Array(1440).fill(0);

  // CRITICAL FIX: anchor to Rome midnight, not UTC midnight
  const dayStartMs = getRomeDayStartMs(dayDate);
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

  for (const interval of intervals) {
    // Only map intervals that overlap with this day
    if (interval.end <= dayStartMs || interval.start >= dayEndMs) continue;

    // Convert start/end to minute indices [0..1439]
    const startIdx = Math.max(0, Math.floor((interval.start - dayStartMs) / 60000));
    const endIdx = Math.min(1440, Math.ceil((interval.end - dayStartMs) / 60000));

    for (let i = startIdx; i < endIdx; i++) {
      map[i] = 1;
    }
  }
  return map;
}




/**
 * HELPER: Checks if a time range is free on a given occupancy map.
 */
function isRangeFree(map: Uint8Array, startMs: number, endMs: number, dayStartMs: number) {
  const startIdx = Math.max(0, Math.floor((startMs - dayStartMs) / 60000));
  const endIdx = Math.min(1439, Math.ceil((endMs - dayStartMs) / 60000));

  for (let i = startIdx; i < endIdx; i++) {
    if (map[i] === 1) return false;
  }
  return true;
}

export async function adminSearchMovies(query: string, lang: 'it' | 'en' | 'all' = 'all') {
  if (lang === 'it') return await searchMovies(query, true, 'it-IT');
  if (lang === 'en') return await searchMovies(query, true, 'en-US');

  // lang === 'all' or default
  const [itResults, enResults] = await Promise.all([
    searchMovies(query, true, 'it-IT'),
    searchMovies(query, true, 'en-US')
  ]);

  // Merge results by TMDB ID
  const merged = new Map<number, any>();
  
  // Add IT results first to prioritize Italian metadata
  itResults.forEach(m => merged.set(m.id, m));
  
  // Add EN results only if they don't already exist in the map
  enResults.forEach(m => {
    if (!merged.has(m.id)) {
      merged.set(m.id, m);
    }
  });

  return Array.from(merged.values());
}

export async function adminGetMovieById(id: string) {
  try {
    console.log(`[adminGetMovieById] 🎬 Fetching details for ID: ${id}`);
    const { getEnrichedMovieMetadata } = await import('@/services/tmdb');
    const metadata = await getEnrichedMovieMetadata(id);
    
    // Auto-Hydration: ensure movie is in DB if metadata was successfully fetched
    if (metadata) {
      try {
        const prisma = (await import('@/lib/prisma')).default;
        const existing = await prisma.movieOverride.findUnique({ where: { tmdbId: id } }) as any;

        const isStub = existing?.customTitle === 'Caricamento...';
        // Sana anche i film già presenti ma senza trailer estratto (es. programmati prima del fix)
        const missingTrailer = existing && !existing.customTrailerUrl && !(existing.customTrailerKeys?.length) && (metadata.trailerKeys?.length);
        const needsUpdate = !existing || !existing.releaseDate || !existing.runtime || isStub || missingTrailer;
        
        if (needsUpdate) {
          console.log(`[adminGetMovieById] 🚀 Auto-populating DB for movie: ${id} (${metadata.title})`);
          await (prisma.movieOverride as any).upsert({
            where: { tmdbId: id },
            update: {
              customTitle: (existing?.customTitle && !isStub) ? existing.customTitle : metadata.title,
              customOverview: existing?.customOverview || metadata.overview,
              customPosterPath: existing?.customPosterPath || metadata.poster_path || '',
              customBackdropPath: existing?.customBackdropPath || metadata.backdrop_path || '',
              customLogoPath: existing?.customLogoPath || metadata.logo_path || '',
              customTrailerUrl: existing?.customTrailerUrl || metadata.trailerUrl || '',
              customTrailerKeys: (existing?.customTrailerKeys?.length) ? existing.customTrailerKeys : (metadata.trailerKeys || []),
              customRating: existing?.customRating || metadata.rating || 'T',
              customDirector: existing?.customDirector || (Array.isArray(metadata.director) ? metadata.director.join(', ') : (metadata.director || '')),
              customCast: existing?.customCast || (Array.isArray(metadata.cast) ? metadata.cast.join(', ') : (metadata.cast || '')),
              releaseDate: existing?.releaseDate || metadata.release_date,
              runtime: existing?.runtime || metadata.runtime,
            },
            create: {
              tmdbId: id,
              customTitle: metadata.title,
              customOverview: metadata.overview,
              customPosterPath: metadata.poster_path || '',
              customBackdropPath: metadata.backdrop_path || '',
              customLogoPath: metadata.logo_path || '',
              customTrailerUrl: metadata.trailerUrl || '',
              customTrailerKeys: metadata.trailerKeys || [],
              customRating: metadata.rating || 'T',
              customDirector: Array.isArray(metadata.director) ? metadata.director.join(', ') : (metadata.director || ''),
              customCast: Array.isArray(metadata.cast) ? metadata.cast.join(', ') : (metadata.cast || ''),
              releaseDate: metadata.release_date,
              runtime: metadata.runtime,
              isManualOverride: false,
              isDraft: false
            } as any
          });
          revalidatePath('/');
        }
      } catch (dbErr) {
        console.error(`[adminGetMovieById] ❌ DB Error during auto-population for ${id}:`, dbErr);
        // We don't throw here to allow the metadata to be returned even if DB update fails
      }
    }

    if (!metadata) {
      console.log(`[adminGetMovieById] ⚠️ Metadata not found for ${id}, checking DB fallback...`);
      // FALLBACK: Se TMDB fallisce, cerchiamo almeno se abbiamo un override nel DB
      const prisma = (await import('@/lib/prisma')).default;
      const existing = await prisma.movieOverride.findUnique({ where: { tmdbId: id } }) as any;
      if (existing) {
        return {
          tmdbId: id,
          title: existing.customTitle || 'Film senza titolo (TMDB Error)',
          overview: existing.customOverview || '',
          poster_path: existing.customPosterPath || '',
          backdrop_path: existing.customBackdropPath || '',
          logo_path: existing.customLogoPath || '',
          rating: existing.customRating || 'T',
          director: existing.customDirector ? existing.customDirector.split(', ') : [],
          cast: existing.customCast ? existing.customCast.split(', ') : [],
          release_date: existing.releaseDate || '',
          original_language: existing.versionLanguage || 'it', // Fallback to 'it' if unknown
          runtime: existing.runtime || 0,
          id: id // for compatibility
        };
      }
    }

    return metadata;
  } catch (error: any) {
    console.error(`[adminGetMovieById] ❌ CRITICAL FAILURE for ID ${id}:`, error);
    throw new Error(`Errore nel recupero dettagli film (ID: ${id}): ${error.message}`);
  }
}


export async function adminListEvents() {
  try {
    return await listSubEvents(true, false, true);
  } catch (error) {
    console.error('[adminListEvents] ❌ Errore nel caricamento eventi:', error);
    return [];
  }
}

/**
 * MIRROR SYSTEM: GET ALL SEATING PLANS (Enriched with Registry Metadata)
 */
export async function adminGetSeatingPlans(options = { includeHidden: false }) {
  try {
    // 1. Leggiamo il registro locale
    let registry: Record<string, any> = {};
    if (fs.existsSync(SEATING_PLANS_CACHE_FILE)) {
      registry = JSON.parse(fs.readFileSync(SEATING_PLANS_CACHE_FILE, 'utf-8'));
    }

    // 2. Chiamiamo il servizio Pretix (che fa già il filtro nucleare base per Sala 0)
    const plans = await listSeatingPlans();

    // 3. Arricchiamo con i dati del registro
    const enriched = plans.map((p: any) => {
      const meta = registry[p.id] || {};
      return {
        ...p,
        internalName: meta.internalName || p.name,
        isHidden: meta.isHidden ?? false,
        isFavorite: meta.isFavorite ?? false
      };
    });

    // 4. Se non vogliamo i nascosti, filtriamo
    const filtered = options.includeHidden ? enriched : enriched.filter((p: any) => !p.isHidden);

    // 5. Ordiniamo: Preferiti in alto, poi per nome alias
    return filtered.sort((a: any, b: any) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return a.internalName.localeCompare(b.internalName);
    });
  } catch (error) {
    console.error('Error in adminGetSeatingPlans:', error);
    return [];
  }
}

/**
 * MIRROR SYSTEM: SYNC PRETIX DATA TO REGISTRY
 */
export async function adminSyncMirror() {
  try {
    const plans = await listSeatingPlans();
    
    let registry: Record<string, any> = {};
    if (fs.existsSync(SEATING_PLANS_CACHE_FILE)) {
      registry = JSON.parse(fs.readFileSync(SEATING_PLANS_CACHE_FILE, 'utf-8'));
    }

    const newRegistry: Record<string, any> = {};
    plans.forEach((p: any) => {
      const existing = registry[p.id] || {};
      newRegistry[p.id] = {
        id: p.id,
        name: p.name,
        internalName: existing.internalName || p.name,
        isHidden: existing.isHidden ?? false,
        isFavorite: existing.isFavorite ?? false
      };
    });

    // /tmp è sempre disponibile (sia in locale che su Vercel Serverless) — no mkdir necessario.
    fs.writeFileSync(SEATING_PLANS_CACHE_FILE, JSON.stringify(newRegistry, null, 2));
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error in adminSyncMirror:', error);
    throw error;
  }
}

export async function adminToggleHideSeatingPlan(planId: number) {
  let registry: Record<string, any> = {};
  if (fs.existsSync(SEATING_PLANS_CACHE_FILE)) {
    registry = JSON.parse(fs.readFileSync(SEATING_PLANS_CACHE_FILE, 'utf-8'));
  }

  // Auto-crea l'entry se non esiste ancora nel registro (es. sala appena creata)
  if (!registry[planId]) {
    registry[planId] = { id: planId, isHidden: false, isFavorite: false, internalName: '' };
  }

  registry[planId].isHidden = !registry[planId].isHidden;
  fs.writeFileSync(SEATING_PLANS_CACHE_FILE, JSON.stringify(registry, null, 2));
  revalidatePath('/admin');
  return { success: true };
}

export async function adminBulkHideSeatingPlans() {
  try {
    // 1. Recuperiamo TUTTE le sale attuali da Pretix
    const plans = await listSeatingPlans();
    
    // 2. Leggiamo il registro attuale
    let registry: Record<string, any> = {};
    if (fs.existsSync(SEATING_PLANS_CACHE_FILE)) {
      registry = JSON.parse(fs.readFileSync(SEATING_PLANS_CACHE_FILE, 'utf-8'));
    }

    // 3. Forziamo isHidden: true per ogni sala trovata su Pretix
    plans.forEach((p: any) => {
      const existing = registry[p.id] || {};
      registry[p.id] = {
        id: p.id,
        name: p.name,
        internalName: existing.internalName || p.name,
        isHidden: true,
        isFavorite: existing.isFavorite ?? false
      };
    });

    // 4. Salvataggio atomico
    fs.writeFileSync(SEATING_PLANS_CACHE_FILE, JSON.stringify(registry, null, 2));
    
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error in adminBulkHideSeatingPlans:', error);
    throw error;
  }
}

export async function adminToggleFavoriteSeatingPlan(planId: number) {
  let registry: Record<string, any> = {};
  if (fs.existsSync(SEATING_PLANS_CACHE_FILE)) {
    registry = JSON.parse(fs.readFileSync(SEATING_PLANS_CACHE_FILE, 'utf-8'));
  }

  // Auto-crea l'entry se non esiste ancora nel registro
  if (!registry[planId]) {
    registry[planId] = { id: planId, isHidden: false, isFavorite: false, internalName: '' };
  }

  registry[planId].isFavorite = !registry[planId].isFavorite;
  fs.writeFileSync(SEATING_PLANS_CACHE_FILE, JSON.stringify(registry, null, 2));
  revalidatePath('/admin');
  return { success: true };
}

export async function adminUpdateRoomMetadata(planId: number, metadata: { internalName: string }) {
  let registry: Record<string, any> = {};
  if (fs.existsSync(SEATING_PLANS_CACHE_FILE)) {
    registry = JSON.parse(fs.readFileSync(SEATING_PLANS_CACHE_FILE, 'utf-8'));
  }

  // Auto-crea l'entry se non esiste ancora nel registro
  if (!registry[planId]) {
    registry[planId] = { id: planId, isHidden: false, isFavorite: false, internalName: '' };
  }

  registry[planId].internalName = metadata.internalName;
  fs.writeFileSync(SEATING_PLANS_CACHE_FILE, JSON.stringify(registry, null, 2));
  revalidatePath('/admin');
  return { success: true };
}



export async function adminGetSeatingPlanDetail(planId: number) {
  return await getSeatingPlanDetail(planId);
}



/**
 * HELPER: Calculates capacities for standard and VIP seats directly from a seating plan layout.
 */
function calculateCapacitiesFromLayout(layout: any) {
  let intero = 0;
  let vip = 0;

  const checkVip = (categoryName: string) => {
    const name = (categoryName || '').toUpperCase();
    return name.includes('VIP') || name.includes('POLTRONA');
  };

  // 1. Handle zones structure (Classic)
  layout?.zones?.forEach((zone: any) => {
    zone.rows?.forEach((row: any) => {
      row.seats?.forEach((seat: any) => {
        if (checkVip(seat.category)) vip++;
        else intero++;
      });
    });
  });

  // 2. Handle flat objects structure (New Editor / Graphical)
  layout?.objects?.forEach((obj: any) => {
    if (obj.type === 'seat' || obj.category) {
      if (checkVip(obj.category)) vip++;
      else intero++;
    }
  });

  return { intero, vip };
}





export async function adminScheduleMovie(
  movieData: { id: string; title: string; overview: string; posterPath: string; language: string; subtitles: string; versionLanguage: string },
  dateStr: string,
  timeStr: string,
  seatingPlanId: number,
  override: boolean = false,
  buffer: number = 0,
  skipSync: boolean = false,
  enrichedMetadata?: any,
  /**
   * Il palinsesto già noto, per chi crea a lotti.
   *
   * Ricavarlo costa una lettura paginata di TUTTI i sub-eventi futuri da
   * Pretix, e questa funzione viene chiamata una volta per spettacolo: su un
   * lotto da sei erano sei scansioni complete dello stesso palinsesto, con in
   * più il rischio di prendersi un 429 e i suoi backoff da secondi.
   *
   * Chi passa questo parametro riceve indietro `blockedAfter`, cioè la stessa
   * lista con dentro lo spettacolo appena creato: ripassandola alla chiamata
   * successiva il controllo dei conflitti resta identico — ogni spettacolo è
   * confrontato con gli esistenti E con quelli creati poco prima — ma Pretix
   * viene letto una volta sola per l'intero lotto.
   */
  knownBlocked?: { start: number; end: number; title: string; runtime: number }[],
  /**
   * Consente lo sconfinamento dall'orario d'apertura — inizio prima delle
   * 10:00, fine del film dopo l'01:00 — e **soltanto** quello.
   *
   * A differenza di `override`, che spegne anche il controllo delle
   * sovrapposizioni, questo lascia in piedi ogni verifica sulla sala: due film
   * insieme restano impossibili. Serve a chi programma a mano un singolo
   * spettacolo sapendo già cosa comporta, perché il sito gliel'ha detto e lui
   * ha risposto di sì; l'orario d'apertura è una regola di chi gestisce il
   * cinema, non una legge fisica.
   */
  allowOutsideHours: boolean = false
) {
  try {
    // ── TRACCIAMENTO ESECUZIONE (visibile nei log Vercel) ──────────────────────
    console.log(`[adminScheduleMovie] ▶ START (TECNICA STRINGA CRUDA)`, {
      movieTitle: movieData.title,
      dateStr,
      timeStr,
      seatingPlanId,
      override,
      allowOutsideHours,
      serverTime: new Date().toISOString()
    });

    // 1. Fetch full details from TMDB (for Director, Language, Runtime)
    // If enrichedMetadata is provided, we skip redundant API calls
    const details = enrichedMetadata || await getMovieDetails(movieData.id);
    if (!details) throw new Error('Could not fetch movie details from TMDB');

    const director = enrichedMetadata 
      ? (Array.isArray(enrichedMetadata.director) ? enrichedMetadata.director.join(', ') : enrichedMetadata.director)
      : getDirector(details);
      
    const cast = enrichedMetadata
      ? (Array.isArray(enrichedMetadata.cast) ? enrichedMetadata.cast.join(', ') : enrichedMetadata.cast)
      : getCast(details);

    // 2. Fetch Seating Plan Details to get exact category names
    // Cache attiva (5 minuti). La piantina di una sala non cambia mentre stai
    // creando spettacoli, e riscaricarla per intero a ogni spettacolo era il
    // costo più grosso di una programmazione lunga: quaranta film, quaranta
    // scaricamenti dello stesso file. Chi crea a lotti la rinfresca una volta
    // sola all'inizio (vedi `commitRunner`), così resta anche aggiornata.
    const planDetail = await getSeatingPlanDetail(seatingPlanId);
    if (!planDetail) throw new Error(`Could not fetch seating plan detail for ID ${seatingPlanId}`);

    // 3. Build Seat Category Mapping ONLY from categories that have actual seats in the layout.
    // CRITICAL: Pretix returns 500 if seat_category_mapping references a category (e.g. "VIP")
    // for which no seat exists in the seating plan (common for newly created rooms with all-INTERO layouts).
    //
    // Step A: collect categories from actual seat objects (zones/rows/seats format)
    const categoriesWithSeats = new Set<string>();
    
    // A1: Zones/Rows structure
    planDetail.layout?.zones?.forEach((zone: any) => {
      zone.rows?.forEach((row: any) => {
        row.seats?.forEach((seat: any) => {
          if (seat.category) categoriesWithSeats.add(seat.category);
        });
      });
    });

    // A2: Flat objects structure
    planDetail.layout?.objects?.forEach((obj: any) => {
      if ((obj.type === 'seat' || !obj.type) && obj.category) {
        categoriesWithSeats.add(obj.category);
      }
    });

    // Step B: if Step A found nothing (Pretix graphical layout uses a different format),
    // fall back to the declared layout categories but cross-check with actual capacity counts
    // to avoid including VIP when there are no VIP seats.
    if (categoriesWithSeats.size === 0) {
      const { intero: capIntero, vip: capVip } = calculateCapacitiesFromLayout(planDetail.layout);
      const layoutCategories: any[] = planDetail.layout?.categories || [];
      layoutCategories.forEach((c: any) => {
        const isVipCategory = (c.name || '').toUpperCase().includes('VIP') || (c.name || '').toUpperCase().includes('POLTRONA');
        if (isVipCategory && capVip > 0) categoriesWithSeats.add(c.name);
        if (!isVipCategory && capIntero > 0) categoriesWithSeats.add(c.name);
      });
    }

    // DEBUG: log sample seat GUIDs to detect collision issues
    const sampleGuids = planDetail.layout?.zones?.[0]?.rows?.[0]?.seats?.slice(0, 3).map((s: any) => s.seat_guid) || [];
    console.log(`[adminScheduleMovie] 🔑 GUID posti sala ${seatingPlanId} (campione):`, sampleGuids);
    console.log(`[adminScheduleMovie] 📊 Categorie CON POSTI nel layout:`, [...categoriesWithSeats]);

    const seatCategoryMapping: Record<string, number> = {};

    categoriesWithSeats.forEach((name: string) => {
      if (name.toUpperCase().includes('VIP') || name.toUpperCase().includes('POLTRONA')) {
        seatCategoryMapping[name] = ITEM_VIP_ID;
      } else {
        seatCategoryMapping[name] = ITEM_INTERO_ID;
      }
    });

    // Final fallback: if still empty, default to INTERO only
    if (Object.keys(seatCategoryMapping).length === 0) {
      seatCategoryMapping['INTERO'] = ITEM_INTERO_ID;
    }

    console.log(`[adminScheduleMovie] 🗺️ Mapping categorie generato:`, seatCategoryMapping);

    // 4. Calculate Capacities DYNAMICALLY from the layout
    const { intero: calculatedIntero, vip: calculatedVip } = calculateCapacitiesFromLayout(planDetail.layout);

    let interoSize = calculatedIntero;
    let vipSize = calculatedVip;

    // Final safety check
    if (interoSize === 0 && vipSize === 0) {
      interoSize = 1000; // Emergency fallback
    }

    // 5. Algorithm No-Overlap Check (Nuclear Bit-Map Logic)
    const runtimeMinutes = (details.runtime || 120);
    const CLEANING_BUFFER_NEW = MIN_GAP_MINUTES * 60000;

    // Per i calcoli interni della bitmap, usiamo STILL toDate ma solo per posizionarci
    // NON lo usiamo per la stringa finale Pretix.
    const dateInput = `${dateStr}T${timeStr}`;
    const startDate = toDate(dateInput, { timeZone: TIMEZONE });
    const sNew = startDate.getTime();
    const eNew = sNew + (runtimeMinutes * 60000) + CLEANING_BUFFER_NEW;

    console.log(`[adminScheduleMovie] ⏱ Calcolo occupazione`, {
      runtimeMinutes,
      startISO: startDate.toISOString(),
      override
    });

    const blockedIntervals = knownBlocked ?? (await getBlockedIntervals(seatingPlanId));

    // CRITICAL: use timezone-aware Rome midnight for the bitmap anchor
    const dayStartMs = getRomeDayStartMs(startDate);
    const dayMap = getDayOccupancyMap(blockedIntervals, startDate);

    // Enforce opening hours for non-overridden requests.
    // `allowOutsideHours` salta questo blocco e nient'altro: il controllo dei
    // conflitti qui sotto vale anche per gli spettacoli fuori orario.
    if (allowOutsideHours) {
      console.log(`[adminScheduleMovie] 🌙 Fuori orario consentito su richiesta esplicita`, { dateStr, timeStr });
    }
    if (!override && !allowOutsideHours) {
      const transitionDateMs = getRomeDayStartMs(new Date('2026-06-09'));
      if (dayStartMs >= transitionDateMs) {
        // Apertura e chiusura vengono dal motore: se un giorno cambiano, cambiano
        // per chi genera il piano e per chi lo salva nello stesso momento.
        const minStartMs = dayStartMs + OPENING_MINUTE * 60000;
        const maxEndMs = dayStartMs + CLOSING_MINUTE * 60000;

        if (sNew < minStartMs) {
          const msg = `Orario non consentito: il primo spettacolo non può iniziare prima delle 10:00.`;
          console.log(`[adminScheduleMovie] ⛔ ${msg}`);
          throw new Error(msg);
        }
        // Conta la fine del FILM, non la fine delle pulizie: dopo l'ultimo
        // spettacolo il cinema chiude, e nessuno resta ad aspettare che la sala
        // sia rifatta. Confrontare `eNew` (che include i 10 minuti di pausa)
        // rendeva illegali spettacoli che finivano alle 00:59.
        const movieEndMs = sNew + runtimeMinutes * 60000;
        if (movieEndMs > maxEndMs) {
          const msg = `Orario non consentito: l'ultimo spettacolo deve terminare entro l'01:00 (il film terminerebbe alle ${formatInTimeZone(new Date(movieEndMs), TIMEZONE, 'HH:mm')}).`;
          console.log(`[adminScheduleMovie] ⛔ ${msg}`);
          throw new Error(msg);
        }
      } else {
        const minStartMs = dayStartMs + 8 * 60 * 60 * 1000; // 08:00
        const maxStartMs = dayStartMs + (23 * 60 + 30) * 60 * 1000; // 23:30
        if (sNew < minStartMs) {
          const msg = `Orario non consentito: prima del 9 Giugno il primo spettacolo non può iniziare prima delle 08:00.`;
          console.log(`[adminScheduleMovie] ⛔ ${msg}`);
          throw new Error(msg);
        }
        if (sNew > maxStartMs) {
          const msg = `Orario non consentito: prima del 9 Giugno l'ultimo spettacolo non può iniziare dopo le 23:30.`;
          console.log(`[adminScheduleMovie] ⛔ ${msg}`);
          throw new Error(msg);
        }
      }
    }

    const hasConflict = !isRangeFree(dayMap, sNew, eNew, dayStartMs) ||
                        blockedIntervals.some(interval => sNew < interval.end && eNew > interval.start);

    console.log(`[adminScheduleMovie] 🔍 Conflict check →`, { hasConflict, override });

    if (hasConflict && !override) {
      const conflict = blockedIntervals.find(interval => sNew < interval.end && eNew > interval.start);
      const msg = `Conflitto rilevato: l'orario scelto si sovrappone alla proiezione di "${conflict?.title || 'un altro film'}" (incluse pulizie sala).`;
      console.log(`[adminScheduleMovie] ⛔ ${msg}`);
      throw new Error(msg);
    }

    // override === true: ignora il conflitto e procedi comunque
    if (hasConflict && override) {
      console.log(`[adminScheduleMovie] ⚠️ Override attivo: procedo con il salvataggio nonostante il conflitto.`);
    }

    const movieRating = enrichedMetadata?.rating || await getEnhancedRating(details);

    // 6. Create the Sub-Event in Pretix with Mapping
    const subEvent = await createSubEvent({
      title: movieData.title,
      date: dateStr,
      time: timeStr,
      tmdbId: movieData.id,
      overview: movieData.overview,
      posterPath: movieData.posterPath,
      runtime: runtimeMinutes,
      director: director,
      cast: Array.isArray(cast) ? cast.join(', ') : (cast || ""),
      language: movieData.language,
      subtitles: movieData.subtitles,
      versionLanguage: movieData.versionLanguage,
      seatingPlanId: seatingPlanId,
      seatCategoryMapping: seatCategoryMapping,
      // Store additional rich metadata in comment for the Souvenir Ticket
      tagline: details.tagline || '',
      genres: details.genres?.map((g: any) => g.name).join(', ') || '',
      year: details.release_date ? details.release_date.split('-')[0] : '',
      rating: movieRating,
      logoPath: enrichedMetadata?.logo_path || getMovieLogo(details) || '',
      backdropPath: enrichedMetadata?.backdrop_path || details.backdrop_path || '',
      awards: enrichedMetadata?.awards || [],
    });

    const subeventId = subEvent.id;

    // --- PARALLEL CONFIGURATION (Standard Tecnico) ---
    // Parallelize Pretix setup to reduce scheduling time per show
    const setupTasks: Promise<any>[] = [];

    // 6. Price Overrides
    setupTasks.push(setSubEventPriceOverrides(subeventId, [
      { item: ITEM_INTERO_ID, price: "0.00" },
      { item: ITEM_VIP_ID, price: "0.00" }
    ]));

    // 7. Quota Intero
    if (interoSize > 0) {
      setupTasks.push(createQuota(
        subeventId,
        'Quota Intero',
        interoSize,
        [ITEM_INTERO_ID]
      ));
    }

    // 8. Quota Poltrona
    if (vipSize > 0) {
      setupTasks.push(createQuota(
        subeventId,
        'Quota Poltrona',
        vipSize,
        [ITEM_VIP_ID]
      ));
    }

    await Promise.all(setupTasks);

    // --- ATOMIC SYNC (Standard Tecnico) ---
    // Ensure the database is updated immediately after creation
    if (!skipSync) {
      try {
        const { syncPretixToDatabase } = await import('@/services/sync.service');
        await syncPretixToDatabase({ skipPush: true });
      } catch (syncErr) {
        console.error('[adminScheduleMovie] ⚠️ Background sync failed:', syncErr);
      }
    }

    revalidatePath('/');
    revalidatePath('/admin/movies-control');

    // Alert logic: if IT was missing or all countries missing, we let the client know
    const isItMissing = !details.release_dates?.results?.some((r: any) => r.iso_3166_1 === 'IT' && r.release_dates.length > 0);

    console.log(`[adminScheduleMovie] ✅ END – Subevent creato ID=${subeventId}, runtime=${runtimeMinutes}m`);

    return {
      success: true,
      subeventId: subeventId,
      runtimeMinutes,
      // Il palinsesto con dentro lo spettacolo appena creato. Chi crea a lotti
      // lo ripassa come `knownBlocked` alla chiamata dopo: stessi controlli,
      // ma Pretix letto una volta sola invece che una per spettacolo.
      // `eNew` include già la pausa pulizie, come le voci che arrivano da
      // `getBlockedIntervals`.
      blockedAfter: [
        ...blockedIntervals,
        { start: sNew, end: eNew, title: movieData.title, runtime: runtimeMinutes },
      ],
      ratingWarning: isItMissing ? `Attenzione: Classificazione IT mancante. Usato fallback internazionale o 'T'.` : null
    };
  } catch (error: any) {
    console.error('[adminScheduleMovie] ❌ Errore critico:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function adminDeleteEvent(subEventId: number) {
  // 1. Get info before deletion to know if we need to clean up movie metadata later
  const prisma = (await import('@/lib/prisma')).default;
  const projection = await prisma.pretixSync.findUnique({
    where: { pretixId: subEventId },
    select: { tmdbId: true }
  });

  // 2. Delete from Pretix
  await deleteSubEvent(subEventId);

  // 3. Delete from local database
  try {
    await prisma.pretixSync.delete({
      where: { pretixId: subEventId }
    });
    console.log(`[adminDeleteEvent] ✅ Record deleted from database: ${subEventId}`);

    // 4. Self-Cleaning: If this was the last projection for this movie, delete the override
    if (projection?.tmdbId) {
      const remainingCount = await prisma.pretixSync.count({
        where: { tmdbId: projection.tmdbId }
      });

      if (remainingCount === 0) {
        console.log(`[adminDeleteEvent] 🧹 Cleaning up unused movie metadata: ${projection.tmdbId}`);
        await prisma.movieOverride.delete({
          where: { tmdbId: projection.tmdbId }
        }).catch(() => {}); // Ignore errors if already deleted
      }
    }
  } catch (err) {
    console.warn(`[adminDeleteEvent] ⚠️ Could not delete from DB (maybe already gone):`, subEventId);
  }

  revalidatePath('/');
  revalidatePath('/admin/movies-control');
  return { success: true };
}

export async function adminDeleteEventGroup(subEventIds: number[]) {
  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];
  const deletedIds: number[] = [];
  const tmdbIdsToCheck = new Set<string>();

  const prisma = (await import('@/lib/prisma')).default;

  for (const id of subEventIds) {
    try {
      // Get tmdbId before deletion
      const proj = await prisma.pretixSync.findUnique({
        where: { pretixId: id },
        select: { tmdbId: true }
      });
      if (proj?.tmdbId) tmdbIdsToCheck.add(proj.tmdbId);

      await deleteSubEvent(id);
      successCount++;
      deletedIds.push(id);
    } catch (e: any) {
      console.error(`Error deleting sub-event ${id}:`, e);
      errorCount++;
      if (e.message?.includes('403')) {
        errors.push(`ID ${id}: Non eliminabile (biglietti già emessi)`);
      } else {
        errors.push(`ID ${id}: ${e.message}`);
      }
    }
  }

  // Bulk delete from DB
  if (deletedIds.length > 0) {
    try {
      await prisma.pretixSync.deleteMany({
        where: { pretixId: { in: deletedIds } }
      });
      console.log(`[adminDeleteEventGroup] ✅ ${deletedIds.length} records deleted from database.`);

      // Self-Cleaning for movies
      for (const tmdbId of tmdbIdsToCheck) {
        const remainingCount = await prisma.pretixSync.count({
          where: { tmdbId: tmdbId }
        });
        if (remainingCount === 0) {
          console.log(`[adminDeleteEventGroup] 🧹 Cleaning up unused movie metadata: ${tmdbId}`);
          await prisma.movieOverride.delete({ where: { tmdbId } }).catch(() => {});
        }
      }
    } catch (dbErr) {
      console.error(`[adminDeleteEventGroup] ❌ DB delete failed:`, dbErr);
    }
  }

  revalidatePath('/');
  revalidatePath('/admin/movies-control');
  return {
    success: true,
    summary: `Eliminati ${successCount} spettacoli. Errori: ${errorCount}.`,
    details: errors
  };
}


export async function adminUpdateEventDate(subEventId: number, newDate: string) {
  try {
    // 1. Fetch current event to calculate duration
    const currentEvent = await getSubEvent(subEventId);

    const start = new Date(currentEvent.date_from);
    const end = new Date(currentEvent.date_to);
    const durationMs = end.getTime() - start.getTime();

    // 2. Calculate new start and end components
    // Assumiamo che newDate arrivi dal frontend come YYYY-MM-DDTHH:mm
    const [datePart, timePart] = newDate.split('T');

    // Calcoliamo Inizio e Fine con la matematica pura (zero oggetti Date per il calcolo orario)
    const dateFrom = calculatePretixDateTime(datePart, timePart, 0);
    const dateTo = calculatePretixDateTime(datePart, timePart, Math.round(durationMs / 60000));

    console.log('[adminUpdateEventDate] Zero Logic Update (Math Pura):', { dateFrom, dateTo });

    await updateSubEvent(subEventId, {
      date_from: dateFrom,
      date_to: dateTo
    });

    // Aggiorniamo chirurgicamente anche il database locale PretixSync in modo che il sito rifletta subito la modifica
    try {
      const prisma = (await import('@/lib/prisma')).default;
      const dateFromObj = new Date(dateFrom);
      const dateToObj = new Date(dateTo);
      await prisma.pretixSync.update({
        where: { pretixId: subEventId },
        data: {
          dateFrom: dateFromObj,
          dateTo: dateToObj,
          startTime: dateFromObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }),
          endTime: dateToObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
        }
      });
      console.log(`[adminUpdateEventDate] ✅ Database record updated surgically for subevent ID ${subEventId}`);
    } catch (dbErr) {
      console.error('[adminUpdateEventDate] ⚠️ Failed to update database record surgically:', dbErr);
    }

    revalidatePath('/');
    revalidatePath('/admin/movies-control');
    revalidatePath('/[slug]', 'layout');
    return { success: true };
  } catch (error: any) {
    console.error('Error in adminUpdateEventDate:', error);
    // Propagate the specific error message to the frontend
    throw new Error(error.message || 'Errore durante l\'aggiornamento dell\'orario');
  }
}

export async function adminListQuotas(subeventId: number) {
  return await listQuotas(subeventId);
}

export async function adminUpdateQuota(quotaId: number, size: number | null) {
  const result = await updateQuota(quotaId, { size });
  revalidatePath('/');
  return result;
}

export async function adminDeleteQuota(quotaId: number) {
  await deleteQuota(quotaId);
  revalidatePath('/');
  return { success: true };
}

export async function adminGetQuotaAvailability(quotaId: number) {
  return await getQuotaAvailability(quotaId);
}

/**
 * SMART SCHEDULING: Get the first available slot for a given movie/room.
 */
export async function adminClearMovieMetadata(tmdbId: string) {
  deleteMovieMetadata(tmdbId);
  revalidatePath('/');
  revalidatePath('/admin');
  return { success: true };
}

/**
 * Get all future empty projections (0 tickets sold)
 */
export async function adminGetEmptyProjections() {
  const futureEvents = await listSubEvents(true);

  // To avoid rate-limiting, we'll fetch quotas in batches of 5 if there are many,
  // or just Promise.all since the count of future events shouldn't be massive.
  const checks = await Promise.all(futureEvents.map(async (event: any) => {
    try {
      const quotas = await listQuotas(event.id);
      let isEmpty = true;
      if (quotas.length > 0) {
        for (const q of quotas) {
          // If any quota has less available than the total size, it means something was sold.
          // Note: if size is null (unlimited), available_number is also null, so we skip.
          if (q.size !== null && q.available_number !== null && q.available_number < q.size) {
            isEmpty = false;
            break;
          }
        }
      }
      return isEmpty ? event : null;
    } catch {
      return null;
    }
  }));

  const emptyEvents = checks.filter(Boolean);

  // Sort chronologically (closest first)
  return emptyEvents.sort((a, b) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime());
}


export async function adminCreateSeatingPlan(name: string, numRows: number = 5, numCols: number = 10) {
  try {
    const normalizedName = name.toUpperCase().trim();
    const ROWS = Math.max(1, Math.min(numRows, 50));
    const COLS = Math.max(1, Math.min(numCols, 50));

    // Spacing matching real Pretix plans
    const SEAT_SPACING_X = 76;
    const SEAT_SPACING_Y = 80;
    const ZONE_OFFSET_Y = 250; // space above rows for screen decoration

    const newUuid = () => crypto.randomUUID();

    // Build rows with ALL required Pretix fields
    const rows: any[] = [];
    for (let r = 1; r <= ROWS; r++) {
      const seats: any[] = [];
      for (let c = 1; c <= COLS; c++) {
        seats.push({
          seat_number: c.toString(),
          // seat_guid: UUID format required for Pretix compatibility
          seat_guid: newUuid(),
          // uuid: separate internal identifier required by Pretix's sub-event processing
          uuid: newUuid(),
          position: { x: (c - 1) * SEAT_SPACING_X, y: 0 },
          category: 'INTERO',
        });
      }
      rows.push({
        position: { x: 100, y: ZONE_OFFSET_Y + (r - 1) * SEAT_SPACING_Y },
        row_number: r.toString(),
        // row_number_position is required by Pretix
        row_number_position: 'both',
        seats,
        // uuid on row is required by Pretix's internal processing
        uuid: newUuid(),
      });
    }

    const totalWidth = Math.max(900, 200 + COLS * SEAT_SPACING_X);
    const totalHeight = Math.max(900, ZONE_OFFSET_Y + ROWS * SEAT_SPACING_Y + 200);

    const layout = {
      name: normalizedName,
      categories: [
        // Only INTERO — do NOT include VIP when no VIP seats exist (causes 500 on sub-event creation)
        { name: 'INTERO', color: '#4F46E5' },
      ],
      zones: [
        {
          name: normalizedName,
          position: { x: 0, y: 0 },
          rows,
          // areas must be present (can be empty array, but the field must exist)
          areas: [
            {
              shape: 'rectangle',
              color: '#cccccc',
              border_color: '#000000',
              rotation: 0,
              uuid: newUuid(),
              position: { x: totalWidth * 0.2, y: 80 },
              text: {
                position: { x: totalWidth * 0.1, y: 20 },
                color: '#333333',
                text: 'SCHERMO / SCREEN',
                size: 30,
              },
              rectangle: { width: totalWidth * 0.6, height: 60 },
            },
          ],
          // uuid on zone is required
          uuid: newUuid(),
          // zone_id is required by Pretix
          zone_id: normalizedName,
        },
      ],
      size: { width: totalWidth, height: totalHeight },
    };

    console.log('[adminCreateSeatingPlan] Creazione sala:', normalizedName, `(${ROWS} file × ${COLS} posti)`);
    console.log('[adminCreateSeatingPlan] Sample seat_guid:', layout.zones[0].rows[0]?.seats[0]?.seat_guid);

    const newPlan = await createSeatingPlan({ name: normalizedName, layout });
    const planId = newPlan?.id;
    if (!planId) throw new Error('Pretix non ha restituito un ID per la nuova sala');

    console.log('[adminCreateSeatingPlan] ✅ Sala creata, ID:', planId);

    await adminSyncMirror();
    return { success: true, plan: newPlan };
  } catch (error: any) {
    console.error('[adminCreateSeatingPlan] ❌ Errore:', error?.message || error);
    throw new Error(error?.message || 'Errore sconosciuto durante la creazione della sala');
  }
}


/**
 * OVERRIDE SYSTEM: GET ALL MOVIE OVERRIDES
 */
export async function adminGetOverrides() {
  const { getOverrides } = await import('@/services/db.service');
  return await getOverrides();
}

/**
 * OVERRIDE SYSTEM: SAVE A MOVIE OVERRIDE
 * Also invalidates the TMDB disk cache for this movie so the next
 * page render re-fetches fresh metadata (poster/backdrop/trailer).
 */
export async function upsertMovieOverride(tmdbId: string, override: any) {
  // Validate identity: tmdbId must be a non-empty string
  if (!tmdbId || typeof tmdbId !== 'string') {
    throw new Error(`[upsertMovieOverride] ID non valido: "${tmdbId}". Operazione annullata.`);
  }

  const { saveOverride, deleteMovieMetadata } = await import('@/services/db.service');

  // TRUE DB WRITE — confirmed before revalidation
  try {
    const writeSuccess = await saveOverride(tmdbId, { 
      ...override, 
      customDirector: Array.isArray(override.customDirector) ? override.customDirector.join(', ') : override.customDirector,
      customCast: Array.isArray(override.customCast) ? override.customCast.join(', ') : override.customCast,
      versionLanguage: override.versionLanguage,
      subtitles: override.subtitles,
      customVersion: override.customVersion,
      isManualOverride: true,
      isDraft: false
    });
    
    if (!writeSuccess) {
      throw new Error(`Scrittura DB fallita per tmdbId=${tmdbId}`);
    }

    // 🔍 Debug log — visible in terminal/Vercel logs only after confirmed write
    console.log('💾 DB_WRITE_CONFIRMED:', tmdbId, override);

    // Bust the enriched metadata disk cache so the next SSR pass picks up
    // the new customPosterPath / customBackdropPath / customTrailerUrl.
    deleteMovieMetadata(tmdbId);

    // --- NEW: Immediate Push to Pretix ---
    // Instead of waiting for the next cron sync, we push the new metadata to all
    // sub-events associated with this movie RIGHT NOW.
    try {
      const prisma = (await import('@/lib/prisma')).default;
      const { updateSubEvent } = await import('@/services/pretix');
      const syncedProjections = await prisma.pretixSync.findMany({ 
        where: { tmdbId: tmdbId } 
      });

      console.log(`[upsertMovieOverride] 🚀 Instant-pushing updated metadata to ${syncedProjections.length} Pretix sub-events...`);
      
      const fullOverride = await prisma.movieOverride.findUnique({
        where: { tmdbId: tmdbId },
        include: { awards: true }
      }) as any;

      if (fullOverride) {
        const commentObj = {
          tmdbId: tmdbId,
          rating: fullOverride.customRating || 'T',
          runtime: fullOverride.runtime || 120,
          versionLanguage: fullOverride.versionLanguage?.trim() || 'ITA',
          subtitles: fullOverride.subtitles?.trim() || 'NESSUNO',
          customVersion: fullOverride.customVersion || '',
          posterPath: fullOverride.customPosterPath || '',
          backdropPath: fullOverride.customBackdropPath || '',
          logoPath: fullOverride.customLogoPath === 'none' ? '' : (fullOverride.customLogoPath || ''),
          director: fullOverride.customDirector || '',
          cast: fullOverride.customCast || '',
          // Awards compatibility fields
          hasOscar: fullOverride.awards?.some((a: any) => a.type === 'oscar') || false,
          oscarDetails: fullOverride.awards?.find((a: any) => a.type === 'oscar')?.details || '',
          hasCannes: fullOverride.awards?.some((a: any) => a.type === 'cannes') || false,
          cannesDetails: fullOverride.awards?.find((a: any) => a.type === 'cannes')?.details || '',
          hasVenice: fullOverride.awards?.some((a: any) => a.type === 'venice') || false,
          veniceDetails: fullOverride.awards?.find((a: any) => a.type === 'venice')?.details || '',
          awardYear: fullOverride.awards?.[0]?.year || null,
          // Full awards array for future consumers
          awards: fullOverride.awards || [],
          trailerUrl: fullOverride.customTrailerUrl || '',
        };

        const linguaValue = fullOverride.versionLanguage?.trim() || 'ITA';
        const sottotitoliValue = fullOverride.subtitles?.trim() || 'NESSUNO';

        for (const proj of syncedProjections) {
          await updateSubEvent(proj.pretixId, {
            comment: JSON.stringify(commentObj),
            meta_data: {
              lingua: linguaValue,
              sottotitoli: sottotitoliValue
            }
          });
        }

        // Aggiorna anche le righe locali PretixSync: la homepage legge la lingua
        // per-proiezione da metaLingua/metaSottotitoli, non dall'override. Senza
        // questo update la home continuerebbe a mostrare la vecchia lingua fino
        // al prossimo sync completo da Pretix.
        if (syncedProjections.length > 0) {
          await prisma.pretixSync.updateMany({
            where: { tmdbId: tmdbId },
            data: {
              metaLingua: linguaValue,
              metaSottotitoli: sottotitoliValue
            }
          });
        }
      }
    } catch (pushErr) {
      console.error(`[upsertMovieOverride] ⚠️ Failed to push immediate update to Pretix for ${tmdbId}:`, pushErr);
      // We don't throw here, as the DB write was already successful.
    }
    
    revalidatePath('/');
    revalidatePath('/admin/movies-control');
    revalidatePath('/[slug]', 'layout'); // Catch-all for movie detail pages if any
    return { success: true };
  } catch (err: any) {
    console.error(`[upsertMovieOverride] CRITICAL ERROR for tmdbId=${tmdbId}:`, err);
    throw new Error(`[upsertMovieOverride] Scrittura DB fallita per tmdbId=${tmdbId}. Verifica i log del server per i dettagli Prisma.`);
  }
}

/**
 * BIG BANG: Total Database Population
 */
export async function adminSyncAllMovies(forceRefresh: boolean = false): Promise<any> {
  try {
    const { syncPretixToDatabase } = await import('@/services/sync.service');
    const result = await syncPretixToDatabase({ forceMetadataRefresh: forceRefresh });
    revalidatePath('/');
    revalidatePath('/admin/movies-control');
    return { success: true, result };
  } catch (error: any) {
    console.error('[adminSyncAllMovies] ❌ Errore sincronizzazione totale:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * OVERRIDE SYSTEM: DELETE A MOVIE OVERRIDE
 */
export async function adminDeleteOverride(tmdbId: string) {
  const { getOverrides, deleteMovieMetadata } = await import('@/services/db.service');
  
  // Use Prisma directly
  const prisma = (await import('@/lib/prisma')).default;
  try {
    await prisma.movieOverride.delete({ where: { tmdbId } });
  } catch(e) {
    // Ignore if not found
  }

  // Also bust the TMDB disk cache
  deleteMovieMetadata(tmdbId);

  revalidatePath('/', 'layout');
  revalidatePath('/', 'page');
  revalidatePath('/admin/movies-control');
  return { success: true };
}

/**
 * OVERRIDE SYSTEM: GET ALL UNIQUE PROGRAMMED MOVIES
 */
export async function adminGetProgrammedMovies() {
  const prisma = (await import('@/lib/prisma')).default;
  
  // Get unique movies from PretixSync table (synced by cron)
  const syncProjections = await prisma.pretixSync.findMany({
    where: { active: true },
    orderBy: { dateFrom: 'asc' }
  });

  const uniqueMovies: Record<string, { tmdbId: string; title: string; lastDate: string; projections: any[] }> = {};

  for (const se of syncProjections) {
    const tmdbId = se.tmdbId;
    if (tmdbId) {
      if (!uniqueMovies[tmdbId]) {
        uniqueMovies[tmdbId] = {
          tmdbId,
          title: se.name,
          lastDate: se.dateFrom.toISOString(),
          projections: []
        };
      } else if (new Date(se.dateFrom) > new Date(uniqueMovies[tmdbId].lastDate)) {
        uniqueMovies[tmdbId].lastDate = se.dateFrom.toISOString();
      }
      uniqueMovies[tmdbId].projections.push({
        pretixId: se.pretixId,
        dateFrom: se.dateFrom.toISOString(),
        startTime: (se as any).startTime,
        endTime: (se as any).endTime,
        roomName: se.roomName,
        isSoldOut: se.isSoldOut,
        availableSeats: se.availableSeats,
        totalSeats: (se as any).totalSeats
      });
    }
  }

  // Convert to array and sort by date (ascending - soonest first)
  const sorted = Object.values(uniqueMovies).sort((a, b) => 
    new Date(a.lastDate).getTime() - new Date(b.lastDate).getTime()
  );

  return sorted;
}

/**
 * VISUAL CONTROL CENTER: FETCH ALL DATA HYDRATED (TMDB + OVERRIDES)
 */
export async function adminGetVisualControlData() {
  const programmed = await adminGetProgrammedMovies();
  const overrides = await adminGetOverrides();
  
  const hydrated = await Promise.all(programmed.map(async (movie) => {
    const tmdbData = await getEnrichedMovieMetadata(movie.tmdbId);
    const override = overrides[movie.tmdbId] || {};
    
    return {
      ...movie,
      tmdbData,
      override
    };
  }));

  return hydrated;
}

export async function adminSyncSoldOutStatus() {
  try {
    const { updateEventAvailability } = await import('@/services/sync.service');
    const { syncSoldOutStatus } = await import('@/services/pretix');

    console.log('[ADMIN-SYNC] Avvio sincronizzazione forzata di tutti gli eventi futuri da Pretix...');
    
    // 1. Recupera la lista di tutti gli eventi futuri da Pretix (futureOnly = true, skipCache = true)
    const rawSubEvents = await listSubEvents(true, false, true);
    console.log(`[ADMIN-SYNC] Trovati ${rawSubEvents.length} eventi futuri su Pretix da sincronizzare.`);

    // 2. Sincronizzazione chirurgica forzata per ogni evento futuro
    let count = 0;
    for (const se of rawSubEvents) {
      await updateEventAvailability(se.id, true); // force = true per interrogare live le API di Pretix!
      count++;
      
      // Pausa di cortesia ogni 5 richieste per mitigare rischi di rate-limiting 429
      if (count % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // 3. Esegui il controllo globale dello stato sold-out dei film
    await syncSoldOutStatus();

    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/admin/movies-control');

    console.log(`[ADMIN-SYNC] Sincronizzazione completata con successo! Aggiornati ${count} eventi.`);
    return { success: true, count };
  } catch (error) {
    console.error('Error in adminSyncSoldOutStatus:', error);
    throw error;
  }
}

/**
 * PRE-SCHEDULING: Fetch and cache full movie metadata (including awards)
 */
export async function adminPrepareMetadata(tmdbId: string) {
  try {
    const { getEnrichedMovieMetadata } = await import('@/services/tmdb');
    const { saveOverride } = await import('@/services/db.service');
    
    console.log(`[adminPrepareMetadata] 🚀 Preparing metadata for TMDB ID: ${tmdbId}`);
    const metadata = await getEnrichedMovieMetadata(tmdbId);
    
    if (metadata) {
      const prisma = (await import('@/lib/prisma')).default;
      const existing = await prisma.movieOverride.findUnique({ where: { tmdbId } }) as any;
      
      const isStub = existing?.customTitle === 'Caricamento...';
      console.log(`[adminPrepareMetadata] 💾 Persisting enriched metadata to DB for ${tmdbId} (Existing: ${!!existing}, isStub: ${isStub})`);
      
      await saveOverride(tmdbId, {
        customTitle: (existing?.customTitle && !isStub) ? existing.customTitle : metadata.title,
        customOverview: existing?.customOverview || metadata.overview,
        customPosterPath: existing?.customPosterPath || metadata.poster_path || '',
        customBackdropPath: existing?.customBackdropPath || metadata.backdrop_path || '',
        customLogoPath: existing?.customLogoPath || metadata.logo_path || '',
        customTrailerUrl: existing?.customTrailerUrl || metadata.trailerUrl || '',
        customRating: existing?.customRating || metadata.rating || 'T',
        customDirector: existing?.customDirector || (Array.isArray(metadata.director) ? metadata.director.join(', ') : (metadata.director || '')),
        customCast: existing?.customCast || (Array.isArray(metadata.cast) ? metadata.cast.join(', ') : (metadata.cast || '')),
        runtime: metadata.runtime,
        releaseDate: metadata.release_date,
        awards: metadata.awards || [],
        isManualOverride: existing?.isManualOverride || false,
        isDraft: false
      });

      // I premi appena estratti valgono anche per il catalogo: è l'unica volta
      // che li abbiamo in mano, e conservarli qui non costa nessuna chiamata in
      // più. Il catalogo si arricchisce da sé man mano che programmi, invece di
      // pretendere uno scraping di massa su film che non hai ancora scelto.
      try {
        const labels = ((metadata.awards ?? []) as { label?: string }[])
          .map((a) => a?.label)
          .filter((l): l is string => typeof l === 'string' && l.length > 0);
        await prisma.catalogFilm.updateMany({
          where: { tmdbId },
          data: { awardLabels: labels, awardsCheckedAt: new Date() },
        });
      } catch (err) {
        // Il catalogo è un di più: se non si aggiorna, la programmazione va
        // avanti lo stesso.
        console.warn(`[adminPrepareMetadata] premi non salvati in catalogo per ${tmdbId}`, err);
      }

      return metadata;
    } else {
      console.warn(`[adminPrepareMetadata] ⚠️ No metadata found for TMDB ID: ${tmdbId}`);
    }
  } catch (error) {
    console.error(`[adminPrepareMetadata] ❌ Error preparing metadata for ${tmdbId}:`, error);
  }
  
  return null;
}

export async function adminSyncNewlyCreatedEvents(pretixIds: number[]) {
  try {
    const { syncNewlyCreatedEvents } = await import('@/services/sync.service');
    await syncNewlyCreatedEvents(pretixIds);
    revalidatePath('/');
    revalidatePath('/admin/movies-control');
    return { success: true };
  } catch (error: any) {
    console.error('[adminSyncNewlyCreatedEvents] ❌ Errore sincronizzazione:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Refreshes MUBI awards for a single movie and persists them to the DB.
 * Safe to call on existing movies — does NOT overwrite other overrides.
 */
export async function adminRefreshMovieAwards(tmdbId: string) {
  try {
    const { deleteMovieMetadata, saveOverride } = await import('@/services/db.service');
    const { fetchMubiAwards, getManualAwards } = await import('@/services/mubi');
    const { getMovieDetails } = await import('@/services/tmdb');

    deleteMovieMetadata(tmdbId);

    const details = await getMovieDetails(tmdbId);
    if (!details) return { success: false, error: 'Film non trovato su TMDB' };

    const year = details.release_date?.split('-')[0];
    const mubiData = await fetchMubiAwards(tmdbId, details.title, details.original_title, year);
    const manualAwards = getManualAwards(tmdbId);
    const finalAwards = manualAwards || mubiData?.awards || [];

    await saveOverride(tmdbId, {
      awards: finalAwards,
      mubiId: mubiData?.mubiId || undefined
    });

    revalidatePath('/');
    return { success: true, count: finalAwards.length };
  } catch (error: any) {
    console.error(`[adminRefreshMovieAwards] ❌ Error for ${tmdbId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Refreshes MUBI awards for ALL currently scheduled movies.
 */
export async function adminRefreshAllAwards() {
  try {
    const prisma = (await import('@/lib/prisma')).default;
    const projections = await prisma.pretixSync.findMany({
      where: { dateFrom: { gte: new Date() }, tmdbId: { not: null } },
      select: { tmdbId: true },
      distinct: ['tmdbId']
    });

    let updated = 0;
    let failed = 0;
    for (const { tmdbId } of projections) {
      if (!tmdbId) continue;
      const result = await adminRefreshMovieAwards(tmdbId);
      if (result.success) updated++;
      else failed++;
    }

    revalidatePath('/');
    revalidatePath('/admin/movies-control');
    return { success: true, updated, failed };
  } catch (error: any) {
    console.error('[adminRefreshAllAwards] ❌ Error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
