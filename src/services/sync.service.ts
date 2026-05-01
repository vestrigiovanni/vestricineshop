import prisma from '@/lib/prisma';
import { listSubEvents, getSeatingPlansMap, listQuotas } from '@/services/pretix';
import { getEnrichedMovieMetadata } from '@/services/tmdb';
import { ITEM_INTERO_ID, ITEM_VIP_ID } from '@/constants/pretix';
import { revalidatePath } from 'next/cache';
import { MovieOverride } from './db.service';
import { normalizeLanguageCode } from '@/constants/languages';


export async function syncPretixToDatabase(options: { forceMetadataRefresh?: boolean } = {}) {
  console.log('[SYNC] Starting Pretix -> Database synchronization...');
  const startTime = Date.now();

  // 1. Fetch all future sub-events, seating plans, and global quotas for availability
  const [rawSubEvents, roomsMap, allQuotas] = await Promise.all([
    listSubEvents(true), // true = only future events
    getSeatingPlansMap(),
    listQuotas(), // Fetches all quotas with availability
  ]);

  // Group quotas by sub-event for efficient lookup
  const quotasBySubevent = new Map<number, any[]>();
  allQuotas.forEach((q: any) => {
    if (q.subevent) {
      if (!quotasBySubevent.has(q.subevent)) {
        quotasBySubevent.set(q.subevent, []);
      }
      quotasBySubevent.get(q.subevent)!.push(q);
    }
  });

  let upsertCount = 0;
  const currentPretixIds = new Set<number>();
  const currentTmdbIds = new Set<string>();

  // 2. Process each sub-event and sync to PretixSync table
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

    // Calculate availability based on Pretix data
    const seQuotas = quotasBySubevent.get(se.id) || [];
    const relevantQuotas = seQuotas.filter((q: any) =>
      Array.isArray(q.items) && (q.items.includes(ITEM_INTERO_ID) || q.items.includes(ITEM_VIP_ID))
    );

    let isPretixSoldOut = se.best_availability_state === 'sold_out' || (se.active && se.presale_is_running === false);
    let totalQuotaAvailable = null;
    let totalQuotaSize = null;

    if (relevantQuotas.length > 0) {
      totalQuotaAvailable = relevantQuotas.reduce((sum: number, q: any) => {
        return sum + (q.available_number !== null ? Math.max(0, q.available_number) : 0);
      }, 0);
      totalQuotaSize = relevantQuotas.reduce((sum: number, q: any) => {
        return sum + (q.size !== null ? Math.max(0, q.size) : 0);
      }, 0);
      const allQuotasUnavailable = relevantQuotas.every((q: any) => q.available === false);
      if (!isPretixSoldOut && (allQuotasUnavailable || totalQuotaAvailable <= 0)) {
        isPretixSoldOut = true;
      }
    }

    const roomName = se.seating_plan ? (roomsMap[se.seating_plan] || 'Sala') : 'Sala';

    await prisma.pretixSync.upsert({
      where: { pretixId: se.id },
      update: {
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
      } as any,
      create: {
        pretixId: se.id,
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
      } as any,
    });
    upsertCount++;
  }

  // 3. Auto-Hydrate MovieOverride table (Auto-Fill of NULLs or Force Refresh)
  const uniqueIds = Array.from(currentTmdbIds);
  console.log(`[SYNC] Processing ${uniqueIds.length} unique movies for metadata.`);

  await Promise.all(uniqueIds.map(async (tmdbId) => {
    const existingMovie = await prisma.movieOverride.findUnique({
      where: { tmdbId }
    }) as MovieOverride | null;

    // Se l'utente forza il refresh, o se il record non esiste, o se ha campi critici a NULL, interroga TMDb
    const needsHydration = options.forceMetadataRefresh ||
      !existingMovie ||
      !existingMovie.customTitle ||
      !existingMovie.customPosterPath ||
      !existingMovie.customBackdropPath ||
      !existingMovie.customDirector ||
      !existingMovie.customLogoPath ||
      !existingMovie.customTrailerUrl ||
      existingMovie.releaseDate === null ||
      existingMovie.runtime === null ||
      existingMovie.versionLanguage === 'Italiano' ||
      existingMovie.versionLanguage === 'Lingua Originale' ||
      existingMovie.subtitles === 'Nessuno' ||
      existingMovie.subtitles === 'Sottotitoli IT';


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

        await updateSubEvent(proj.pretixId, {
          comment: JSON.stringify(commentObj),
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

  const endTime = Date.now();
  console.log(`[SYNC] Complete in ${endTime - startTime}ms. Upserted: ${upsertCount}, Cleaned: ${deleteProjections.count}, Movies Deleted: ${movieDeleteCount}`);

  revalidatePath('/');
  revalidatePath('/admin/movies-control');

  return {
    success: true,
    upserted: upsertCount,
    projectionsCleaned: deleteProjections.count,
    moviesCleaned: movieDeleteCount,
    duration: endTime - startTime
  };
}
