'use server';

import fs from 'fs';
import { searchMovies, getMovieDetails, getDirector, getCast, getMovieLogo, getItalianRating, getEnhancedRating } from '@/services/tmdb';
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
  listSeatingPlans
} from '@/services/pretix';
import { ITEM_INTERO_ID, ITEM_VIP_ID, SEATING_PLANS_CACHE_FILE } from '@/constants/pretix';
import { revalidatePath } from 'next/cache';
import { toDate, formatInTimeZone } from 'date-fns-tz';
import { calculatePretixDateTime } from '@/utils/dateUtils';

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
 * HELPER: Calculates blocked intervals for a specific room.
 * Each interval is [Start, End + 15m Cleaning].
 * Uses TMDB to fetch missing durations for absolute precision.
 */
async function getBlockedIntervals(seatingPlanId: number) {
  const events = await listSubEvents(true);
  const CLEANING_BUFFER_EXISTING = 15 * 60000;

  console.log(`\n--- DEBUG: CALCOLO OCCUPAZIONE REALE PER SALA ${seatingPlanId} ---`);

  const intervals = await Promise.all(events
    .filter((e: any) => e.active === true && Number(e.seating_plan) === seatingPlanId)
    .map(async (e: any) => {
      const s = new Date(e.date_from).getTime();
      let runtimeMin = 120; // Default fallback
      let source = "FALLBACK (120m)";

      // 1. Try metadata in comment
      try {
        if (e.comment) {
          const metadata = JSON.parse(e.comment);
          if (metadata.runtime) {
            runtimeMin = metadata.runtime;
            source = "METADATA";
          }
        }
      } catch { /* ignore */ }

      // 2. If metadata failed or was default, try TMDB by ID or Title
      if (source === "FALLBACK (120m)") {
        const title = e.name.it || e.name;
        // Search TMDB for this title
        const results = await adminSearchMovies(title);
        if (results && results.length > 0) {
          const firstMatch = results[0];
          const details = await adminGetMovieById(firstMatch.id.toString());
          if (details?.runtime) {
            runtimeMin = details.runtime;
            source = `TMDB (${details.runtime}m)`;
          }
        }
      }

      // 3. Respect date_to if it's already larger (manual overrides)
      let e_end = s + runtimeMin * 60000;
      if (e.date_to) {
        const dTo = new Date(e.date_to).getTime();
        if (dTo > e_end) {
          e_end = dTo;
          source += " + MANUAL OVERRIDE";
        }
      }

      const interval = {
        start: s,
        end: e_end + CLEANING_BUFFER_EXISTING,
        title: e.name.it || e.name,
        runtime: runtimeMin,
        source
      };

      const dateStr = formatInTimeZone(new Date(s), TIMEZONE, "dd/MM HH:mm");
      console.log(`[${dateStr}] ${interval.title.padEnd(25)} | Fine: ${formatInTimeZone(new Date(e_end), TIMEZONE, "HH:mm")} | Durata: ${runtimeMin}m | Fonte: ${source}`);

      return interval;
    }));

  console.log(`--- FINE DEBUG ---\n`);
  return intervals;
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

export async function adminSearchMovies(query: string) {
  return await searchMovies(query);
}

export async function adminGetMovieById(id: string) {
  return await getMovieDetails(id);
}

export async function adminListEvents() {
  return await listSubEvents(true);
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

  layout?.zones?.forEach((zone: any) => {
    zone.rows?.forEach((row: any) => {
      row.seats?.forEach((seat: any) => {
        const isVip = seat.category && (
          seat.category.toUpperCase().includes('VIP') ||
          seat.category.toUpperCase().includes('POLTRONA')
        );
        if (isVip) {
          vip++;
        } else {
          intero++;
        }
      });
    });
  });

  return { intero, vip };
}





export async function adminScheduleMovie(
  movieData: { id: string; title: string; overview: string; posterPath: string; language: string; subtitles: string },
  dateStr: string,
  timeStr: string,
  seatingPlanId: number,
  override: boolean = false,
  buffer: number = 0
) {
  // ── TRACCIAMENTO ESECUZIONE (visibile nei log Vercel) ──────────────────────
  console.log(`[adminScheduleMovie] ▶ START (TECNICA STRINGA CRUDA)`, {
    movieTitle: movieData.title,
    dateStr,
    timeStr,
    seatingPlanId,
    override,
    serverTime: new Date().toISOString()
  });

  // 1. Fetch full details from TMDB (for Director, Language, Runtime)
  const details = await getMovieDetails(movieData.id);
  if (!details) throw new Error('Could not fetch movie details from TMDB');

  const director = getDirector(details);
  const cast = getCast(details);

  // 2. Fetch Seating Plan Details to get exact category names
  const planDetail = await getSeatingPlanDetail(seatingPlanId);
  if (!planDetail) throw new Error(`Could not fetch seating plan detail for ID ${seatingPlanId}`);

  // 3. Build Seat Category Mapping ONLY from categories that have actual seats in the layout.
  // CRITICAL: Pretix returns 500 if seat_category_mapping references a category (e.g. "VIP")
  // for which no seat exists in the seating plan (common for newly created rooms with all-INTERO layouts).
  //
  // Step A: collect categories from actual seat objects (zones/rows/seats format)
  const categoriesWithSeats = new Set<string>();
  planDetail.layout?.zones?.forEach((zone: any) => {
    zone.rows?.forEach((row: any) => {
      row.seats?.forEach((seat: any) => {
        if (seat.category) categoriesWithSeats.add(seat.category);
      });
    });
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
  const CLEANING_BUFFER_NEW = 10 * 60000;

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

  const blockedIntervals = await getBlockedIntervals(seatingPlanId);

  // CRITICAL: use timezone-aware Rome midnight for the bitmap anchor
  const dayStartMs = getRomeDayStartMs(startDate);
  const dayMap = getDayOccupancyMap(blockedIntervals, startDate);

  const hasConflict = !isRangeFree(dayMap, sNew, eNew, dayStartMs);

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



  const movieRating = await getEnhancedRating(details);

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
    seatingPlanId: seatingPlanId,
    seatCategoryMapping: seatCategoryMapping,
    // Store additional rich metadata in comment for the Souvenir Ticket
    tagline: details.tagline || '',
    genres: details.genres?.map(g => g.name).join(', ') || '',
    year: details.release_date ? details.release_date.split('-')[0] : '',
    rating: movieRating,
    logoPath: getMovieLogo(details) || '',
    backdropPath: details.backdrop_path || '',
  });

  const subeventId = subEvent.id;

  // 6. Force 0.00 EUR for this sub-event for fixed products
  const priceOverrides = [
    { item: ITEM_INTERO_ID, price: "0.00" },
    { item: ITEM_VIP_ID, price: "0.00" }
  ];
  await setSubEventPriceOverrides(subeventId, priceOverrides);

  // 7. Create Quotas scoped to the sub-event
  // Create 'Quota Intero' with size definitely > 0
  if (interoSize > 0) {
    await createQuota(
      subeventId,
      'Quota Intero',
      interoSize,
      [ITEM_INTERO_ID]
    );
  }

  // Create 'Quota Poltrona' if defined
  if (vipSize > 0) {
    await createQuota(
      subeventId,
      'Quota Poltrona',
      vipSize,
      [ITEM_VIP_ID]
    );
  }

  revalidatePath('/');

  // Alert logic: if IT was missing or all countries missing, we let the client know
  // Note: the check here is simple. If it's 'T' and we had a console warning in tmdb.ts, 
  // it's a fallback. For simplicity, we flag if IT was missing.
  const isItMissing = !details.release_dates?.results?.some(r => r.iso_3166_1 === 'IT' && r.release_dates.length > 0);

  console.log(`[adminScheduleMovie] ✅ END – Subevent creato ID=${subeventId}, runtime=${runtimeMinutes}m`);

  return { 
    success: true, 
    subeventId: subeventId, 
    runtimeMinutes,
    ratingWarning: isItMissing ? `Attenzione: Classificazione IT mancante. Usato fallback internazionale o 'T'.` : null
  };
}

export async function adminDeleteEvent(subEventId: number) {
  await deleteSubEvent(subEventId);
  revalidatePath('/');
  return { success: true };
}

export async function adminDeleteEventGroup(subEventIds: number[]) {
  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (const id of subEventIds) {
    try {
      await deleteSubEvent(id);
      successCount++;
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

  revalidatePath('/');
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

    revalidatePath('/');
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
export async function adminGetSmartSuggestion(tmdbId: string, seatingPlanId: number, buffer: number = 0) {
  const details = await getMovieDetails(tmdbId);
  const runtime = (details?.runtime || 120);
  const CLEANING_BUFFER_NEW = 10 * 60000;
  const runtimeWithBufferMs = (runtime * 60000) + CLEANING_BUFFER_NEW;
  const roundingMs = 5 * 60000;

  const now = new Date();
  const blockedIntervals = await getBlockedIntervals(seatingPlanId);

  // Scan starting from now, rounded to 5 mins
  let currentPointer = Math.ceil(now.getTime() / roundingMs) * roundingMs;

  // Limit search to next 7 days for smart suggestion
  const limitMs = now.getTime() + (7 * 24 * 60 * 60 * 1000);

  while (currentPointer < limitMs) {
    const sNew = currentPointer;
    const eNew = sNew + runtimeWithBufferMs;

    const dRef = new Date(sNew);
    // CRITICAL: timezone-aware Rome midnight for bitmap anchor
    const dayStartMs = getRomeDayStartMs(dRef);
    const dayMap = getDayOccupancyMap(blockedIntervals, dRef);

    const hasConflict = !isRangeFree(dayMap, sNew, eNew, dayStartMs);
    if (!hasConflict) {
      return formatManualISO(new Date(sNew));
    }

    // Jump to the end of the conflicting interval to find the next gap
    const conflict = blockedIntervals.find(interval => sNew < interval.end && eNew > interval.start);
    if (conflict) {
      currentPointer = Math.ceil(conflict.end / roundingMs) * roundingMs;
    } else {
      currentPointer += roundingMs;
    }
  }

  return formatManualISO(new Date(currentPointer));
}

/**
 * SMART SCHEDULING: Check if a specific time slot overlaps.
 */
export async function adminCheckConflict(date: string, tmdbId: string, seatingPlanId: number, buffer: number = 0) {
  const details = await getMovieDetails(tmdbId);
  const runtime = (details?.runtime || 120);
  const sDate = toDate(date, { timeZone: TIMEZONE });
  const sNew = sDate.getTime();
  const CLEANING_BUFFER_NEW = 10 * 60000;
  const eNew = sNew + (runtime * 60000) + CLEANING_BUFFER_NEW;

  const blockedIntervals = await getBlockedIntervals(seatingPlanId);

  // CRITICAL: timezone-aware Rome midnight for bitmap anchor
  const dayStartMs = getRomeDayStartMs(sDate);
  const dayMap = getDayOccupancyMap(blockedIntervals, sDate);

  const hasConflict = !isRangeFree(dayMap, sNew, eNew, dayStartMs);

  if (hasConflict) {
    const conflict = blockedIntervals.find(interval => sNew < interval.end && eNew > interval.start);
    // Round end to 5 mins and display in Rome timezone
    const roundedFreeAt = new Date(Math.ceil((conflict?.end || 0) / (5 * 60000)) * (5 * 60000));
    const conflictEndTime = formatInTimeZone(roundedFreeAt, TIMEZONE, 'HH:mm');

    return {
      hasConflict: true,
      movieTitle: conflict?.title || 'un altro film',
      conflictEndTime,
      runtime
    };
  }
  return { hasConflict: false, runtime };
}



/**
 * Finds the nearest free slots before and after a conflict.
 * Returns suggestive ISO strings for the UI.
 */
export async function adminFindNearestSlots(date: string, tmdbId: string, seatingPlanId: number, buffer: number = 0) {
  const details = await getMovieDetails(tmdbId);
  const runtime = details?.runtime || 120;
  const CLEANING_BUFFER_NEW = 10 * 60000;
  const runtimeWithBufferMs = (runtime * 60000) + CLEANING_BUFFER_NEW;
  const roundingMs = 5 * 60000;

  const targetDateMs = toDate(date, { timeZone: TIMEZONE }).getTime();
  const blockedIntervals = await getBlockedIntervals(seatingPlanId);

  // Find pre-conflict slot (scan backwards from target)
  let preSuggestion: string | null = null;
  let prePointer = targetDateMs - roundingMs;
  const preLimit = targetDateMs - (12 * 60 * 60 * 1000); // 12h back max

  while (prePointer > preLimit) {
    const sNew = prePointer;
    const eNew = sNew + runtimeWithBufferMs;
    const dRef = new Date(sNew);
    // CRITICAL: timezone-aware Rome midnight
    const dayStartMs = getRomeDayStartMs(dRef);
    const dayMap = getDayOccupancyMap(blockedIntervals, dRef);
    if (isRangeFree(dayMap, sNew, eNew, dayStartMs)) {
      preSuggestion = formatInTimeZone(new Date(sNew), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
      break;
    }
    prePointer -= roundingMs;
  }

  // Find post-conflict slot (scan forwards from target)
  let postSuggestion: string | null = null;
  let postPointer = targetDateMs + roundingMs;
  const postLimit = targetDateMs + (12 * 60 * 60 * 1000); // 12h forward max

  while (postPointer < postLimit) {
    const sNew = postPointer;
    const eNew = sNew + runtimeWithBufferMs;
    const dRef = new Date(sNew);
    // CRITICAL: timezone-aware Rome midnight
    const dayStartMs = getRomeDayStartMs(dRef);
    const dayMap = getDayOccupancyMap(blockedIntervals, dRef);
    if (isRangeFree(dayMap, sNew, eNew, dayStartMs)) {
      postSuggestion = formatInTimeZone(new Date(sNew), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
      break;
    }
    postPointer += roundingMs;
  }

  return { preSuggestion, postSuggestion, runtime };
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


/**
 * BULK SCHEDULING: Get multiple available slots for the next 14 days.
 * Optimized to find real gaps based on runtime + buffer.
 */
export async function adminGetWeeklySlots(tmdbId: string, seatingPlanId: number, daysCount = 14, buffer = 0) {
  const details = await getMovieDetails(tmdbId);
  const runtime = (details?.runtime || 120);
  const CLEANING_BUFFER_NEW = 10 * 60000; // 10m buffer for new movie
  const runtimeWithBufferMs = (runtime * 60000) + CLEANING_BUFFER_NEW;
  const SCAN_STEP_MS = 5 * 60000; // Scan every 5 minutes

  console.log(`[adminGetWeeklySlots] Film: ${tmdbId} | Runtime: ${runtime}m | Sala: ${seatingPlanId}`);

  const blockedIntervals = await getBlockedIntervals(seatingPlanId);
  const suggestions: { date: string; label: string; isOccupied: boolean; isMorning?: boolean; runtime: number }[] = [];
  const nowMs = Date.now();

  for (let d = 0; d < daysCount; d++) {
    // Compute Rome midnight for day d using an approximate UTC ms reference then correcting with getRomeDayStartMs
    const approxDayMs = nowMs + d * 24 * 60 * 60 * 1000;
    const dayStartMs = getRomeDayStartMs(new Date(approxDayMs)); // 00:00 in Rome

    // Timeline boundary in Rome time: 08:00 = +8h, 23:30 = +23.5h
    const timelineStartMs = dayStartMs + 8 * 60 * 60 * 1000;
    const timelineEndMs = dayStartMs + (23 * 60 + 30) * 60 * 1000;

    let currentPointer = timelineStartMs;

    const daySlots: typeof suggestions = [];
    const dayMap = getDayOccupancyMap(blockedIntervals, new Date(dayStartMs));

    while (currentPointer <= timelineEndMs) {
      const sNew = currentPointer;
      const eNew = sNew + runtimeWithBufferMs;

      // Skip slots in the past
      if (sNew > nowMs) {
        const hasConflict = !isRangeFree(dayMap, sNew, eNew, dayStartMs);

        if (!hasConflict) {
          // Build the display label in Rome timezone (correct even on UTC Vercel)
          const romeHHmm = formatInTimeZone(new Date(sNew), TIMEZONE, 'HH:mm');
          const h = parseInt(romeHHmm.split(':')[0], 10);
          daySlots.push({
            date: formatManualISO(new Date(sNew)),
            label: romeHHmm,
            isOccupied: false,
            isMorning: h >= 5 && h < 13,
            runtime
          });
        }
      }
      currentPointer += SCAN_STEP_MS;
    }

    // Filter slots to show one every 30 minutes to provide a dense but readable grid
    // If the room is free, this will show e.g. 09:00, 09:30, 10:00...
    const groupedSlots: typeof suggestions = [];
    const seenIntervals = new Set<string>();

    daySlots.forEach(s => {
      const [h, m] = s.label.split(':').map(Number);
      const intervalKey = `${h}:${m < 30 ? '00' : '30'}`;
      if (!seenIntervals.has(intervalKey)) {
        groupedSlots.push(s);
        seenIntervals.add(intervalKey);
      }
    });

    suggestions.push(...groupedSlots);
  }

  console.log(`[adminGetWeeklySlots] Trovati ${suggestions.length} slot liberi nei prossimi ${daysCount} giorni.`);
  return suggestions;
}



/**
 * BULK SCHEDULING: Create multiple screenings at once.
 */
export async function adminBulkScheduleMovie(
  movieData: { id: string; title: string; overview: string; posterPath: string; language: string; subtitles: string },
  selectedDates: string[],
  seatingPlanId: number,
  buffer: number = 0
) {
  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (const fullDate of selectedDates) {
    try {
      const [datePart, timePart] = fullDate.includes('T') ? fullDate.split('T') : [fullDate, "00:00"];
      // Clean up timePart if it has seconds/offset
      const cleanTime = timePart.substring(0, 5);

      console.log(`[adminBulkScheduleMovie] Processing slot: ${datePart} ${cleanTime}`);
      await adminScheduleMovie(movieData, datePart, cleanTime, seatingPlanId, false, buffer);
      successCount++;
    } catch (e: any) {
      console.error(`Bulk Error at ${fullDate}:`, e);
      errorCount++;
      errors.push(`${fullDate}: ${e.message}`);
    }
  }

  revalidatePath('/');
  return {
    success: true,
    summary: `Creati ${successCount} spettacoli. Errori: ${errorCount}.`,
    details: errors
  };
}

/**
 * MIRROR SYSTEM: CREATE NEW SEATING PLAN WITH CONFIGURABLE LAYOUT
 *
 * CRITICAL: The layout JSON must match Pretix's internal format EXACTLY.
 * Missing fields (uuid on seats/rows/zones, row_number_position, areas, zone_id)
 * cause a Python KeyError in Pretix's sub-event processing → HTTP 500.
 *
 * Reference format obtained from a working Pretix-created plan.
 *
 * @param name     Nome della sala (es. "SALA 1")
 * @param numRows  Numero di file (default 5)
 * @param numCols  Numero di posti per fila (default 10)
 */
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

