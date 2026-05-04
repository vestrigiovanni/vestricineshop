import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export interface MovieAward {
  type: string;
  label: string;
  details?: string | null;
  year?: number | null;
}

export interface MovieOverride {
  tmdbId: string;
  customTitle?: string | null;
  customDirector?: string | null;
  customCast?: string | null;
  customRating?: string | null;
  customPosterPath?: string | null;
  customBackdropPath?: string | null;
  customLogoPath?: string | null;
  customOverview?: string | null;
  manualSoldOut?: boolean;
  versionLanguage?: string | null;
  subtitles?: string | null;
  customRoomName?: string | null;
  customTrailerUrl?: string | null;
  customTrailerTitle?: string | null;
  customTrailerKeys?: string[];
  isManualOverride?: boolean;
  isDraft?: boolean;
  updatedAt?: Date;
  releaseDate?: string | null;
  runtime?: number | null;
  mubiId?: string | null;
  awards?: MovieAward[];
}


export async function isMovieSoldOut(subEventId: number, tmdbId: string | null): Promise<boolean> {
  // 1. Check manual override in DB
  if (tmdbId) {
    const override = await prisma.movieOverride.findUnique({
      where: { tmdbId },
      select: { manualSoldOut: true }
    });
    if (override?.manualSoldOut) return true;
  }

  // 2. Check Pretix status in PretixSync (updated during sync)
  const syncData = await prisma.pretixSync.findUnique({
    where: { pretixId: subEventId },
    select: { isSoldOut: true }
  });

  return syncData?.isSoldOut || false;
}

export async function getOverrides(): Promise<Record<string, MovieOverride>> {
  try {
    const overrides = await prisma.movieOverride.findMany({
      include: { awards: true }
    });
    const record: Record<string, MovieOverride> = {};
    for (const o of overrides) {
      record[o.tmdbId] = o as any;
    }
    return record;
  } catch (error) {
    console.error('Error reading overrides from DB:', error);
    return {};
  }
}

export async function getOverride(tmdbId: string): Promise<MovieOverride | null> {
  try {
    return await prisma.movieOverride.findUnique({
      where: { tmdbId },
      include: { awards: true }
    }) as any;
  } catch (e) {
    return null;
  }
}

export async function saveOverride(tmdbId: string, override: Partial<MovieOverride>): Promise<boolean> {
  try {
    const cleanOverride: any = {};
    const VALID_FIELDS = [
      'customTitle', 'customOverview', 'customRating', 'customPosterPath', 
      'customBackdropPath', 'customLogoPath', 'customTrailerUrl', 'customTrailerTitle', 'customTrailerKeys',
      'versionLanguage', 'subtitles', 'customRoomName', 'manualSoldOut',
      'isManualOverride', 'isDraft', 'customDirector', 'customCast',
      'releaseDate', 'runtime', 'mubiId'
    ];

    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined && VALID_FIELDS.includes(key)) {
        // Ensure director and cast are strings even if passed as arrays
        if ((key === 'customDirector' || key === 'customCast') && Array.isArray(value)) {
          cleanOverride[key] = value.join(', ');
        } else {
          cleanOverride[key] = value;
        }
      }
    }

    const awardData = override.awards;
    const updateData: any = { ...cleanOverride };

    // Only update awards if explicitly provided in the override payload
    if (awardData !== undefined) {
      updateData.awards = {
        deleteMany: {},
        create: awardData.map(a => ({
          type: a.type,
          label: a.label,
          details: a.details,
          year: a.year
        }))
      };
    }

    await prisma.movieOverride.upsert({
      where: { tmdbId },
      update: updateData,
      create: {
        tmdbId,
        ...cleanOverride,
        awards: {
          create: (awardData || []).map(a => ({
            type: a.type,
            label: a.label,
            details: a.details,
            year: a.year
          }))
        }
      }
    });

    return true;
  } catch (e: any) {
    console.error(`[DB Service] Error saving override for tmdbId=${tmdbId}:`, e);
    return false;
  }
}

/**
 * BIG BANG: Initial population of the database.
 */
export async function syncAllMoviesFromPretix() {
  const { listSubEvents } = await import('./pretix');
  const { getEnrichedMovieMetadata } = await import('./tmdb');
  
  console.log('🚀 [BIG BANG] Starting total synchronization...');
  
  try {
    const subEvents = await listSubEvents(false);
    const tmdbIds = new Set<string>();
    
    subEvents.forEach((se: any) => {
      if (se.comment) {
        try {
          const data = JSON.parse(se.comment);
          if (data.tmdbId) tmdbIds.add(data.tmdbId.toString());
        } catch {
          const match = se.comment.match(/TMDB_ID:(\d+)/);
          if (match) tmdbIds.add(match[1]);
        }
      }
    });

    let count = 0;
    for (const id of tmdbIds) {
      const existing = await prisma.movieOverride.findUnique({ where: { tmdbId: id } });
      
      if (!existing) {
        const metadata = await getEnrichedMovieMetadata(id);
        if (metadata) {
          await prisma.movieOverride.create({
            data: {
              tmdbId: id,
              customTitle: metadata.title,
              customOverview: metadata.overview,
              customPosterPath: metadata.poster_path || '',
              customBackdropPath: metadata.backdrop_path || '',
              customLogoPath: metadata.logo_path || '',
              customRating: metadata.rating || 'T',
              customDirector: Array.isArray(metadata.director) ? metadata.director.join(', ') : (metadata.director || ''),
              customCast: Array.isArray(metadata.cast) ? metadata.cast.join(', ') : (metadata.cast || ''),
              isManualOverride: false,
              isDraft: false
            }
          });
          count++;
        }
      }
    }

    revalidatePath('/');
    return { success: true, added: count };
  } catch (error) {
    console.error('[BIG BANG] Error during sync:', error);
    throw error;
  }
}

// Memory caching
const cacheMap = new Map<string, { data: any, timestamp: number }>();

export function getShortTermCache(key: string, ttlSeconds: number = 60): any | null {
  const entry = cacheMap.get(key);
  if (entry && (Date.now() - entry.timestamp < ttlSeconds * 1000)) {
    return entry.data;
  }
  return null;
}

export function setShortTermCache(key: string, data: any) {
  cacheMap.set(key, { data, timestamp: Date.now() });
}

export function getCachedTMDB(key: string): any | null {
  return getShortTermCache(`tmdb_${key}`, 24 * 60 * 60);
}

export function setCachedTMDB(key: string, data: any) {
  setShortTermCache(`tmdb_${key}`, data);
}

export function getMovieMetadata(tmdbId: string): any | null {
  return getShortTermCache(`metadata_${tmdbId}`, 24 * 60 * 60);
}

export function saveMovieMetadata(tmdbId: string, metadata: any) {
  setShortTermCache(`metadata_${tmdbId}`, metadata);
}

export function deleteMovieMetadata(tmdbId: string) {
  cacheMap.delete(`metadata_${tmdbId}`);
  cacheMap.delete(`tmdb_movie_details_${tmdbId}`);
  cacheMap.delete(`tmdb_movie_details_${tmdbId}_smart_v4`);
  cacheMap.delete(`tmdb_movie_details_${tmdbId}_smart_multi_v4`);
}
