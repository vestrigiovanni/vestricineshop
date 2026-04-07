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
  override: boolean = false
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

  // 5. Algorithm No-Overlap Check
  const CLEANING_BUFFER = 15;
  const runtimeMinutes = (details.runtime || 120);
  const startDate = new Date(date);
  const endDate = new Date(startDate.getTime() + (runtimeMinutes + CLEANING_BUFFER) * 60000);
  
  // Fetch existing sub-events for the same day/room to check for overlaps
  const existingEvents = await listSubEvents(true);
  const conflicts = existingEvents.filter((e: any) => {
    // Only check same room
    if (Number(e.seating_plan) !== seatingPlanId) return false;
    
    const eStart = new Date(e.date_from).getTime();
    const eEnd = e.date_to ? new Date(e.date_to).getTime() : eStart + (120 + CLEANING_BUFFER) * 60000;
    
    const sNew = startDate.getTime();
    const eNew = endDate.getTime();
    
    // Condition of validity: S_nuovo >= E_esist OR E_nuovo <= S_esist
    // Conflict if: NOT (S_nuovo >= E_esist OR E_nuovo <= S_esist)
    // Which is: S_nuovo < E_esist AND E_nuovo > S_esist
    return sNew < eEnd && eNew > eStart;
  });

  if (conflicts.length > 0 && !override) {
    const conflictMovie = conflicts[0].name.it || conflicts[0].name;
    throw new Error(`Conflitto rilevato: l'orario scelto si sovrappone alla proiezione di "${conflictMovie}" (incluse pulizie sala).`);
  }

  // 6. Create the Sub-Event in Pretix with Mapping
  const subEvent = await createSubEvent({
    title: movieData.title,
    date: startDate.toISOString(),
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
    const newStart = new Date(newDate);
    const newEnd = new Date(newStart.getTime() + durationMs);

    // 3. Update with both fields
    await updateSubEvent(subEventId, { 
      date_from: newStart.toISOString(),
      date_to: newEnd.toISOString()
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
export async function adminGetSmartSuggestion(tmdbId: string, seatingPlanId: number) {
  const details = await getMovieDetails(tmdbId);
  const runtime = (details?.runtime || 120) + 20; // Runtime + 20m buffer

  const events = await listSubEvents(true);
  const roomEvents = events
    .filter((e: any) => Number(e.seating_plan) === seatingPlanId)
    .sort((a: any, b: any) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime());

  if (roomEvents.length === 0) {
    // No events today, suggest start of next hour
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    return now.toISOString();
  }

  // Find the last event of the day
  const lastEvent = roomEvents[roomEvents.length - 1];
  const lastEventEnd = lastEvent.date_to 
    ? new Date(lastEvent.date_to).getTime() 
    : new Date(lastEvent.date_from).getTime() + (120 + 15) * 60000;

  // Add 15 mins buffer and round to nearest 5 minutes
  const bufferMs = 15 * 60 * 1000;
  const roundingMs = 5 * 60 * 1000;
  const proposedTimeMs = Math.ceil((lastEventEnd + bufferMs) / roundingMs) * roundingMs;
  
  return new Date(proposedTimeMs).toISOString();
}

/**
 * SMART SCHEDULING: Check if a specific time slot overlaps.
 */
export async function adminCheckConflict(date: string, tmdbId: string, seatingPlanId: number) {
  const details = await getMovieDetails(tmdbId);
  const runtime = (details?.runtime || 120);
  const sNew = new Date(date).getTime();
  const eNew = sNew + (runtime * 60000);
  const totalWindowNew = eNew + (15 * 60000); // 15m cleaning buffer

  const events = await listSubEvents(true);
  const conflict = events.find((e: any) => {
    if (Number(e.seating_plan) !== seatingPlanId) return false;
    const sExist = new Date(e.date_from).getTime();
    // Use date_to if available, else assume 120min
    const eExist = e.date_to ? new Date(e.date_to).getTime() : sExist + (120 * 60000);
    const totalWindowExist = eExist + (15 * 60000); 
    
    // Condition: New starts before existing ends+buffer AND new ends+buffer starts after existing starts
    return sNew < totalWindowExist && totalWindowNew > sExist;
  });

  if (conflict) {
    // Calculate when the room is free (end of conflicting event + buffer)
    const conflictEnd = conflict.date_to
      ? new Date(conflict.date_to).getTime()
      : new Date(conflict.date_from).getTime() + (120 * 60000);
    const roomFreeAt = new Date(conflictEnd + (15 * 60 * 1000));
    const pad = (n: number) => String(n).padStart(2, '0');
    const conflictEndTime = `${pad(roomFreeAt.getHours())}:${pad(roomFreeAt.getMinutes())}`;

    return { 
      hasConflict: true, 
      movieTitle: conflict.name.it || conflict.name,
      conflictEndTime
    };
  }
  return { hasConflict: false };
}

/**
 * Finds the nearest free slots before and after a conflict.
 * Returns suggestive ISO strings for the UI.
 */
export async function adminFindNearestSlots(date: string, tmdbId: string, seatingPlanId: number) {
  const details = await getMovieDetails(tmdbId);
  const runtime = details?.runtime || 120;
  const CLEANING_BUFFER = 15 * 60 * 1000;
  
  const targetDateMs = new Date(date).getTime();
  
  const events = await listSubEvents(true);
  const roomEvents = events
    .filter((e: any) => Number(e.seating_plan) === seatingPlanId)
    .sort((a: any, b: any) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime());

  // Helper to calculate end of an event
  const getEndMs = (e: any) => {
    return e.date_to ? new Date(e.date_to).getTime() : new Date(e.date_from).getTime() + (120 * 60000);
  };

  // Find pre-conflict slot (end of previous movie + buffer)
  const previousEvent = [...roomEvents].reverse().find(e => new Date(e.date_from).getTime() < targetDateMs);
  let preSuggestion: string | null = null;
  if (previousEvent) {
    const endMs = getEndMs(previousEvent);
    preSuggestion = new Date(endMs + CLEANING_BUFFER).toISOString();
  }

  // Find post-conflict slot (end of current conflict + buffer)
  // Current conflict can be the one we are overlapping with
  const conflictingEvent = roomEvents.find(e => {
    const sExist = new Date(e.date_from).getTime();
    const eExist = getEndMs(e);
    const totalWindowExist = eExist + CLEANING_BUFFER;
    const eNew = targetDateMs + (runtime * 60000);
    const totalWindowNew = eNew + CLEANING_BUFFER;

    return targetDateMs < totalWindowExist && totalWindowNew > sExist;
  });

  let postSuggestion: string | null = null;
  if (conflictingEvent) {
    const endMs = getEndMs(conflictingEvent);
    postSuggestion = new Date(endMs + CLEANING_BUFFER).toISOString();
  } else if (roomEvents.length > 0) {
     // If no direct conflict found but they asked for suggestion, 
     // maybe use the next one or the last one
     const lastEvent = roomEvents[roomEvents.length - 1];
     const endMs = getEndMs(lastEvent);
     postSuggestion = new Date(endMs + CLEANING_BUFFER).toISOString();
  }

  return { preSuggestion, postSuggestion };
}

/**
 * BULK SCHEDULING: Get multiple available slots for the next 14 days.
 */
export async function adminGetWeeklySlots(tmdbId: string, seatingPlanId: number, daysCount = 14) {
  const details = await getMovieDetails(tmdbId);
  const runtime = (details?.runtime || 120);
  const bufferMs = 15 * 60 * 1000;
  const runtimeWithBufferMs = (runtime * 60000) + bufferMs;

  const events = await listSubEvents(true);
  const roomEvents = events.filter((e: any) => Number(e.seating_plan) === seatingPlanId);

  const suggestions: { date: string; label: string; isOccupied: boolean; conflictWith?: string; isMorning?: boolean }[] = [];
  const now = new Date();

  for (let d = 0; d < daysCount; d++) {
    const dayDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    dayDate.setMinutes(0, 0, 0); // Normalized start of day
    
    const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
    
    // Timeline boundary: 08:30 to 00:30 (next day)
    const timelineStart = new Date(dayDate);
    timelineStart.setHours(8, 30, 0, 0);
    
    const timelineEnd = new Date(dayDate);
    timelineEnd.setHours(23, 59, 59, 999); // We go slightly into the next day logic-wise if needed, but keep it within day
    const absoluteEnd = new Date(dayDate.getTime() + 24.5 * 60 * 60 * 1000); // 00:30 next day

    // 1. Candidate Times
    let candidateTimes: string[] = [];
    
    if (isWeekend) {
      // More morning slots for weekends
      candidateTimes = ['09:30', '11:15', '13:30', '15:45', '18:15', '20:45'];
    } else {
      // Weekdays: Morning + Classic Slots
      candidateTimes = ['09:30', '11:30', '14:00', '16:20', '18:40', '21:00'];
    }

    // 2. Gap Detection Logic
    const sortedRoomEvents = roomEvents
      .filter((e: any) => {
        const start = new Date(e.date_from);
        return start.getFullYear() === dayDate.getFullYear() && 
               start.getMonth() === dayDate.getMonth() && 
               start.getDate() === dayDate.getDate();
      })
      .sort((a: any, b: any) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime());

    // Suggested time: End of previous event + buffer
    let lastOccupiedEnd = timelineStart.getTime();

    sortedRoomEvents.forEach((e: any) => {
      const eStart = new Date(e.date_from).getTime();
      const eEnd = e.date_to ? new Date(e.date_to).getTime() : eStart + (120 * 60000);
      const eEndWithBuffer = eEnd + bufferMs;

      const gapSize = eStart - lastOccupiedEnd;
      if (gapSize >= runtimeWithBufferMs) {
        // We found a gap! Suggest a slot at the start of it
        const gapSlot = new Date(lastOccupiedEnd);
        // Round to nearest 5 mins
        const rounded = new Date(Math.ceil(gapSlot.getTime() / (5 * 60000)) * (5 * 60000));
        const hh = String(rounded.getHours()).padStart(2, '0');
        const mm = String(rounded.getMinutes()).padStart(2, '0');
        const timeLabel = `${hh}:${mm}`;
        
        if (!candidateTimes.includes(timeLabel)) {
          candidateTimes.push(timeLabel);
        }
      }
      lastOccupiedEnd = Math.max(lastOccupiedEnd, eEndWithBuffer);
    });

    // Check gap after last event until 00:30
    const finalGap = absoluteEnd.getTime() - lastOccupiedEnd;
    if (finalGap >= runtimeWithBufferMs) {
      const gapSlot = new Date(lastOccupiedEnd);
      const rounded = new Date(Math.ceil(gapSlot.getTime() / (5 * 60000)) * (5 * 60000));
      const hh = String(rounded.getHours()).padStart(2, '0');
      const mm = String(rounded.getMinutes()).padStart(2, '0');
      const timeLabel = `${hh}:${mm}`;
      if (!candidateTimes.includes(timeLabel)) {
        candidateTimes.push(timeLabel);
      }
    }

    // Sort and Filter candidate times to be balanced
    candidateTimes.sort();

    candidateTimes.forEach(timeStr => {
      const [hh, mm] = timeStr.split(':').map(Number);
      const sProposed = new Date(dayDate);
      if (hh < 4) { // Handles the 00:30 case
        sProposed.setDate(sProposed.getDate() + 1);
      }
      sProposed.setHours(hh, mm, 0, 0);

      const sProposedMs = sProposed.getTime();
      const eProposedMs = sProposedMs + (runtime * 60000);
      const totalWindowProposed = eProposedMs + bufferMs;

      // Check conflict with any roomEvent
      const conflict = roomEvents.find((e: any) => {
        const sExist = new Date(e.date_from).getTime();
        const eExist = e.date_to ? new Date(e.date_to).getTime() : sExist + (120 * 60000);
        const totalWindowExist = eExist + bufferMs;
        
        return sProposedMs < totalWindowExist && totalWindowProposed > sExist;
      });

      if (sProposedMs > now.getTime()) {
        const suggestion = {
          date: sProposed.toISOString(),
          label: timeStr,
          isOccupied: !!conflict,
          conflictWith: conflict ? (conflict.name.it || conflict.name) : undefined,
          isMorning: hh < 13 && hh >= 5
        };
        // Avoid adding the same rounded time twice
        if (!suggestions.some(s => s.date === suggestion.date)) {
          suggestions.push(suggestion);
        }
      }
    });
  }

  // Final unique and sorted
  return suggestions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * BULK SCHEDULING: Create multiple screenings at once.
 */
export async function adminBulkScheduleMovie(
  movieData: { id: string; title: string; overview: string; posterPath: string; language: string; subtitles: string },
  selectedDates: string[],
  seatingPlanId: number
) {
  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (const date of selectedDates) {
    try {
      await adminScheduleMovie(movieData, date, seatingPlanId);
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
