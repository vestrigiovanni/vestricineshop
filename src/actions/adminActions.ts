'use server';

import { searchMovies, getMovieDetails, getDirector, getCast, getMovieLogo } from '@/services/tmdb';
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
  getQuotaAvailability
} from '@/services/pretix';
import { ITEM_INTERO_ID, ITEM_VIP_ID } from '@/constants/pretix';
import { revalidatePath } from 'next/cache';
import { toDate, formatInTimeZone } from 'date-fns-tz';

const TIMEZONE = 'Europe/Rome';
const pad = (n: number) => n.toString().padStart(2, '0');

function formatManualISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00+02:00`;
}

/**
 * HELPER: Calculates blocked intervals for a specific room.
 * Each interval is [Start, End + 15m Cleaning].
 */
async function getBlockedIntervals(seatingPlanId: number) {
  const events = await listSubEvents(true);
  const CLEANING_BUFFER_EXISTING = 15 * 60000; // 15 minutes as requested for existing screenings
  
  return events
    .filter((e: any) => Number(e.seating_plan) === seatingPlanId)
    .map((e: any) => {
      const s = new Date(e.date_from).getTime();
      let e_end: number;
      
      if (e.date_to) {
        e_end = new Date(e.date_to).getTime();
      } else {
        // Try parsing runtime from comment field (stored as JSON)
        let runtimeMs = 120 * 60000; // Default 2 hours
        try {
          if (e.comment) {
            const metadata = JSON.parse(e.comment);
            if (metadata.runtime) {
              runtimeMs = metadata.runtime * 60000;
            }
          }
        } catch { /* ignore parse errors */ }
        e_end = s + runtimeMs;
      }
      
      // Red Zone: Start until End + 15m Cleaning
      return { start: s, end: e_end + CLEANING_BUFFER_EXISTING, title: e.name.it || e.name };
    });
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

export async function adminGetSeatingPlans() {
  return await getSeatingPlan();
}

// 2. Mapping of Room Capacities (Seating Plan ID -> Capacities)
const ROOM_CAPACITIES: Record<number, { intero: number; vip?: number }> = {
  4081: { intero: 8 },         // SALA 1
  5391: { intero: 3, vip: 1 },  // SALA NICCOLINI
  5392: { intero: 3, vip: 1 },  // SALA FOSSATI
  5393: { intero: 9, vip: 1 },  // SALA ARIPALMARIA
  6550: { intero: 3, vip: 1 },  // SALA MARTINO
  6439: { intero: 3, vip: 1 },  // 24 SALA AGOSTINO FOSSATI
  6983: { intero: 10 },        // SALA CRAVEDI
  7354: { intero: 2, vip: 1 },  // SALA CA' GRANDA
  7016: { intero: 2 },         // SALA ANORA
};

export async function adminScheduleMovie(
  movieData: { id: string; title: string; overview: string; posterPath: string; language: string; subtitles: string },
  date: string,
  seatingPlanId: number,
  override: boolean = false,
  buffer: number = 0
) {
  // 1. Fetch full details from TMDB (for Director, Language, Runtime)
  const details = await getMovieDetails(movieData.id);
  if (!details) throw new Error('Could not fetch movie details from TMDB');

  const director = getDirector(details);
  const cast = getCast(details);

  // 2. Fetch Seating Plan Details to get exact category names
  const planDetail = await getSeatingPlanDetail(seatingPlanId);
  if (!planDetail) throw new Error(`Could not fetch seating plan detail for ID ${seatingPlanId}`);

  const categories = planDetail.layout?.categories || [];
  const categoryNames = categories.map((c: any) => c.name);

  // 3. Build Seat Category Mapping
  const seatCategoryMapping: Record<string, number> = {};

  // Ensure "INTERO" mapping exists explicitly
  seatCategoryMapping["INTERO"] = ITEM_INTERO_ID;

  categoryNames.forEach((name: string) => {
    if (name.toUpperCase().includes('VIP') || name.toUpperCase().includes('POLTRONA')) {
      seatCategoryMapping[name] = ITEM_VIP_ID;
    } else {
      seatCategoryMapping[name] = ITEM_INTERO_ID;
    }
  });

  // 4. Calculate Capacities if not in ROOM_CAPACITIES
  let interoSize = 0;
  let vipSize = 0;

  const roomConfig = ROOM_CAPACITIES[seatingPlanId];
  if (roomConfig) {
    interoSize = roomConfig.intero;
    vipSize = roomConfig.vip || 0;
  } else {
    // Count seats from the plan layout
    planDetail.layout?.zones?.forEach((zone: any) => {
      zone.rows?.forEach((row: any) => {
        row.seats?.forEach((seat: any) => {
          if (seat.category && (seat.category.toUpperCase().includes('VIP') || seat.category.toUpperCase().includes('POLTRONA'))) {
            vipSize++;
          } else {
            interoSize++;
          }
        });
      });
    });
    console.log(`Calculated capacities for unknown room ${seatingPlanId}: Intero=${interoSize}, VIP=${vipSize}`);
  }

  // Fallback to avoid capacity 0 for 'Intero'
  if (interoSize === 0) interoSize = 1000;

  // Expand Quota Intero by 1 seat as requested by the user
  interoSize += 1;

  // 5. Algorithm No-Overlap Check (Strict Sliding Window Logic)
  const runtimeMinutes = (details.runtime || 120);
  const CLEANING_BUFFER_NEW = 10 * 60000; // 10m cleaning for the new movie footprint
  const startDate = toDate(date, { timeZone: TIMEZONE });
  const sNew = startDate.getTime();
  const eNew = sNew + (runtimeMinutes * 60000) + CLEANING_BUFFER_NEW; // Movie + Footprint block
  
  const blockedIntervals = await getBlockedIntervals(seatingPlanId);
  const conflict = blockedIntervals.find(interval => sNew < interval.end && eNew > interval.start);

  if (conflict && !override) {
    throw new Error(`Conflitto rilevato: l'orario scelto si sovrappone alla proiezione di "${conflict.title}" (incluse pulizie sala).`);
  }



  // 6. Create the Sub-Event in Pretix with Mapping
  const subEvent = await createSubEvent({
    title: movieData.title,
    date: date, // Pass the original string, createSubEvent now handles the offset
    tmdbId: movieData.id,
    overview: movieData.overview,
    posterPath: movieData.posterPath,
    runtime: runtimeMinutes,
    director: director,
    cast: cast,
    language: movieData.language,
    subtitles: movieData.subtitles,
    seatingPlanId: seatingPlanId,
    seatCategoryMapping: seatCategoryMapping,
    // Store additional rich metadata in comment for the Souvenir Ticket
    tagline: details.tagline || '',
    genres: details.genres?.map(g => g.name).join(', ') || '',
    year: details.release_date ? details.release_date.split('-')[0] : '',
    rating: details.release_dates?.results?.find((r: any) => r.iso_3166_1 === 'IT')?.release_dates?.[0]?.certification ||
      details.release_dates?.results?.find((r: any) => r.iso_3166_1 === 'US')?.release_dates?.[0]?.certification || '',
    logoPath: getMovieLogo(details) || ''
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
  return { success: true, subeventId: subeventId };
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

    // 2. Calculate new start and end
    const newStart = toDate(newDate, { timeZone: TIMEZONE });
    const newEnd = new Date(newStart.getTime() + durationMs);

    // 3. Update with both fields
    const dateFrom = formatManualISO(newStart);
    const dateTo = formatManualISO(newEnd);

    console.log('STRINGA DATA AGGIORNATA INVIATA A PRETIX:', dateFrom);

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

    const hasConflict = blockedIntervals.some(interval => sNew < interval.end && eNew > interval.start);
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
  const sNew = toDate(date, { timeZone: TIMEZONE }).getTime();
  const CLEANING_BUFFER_NEW = 10 * 60000;
  const eNew = sNew + (runtime * 60000) + CLEANING_BUFFER_NEW;

  const blockedIntervals = await getBlockedIntervals(seatingPlanId);
  const conflict = blockedIntervals.find(interval => sNew < interval.end && eNew > interval.start);

  if (conflict) {
    // Round end to 5 mins
    const roundedFreeAt = new Date(Math.ceil(conflict.end / (5 * 60000)) * (5 * 60000));
    const pad = (n: number) => String(n).padStart(2, '0');
    const conflictEndTime = `${pad(roundedFreeAt.getHours())}:${pad(roundedFreeAt.getMinutes())}`;

    return { 
      hasConflict: true, 
      movieTitle: conflict.title,
      conflictEndTime
    };
  }
  return { hasConflict: false };
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
    if (!blockedIntervals.some(interval => sNew < interval.end && eNew > interval.start)) {
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
    if (!blockedIntervals.some(interval => sNew < interval.end && eNew > interval.start)) {
      postSuggestion = formatInTimeZone(new Date(sNew), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
      break;
    }
    postPointer += roundingMs;
  }

  return { preSuggestion, postSuggestion };
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

  const blockedIntervals = await getBlockedIntervals(seatingPlanId);
  const suggestions: { date: string; label: string; isOccupied: boolean; isMorning?: boolean }[] = [];
  const now = new Date();

  for (let d = 0; d < daysCount; d++) {
    const dayDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    dayDate.setHours(0, 0, 0, 0);
    
    // Timeline boundary: 08:00 to 23:30 (last possible start)
    const timelineStart = new Date(dayDate);
    timelineStart.setHours(8, 0, 0, 0);
    const timelineEnd = new Date(dayDate.getTime() + 23.5 * 60 * 60 * 1000);

    let currentPointer = timelineStart.getTime();

    const daySlots: typeof suggestions = [];
    while (currentPointer + runtimeWithBufferMs <= timelineEnd.getTime() + (runtimeWithBufferMs)) { 
      // Allow mapping slots that start before 23:30.
      if (currentPointer > timelineEnd.getTime()) break;

      const sNew = currentPointer;
      const eNew = sNew + runtimeWithBufferMs;

      // Skip slots in the past
      if (sNew > now.getTime()) {
        const hasConflict = blockedIntervals.some(interval => sNew < interval.end && eNew > interval.start);
        
        if (!hasConflict) {
          const dSlot = new Date(sNew);
          daySlots.push({
            date: formatManualISO(dSlot),
            label: `${pad(dSlot.getHours())}:${pad(dSlot.getMinutes())}`,
            isOccupied: false,
            isMorning: dSlot.getHours() < 13 && dSlot.getHours() >= 5
          });
        }
      }
      currentPointer += SCAN_STEP_MS;
    }

    // Filter to only show 2 slots per band per day to avoid clutter
    const morningSlots = daySlots.filter(s => new Date(s.date).getHours() < 14).slice(0, 2);
    const afternoonSlots = daySlots.filter(s => {
      const h = new Date(s.date).getHours();
      return h >= 14 && h < 18;
    }).slice(0, 2);
    const eveningSlots = daySlots.filter(s => new Date(s.date).getHours() >= 18).slice(0, 2);

    suggestions.push(...morningSlots, ...afternoonSlots, ...eveningSlots);
  }

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

  for (const date of selectedDates) {
    try {
      await adminScheduleMovie(movieData, date, seatingPlanId, false, buffer);
      successCount++;
    } catch (e: any) {
      console.error(`Bulk Error at ${date}:`, e);
      errorCount++;
      errors.push(`${date}: ${e.message}`);
    }
  }

  revalidatePath('/');
  return {
    success: true,
    summary: `Creati ${successCount} spettacoli. Errori: ${errorCount}.`,
    details: errors
  };
}
