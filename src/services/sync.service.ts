import prisma from '@/lib/prisma';
import { listSubEvents, getSeatingPlansMap, listQuotas } from '@/services/pretix';
import { getEnrichedMovieMetadata } from '@/services/tmdb';
import { ITEM_INTERO_ID, ITEM_VIP_ID } from '@/constants/pretix';
import { revalidatePath } from 'next/cache';
import { MovieOverride } from './db.service';
import { normalizeLanguageCode } from '@/constants/languages';


export async function syncPretixToDatabase(options: { forceMetadataRefresh?: boolean; skipPush?: boolean } = {}) {
  console.log('[SYNC] Starting Pretix -> Database synchronization...');
  const startTime = Date.now();

  // 1. Fetch all future sub-events and seating plans
  const [rawSubEvents, roomsMap] = await Promise.all([
    listSubEvents(true, false, true), // true = only future events, true = skip cache
    getSeatingPlansMap()
  ]);

  // IMPORTANT: We NO LONGER fetch all quotas globally here to avoid 429 rate-limiting.
  // Availability is now handled surgically by syncSingleSubevent.

  let upsertCount = 0;
  const currentPretixIds = new Set<number>();
  const currentTmdbIds = new Set<string>();

  // 2. STAGE 1: Ensure all movies exist in MovieOverride (as stubs if needed)
  // This prevents foreign key constraint errors during PretixSync upsert
  const uniqueTmdbIdsFromProjections = new Set<string>();
  for (const se of rawSubEvents) {
    let tmdbId: string | null = null;
    if (se.comment) {
      try {
        const commentData = JSON.parse(se.comment);
        tmdbId = commentData.tmdbId?.toString() || null;
      } catch {
        const tmdbIdMatch = se.comment.match(/TMDB_ID:(\d+)/);
        tmdbId = tmdbIdMatch ? tmdbIdMatch[1] : null;
      }
    }
    if (tmdbId) uniqueTmdbIdsFromProjections.add(tmdbId);
  }

  console.log(`[SYNC] Ensuring ${uniqueTmdbIdsFromProjections.size} movies exist in MovieOverride...`);
  for (const tmdbId of uniqueTmdbIdsFromProjections) {
    await prisma.movieOverride.upsert({
      where: { tmdbId },
      update: {}, // Don't overwrite existing manual data
      create: { 
        tmdbId,
        customTitle: 'Caricamento...', // Stub title
        isManualOverride: false,
        isDraft: false
      }
    });
  }

  // 3. STAGE 2: Sync each sub-event to PretixSync table
  for (const se of rawSubEvents) {
    currentPretixIds.add(se.id);

    let tmdbId: string | null = null;
    if (se.comment) {
      try {
        const commentData = JSON.parse(se.comment);
        tmdbId = commentData.tmdbId?.toString() || null;
      } catch {
        const tmdbIdMatch = se.comment.match(/TMDB_ID:(\d+)/);
        tmdbId = tmdbIdMatch ? tmdbIdMatch[1] : null;
      }
    }

    if (tmdbId) {
      currentTmdbIds.add(tmdbId);
    }

    // Availability is handled by surgical sync later or kept from DB
    // We don't overwrite isSoldOut here if we don't have new quota data
    const existingSync = await prisma.pretixSync.findUnique({ where: { pretixId: se.id } });
    const isPretixSoldOut = existingSync?.isSoldOut ?? false;
    const totalQuotaAvailable = existingSync?.availableSeats ?? null;
    const totalQuotaSize = existingSync?.totalSeats ?? null;

    const roomName = se.seating_plan ? (roomsMap[se.seating_plan] || 'Sala') : 'Sala';

    // 2. Write to PretixSync Table
    const syncData = {
      name: se.name?.it || se.name || 'Sconosciuto',
      slug: se.slug,
      dateFrom: new Date(se.date_from),
      dateTo: se.date_to ? new Date(se.date_to) : null,
      startTime: new Date(se.date_from).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }),
      endTime: se.date_to ? new Date(se.date_to).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : null,
      seatingPlanId: se.seating_plan,
      roomName: roomName,
      isSoldOut: isPretixSoldOut,
      availableSeats: totalQuotaAvailable,
      totalSeats: totalQuotaSize,
      tmdbId: tmdbId,
      comment: se.comment,
      active: se.active,
      metaLingua: se.meta_data?.lingua || null,
      metaSottotitoli: se.meta_data?.sottotitoli || null,
      metaFormat: se.meta_data?.format || null,
    };

    await prisma.pretixSync.upsert({
      where: { pretixId: se.id },
      update: syncData,
      create: { pretixId: se.id, ...syncData }
    });

    console.log(`[DB-WRITE-CHECK] ID: ${se.id} | availableSeats: ${totalQuotaAvailable} | isSoldOut: ${isPretixSoldOut}`);
    upsertCount++;
  }

  // 3. Auto-Hydrate MovieOverride table (Auto-Fill of NULLs or Force Refresh)
  const uniqueIds = Array.from(currentTmdbIds);
  console.log(`[SYNC] Processing ${uniqueIds.length} unique movies for metadata.`);

  await Promise.all(uniqueIds.map(async (tmdbId) => {
    const existingMovie = await prisma.movieOverride.findUnique({
      where: { tmdbId }
    }) as MovieOverride | null;

    // OPTIMIZATION: Only hydrate if record is missing or force refresh is requested.
    // Avoid re-hydrating just because some fields (like logo or trailer) are null,
    // as those might simply be unavailable on TMDb/YouTube.
    const needsHydration = options.forceMetadataRefresh || !existingMovie;


    if (needsHydration) {
      console.log(`[SYNC] 🚀 Deep Hydration for ID: ${tmdbId} (force: ${options.forceMetadataRefresh || 'auto-fill nulls'})`);
      try {
        // ALWAYS clear cache if hydration is needed to ensure we get fresh data from APIs
        const { deleteMovieMetadata } = await import('@/services/db.service');
        deleteMovieMetadata(tmdbId);

        const tmdbData = await getEnrichedMovieMetadata(tmdbId);
        if (tmdbData) {
          console.log(`[SYNC_DEBUG] Data for ${tmdbId}: release_date=${tmdbData.release_date}, runtime=${tmdbData.runtime}`);
          const trailerUrl = tmdbData.trailerKey ? `https://www.youtube.com/watch?v=${tmdbData.trailerKey}` : null;

          await prisma.movieOverride.upsert({
            where: { tmdbId: tmdbId },
            update: {
              customTitle: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) ? tmdbData.title : (existingMovie?.customTitle || tmdbData.title),
              customOverview: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) ? tmdbData.overview : (existingMovie?.customOverview || tmdbData.overview),
              customPosterPath: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) ? tmdbData.poster_path : (existingMovie?.customPosterPath || tmdbData.poster_path),
              customBackdropPath: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) ? tmdbData.backdrop_path : (existingMovie?.customBackdropPath || tmdbData.backdrop_path),
              customLogoPath: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) ? tmdbData.logo_path : (existingMovie?.customLogoPath || tmdbData.logo_path),
              customDirector: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) ? (Array.isArray(tmdbData.director) ? tmdbData.director.join(', ') : tmdbData.director) : (existingMovie?.customDirector || (Array.isArray(tmdbData.director) ? tmdbData.director.join(', ') : tmdbData.director)),
              customCast: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) ? (Array.isArray(tmdbData.cast) ? tmdbData.cast.join(', ') : tmdbData.cast) : (existingMovie?.customCast || (Array.isArray(tmdbData.cast) ? tmdbData.cast.join(', ') : tmdbData.cast)),
              customRating: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) ? (tmdbData.rating || 'T') : (existingMovie?.customRating || tmdbData.rating || 'T'),
              customTrailerUrl: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) ? trailerUrl : (existingMovie?.customTrailerUrl || trailerUrl),
              releaseDate: tmdbData.release_date || existingMovie?.releaseDate,
              runtime: tmdbData.runtime || existingMovie?.runtime,
              versionLanguage: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) || existingMovie?.versionLanguage === 'Italiano' || existingMovie?.versionLanguage === 'Lingua Originale'
                ? (tmdbData.original_language === 'it' ? 'ITA' : normalizeLanguageCode(tmdbData.original_language))
                : (existingMovie?.versionLanguage || (tmdbData.original_language === 'it' ? 'ITA' : normalizeLanguageCode(tmdbData.original_language))),

              subtitles: (options.forceMetadataRefresh && !existingMovie?.isManualOverride) || existingMovie?.subtitles === 'Nessuno' || existingMovie?.subtitles === 'Sottotitoli IT'
                ? (tmdbData.original_language === 'it' ? 'NESSUNO' : 'ITA')
                : (existingMovie?.subtitles || (tmdbData.original_language === 'it' ? 'NESSUNO' : 'ITA')),
            } as any,
            create: {
              tmdbId: tmdbId,
              customTitle: tmdbData.title,
              customOverview: tmdbData.overview,
              customPosterPath: tmdbData.poster_path,
              customBackdropPath: tmdbData.backdrop_path,
              customLogoPath: tmdbData.logo_path,
              customDirector: Array.isArray(tmdbData.director) ? tmdbData.director.join(', ') : tmdbData.director,
              customCast: Array.isArray(tmdbData.cast) ? tmdbData.cast.join(', ') : tmdbData.cast,
              customRating: tmdbData.rating || 'T',
              customTrailerUrl: trailerUrl,
              releaseDate: tmdbData.release_date,
              runtime: tmdbData.runtime,
              versionLanguage: tmdbData.original_language === 'it' ? 'ITA' : normalizeLanguageCode(tmdbData.original_language),
              subtitles: tmdbData.original_language === 'it' ? 'NESSUNO' : 'ITA',
              isManualOverride: false,
              isDraft: false
            } as any
          });
          console.log(`✅ [DB_SYNC] Dati completi salvati per ID: ${tmdbId} (Trailer: ${trailerUrl ? 'OK' : 'Mancante'}, Logo: ${tmdbData.logo_path ? 'OK' : 'Mancante'})`);
        }
      } catch (tmdbError) {
        console.error(`[SYNC] TMDb hydration failed for ID ${tmdbId}:`, tmdbError);
      }
    }
  }));

  // 4. Self-Cleaning (Mirroring)

  // A. Remove past/deleted projections from PretixSync
  const deleteProjections = await prisma.pretixSync.deleteMany({
    where: {
      NOT: {
        pretixId: { in: Array.from(currentPretixIds) }
      }
    }
  });
  console.log(`[SYNC] Cleaned up ${deleteProjections.count} past/deleted projections.`);

  // B. Remove MovieOverride if no projections left in PretixSync (and not manual override)
  const allOverrides = await (prisma.movieOverride as any).findMany({
    where: { isDraft: false }
  });

  let movieDeleteCount = 0;
  for (const override of allOverrides) {
    const projectionsCount = await prisma.pretixSync.count({
      where: { tmdbId: override.tmdbId }
    });

    if (projectionsCount === 0) {
      console.log(`[SYNC] Cleaning up unused movie metadata: ${override.tmdbId}`);
      await prisma.movieOverride.delete({
        where: { tmdbId: override.tmdbId }
      });
      movieDeleteCount++;
    }
  }

  // 5. FINAL PUSH: Enriched Metadata back to Pretix (for BookingFlow and other API consumers)
  if (!options.skipPush) {
    console.log(`[SYNC] 🚀 Pushing FINAL database metadata to Pretix sub-events...`);
    const { updateSubEvent } = await import('@/services/pretix');
    const allSyncedProjections = await prisma.pretixSync.findMany({ where: { active: true } });

    for (const proj of allSyncedProjections) {
      if (!proj.tmdbId) continue;

      const override = await prisma.movieOverride.findUnique({ where: { tmdbId: proj.tmdbId } }) as any;
      if (override) {
        try {
          const commentObj = {
            tmdbId: proj.tmdbId,
            rating: override.customRating || 'T',
            runtime: override.runtime || 120,
            versionLanguage: override.versionLanguage?.trim() || 'ITA',
            subtitles: override.subtitles?.trim() || 'NESSUNO',
            posterPath: override.customPosterPath || '',
            backdropPath: override.customBackdropPath || '',
            logoPath: override.customLogoPath || '',
            director: override.customDirector || '',
            cast: override.customCast || '',
          };

          const newComment = JSON.stringify(commentObj);
          
          // OPTIMIZATION: Only push if the comment in Pretix is different
          if (proj.comment === newComment) continue;

          await updateSubEvent(proj.pretixId, {
            comment: newComment,
            meta_data: {
              lingua: override.versionLanguage?.trim() || 'ITA',
              sottotitoli: override.subtitles?.trim() || 'NESSUNO'
            }
          });
        } catch (err) {
          console.error(`[SYNC] Failed to push metadata to Pretix for sub-event ${proj.pretixId}:`, err);
        }
      }
    }
  }

  const endTime = Date.now();
  console.log(`[SYNC] Complete in ${endTime - startTime}ms. Upserted: ${upsertCount}, Cleaned: ${deleteProjections.count}, Movies Deleted: ${movieDeleteCount}`);

  try {
    revalidatePath('/');
    revalidatePath('/admin/movies-control');
  } catch (err) {
    console.warn('[SYNC] revalidatePath skipped (likely running in standalone script):', (err as any).message);
  }

  return {
    success: true,
    upserted: upsertCount,
    projectionsCleaned: deleteProjections.count,
    moviesCleaned: movieDeleteCount,
    duration: endTime - startTime
  };
}

// Memory lock for throttling (Standard Tecnico)
const lastSyncBySubevent = new Map<number, number>();
const SYNC_THROTTLE_MS = 60000; // 60 seconds per subevent
const DB_STALENESS_MS = 60000; // 1 minute (Use DB if younger)

/**
 * Syncs ONLY a single sub-event availability.
 * SURGICAL SYNC: Only calls Pretix if data is stale or forced (after purchase).
 * Renamed to updateEventAvailability for consistency with granular quota logic.
 */
export async function updateEventAvailability(subeventId: number, force: boolean = false) {
  const now = Date.now();
  
  // 1. Throttle check (Memory)
  const lastSync = lastSyncBySubevent.get(subeventId) || 0;
  if (!force && (now - lastSync < SYNC_THROTTLE_MS)) {
    return; // Skip: too many requests for this ID
  }

  try {
    // 2. Staleness check (Database)
    const existing = await prisma.pretixSync.findUnique({
      where: { pretixId: subeventId },
      select: { updatedAt: true, isSoldOut: true }
    });

    if (!force && existing?.updatedAt) {
      const dbAge = now - new Date(existing.updatedAt).getTime();
      if (dbAge < DB_STALENESS_MS) {
        return; // Data is fresh enough in DB
      }
    }

    console.log(`[SYNC-SURGICAL] Updating subevent ${subeventId}...`);
    lastSyncBySubevent.set(subeventId, now);
    
    // 3. Fetch specific quota from Pretix
    const quotas = await listQuotas(subeventId);
    
    const interoQuota = quotas.find((q: any) => 
      (q.name && q.name.trim().toLowerCase().includes("quota intero")) ||
      (q.name && q.name.trim().toLowerCase().includes("posto unico")) ||
      (q.name && q.name.trim().toLowerCase().includes("intero")) ||
      (Array.isArray(q.items) && q.items.includes(ITEM_INTERO_ID)) ||
      (q.name && q.name.trim().toLowerCase() === "biglietti")
    );

    if (!interoQuota) return;

    const availableSeats = interoQuota.available_number;
    const isSoldOut = availableSeats !== null && availableSeats <= 0;

    // 4. Update database
    await prisma.pretixSync.update({
      where: { pretixId: subeventId },
      data: {
        isSoldOut,
        availableSeats,
        totalSeats: interoQuota.size,
        updatedAt: new Date()
      }
    });

    console.log(`[DB-UPDATE] ID: ${subeventId} | Avail: ${availableSeats} | SoldOut: ${isSoldOut}`);

    // Revalida sempre per aggiornare i badge granulari (es. se resta 1 posto)
    // Rimosso revalidatePath per evitare il refresh della home che chiude il drawer durante il checkout
    // try { revalidatePath('/'); } catch {}

  } catch (error) {
    console.error(`[SYNC-SURGICAL] Failed for ${subeventId}:`, error);
  }
}



/**
 * BACKGROUND SYNC: Updates future subevents surgically with throttling.
 * This ensures that even without a manual purchase, the Sold Out status is updated.
 */
export async function syncFutureSubeventsSurgically() {
  try {
    console.log('[SYNC-FUTURE] Starting surgical background sync for future events...');
    
    // 1. Get the list of future subevents
    const rawSubEvents = await listSubEvents(true);
    
    // 2. Iterate and sync each one
    // syncSingleSubevent already has a 60s/5min throttle internally, 
    // so this won't DDoS Pretix if called frequently.
    let count = 0;
    for (const se of rawSubEvents) {
      await updateEventAvailability(se.id);
      count++;
      
      // Polite delay: 50ms between requests to avoid burst spikes
      if (count % 5 === 0) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    
    console.log(`[SYNC-FUTURE] Finished surgical sync of ${count} future events.`);
  } catch (err) {
    console.error('[SYNC-FUTURE] Background sync failed:', err);
  }
}
