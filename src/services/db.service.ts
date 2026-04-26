

export interface MovieOverride {
  tmdbId: string;
  customTitle?: string;
  customDirector?: string[];
  customCast?: string[];
  customRating?: string;
  customPosterPath?: string;
  customBackdropPath?: string;
  customOverview?: string;
  manualSoldOut?: boolean;
  versionLanguage?: string; // e.g., "Lingua Originale"
  subtitles?: string;      // e.g., "Sub ITA"
  customRoomName?: string;
  customTrailerUrl?: string;
}

export function getOverrides(): Record<string, MovieOverride> {
  try {
    if (typeof window !== 'undefined') return {}; // Non-browser environment only
    const fs = require('fs');
    const path = require('path');
    const DB_PATH = path.join(process.cwd(), 'data', 'overrides.json');
    if (!fs.existsSync(DB_PATH)) {
      return {};
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading overrides DB:', error);
    return {};
  }
}

export function getOverride(tmdbId: string): MovieOverride | null {
  const overrides = getOverrides();
  return overrides[tmdbId] || null;
}

export function saveOverride(tmdbId: string, override: Partial<MovieOverride>) {
  try {
    if (typeof window !== 'undefined') return;
    const fs = require('fs');
    const path = require('path');
    const DB_PATH = path.join(process.cwd(), 'data', 'overrides.json');
    const overrides = getOverrides();
    overrides[tmdbId] = {
      ...(overrides[tmdbId] || {}),
      ...override,
      tmdbId,
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(overrides, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving override:', e);
  }
}

// Simple File-Based Cache for TMDB data
export function getCachedTMDB(key: string): any | null {
  try {
    if (typeof window !== 'undefined') return null;
    const fs = require('fs');
    const path = require('path');
    const CACHE_PATH = path.join(process.cwd(), 'data', 'tmdb_cache.json');
    if (!fs.existsSync(CACHE_PATH)) return null;
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    const entry = cache[key];
    if (entry && (Date.now() - entry.timestamp < 24 * 60 * 60 * 1000)) { // 24 hours
      return entry.data;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export function setCachedTMDB(key: string, data: any) {
  try {
    if (typeof window !== 'undefined') return;
    const fs = require('fs');
    const path = require('path');
    const CACHE_PATH = path.join(process.cwd(), 'data', 'tmdb_cache.json');
    let cache: any = {};
    if (fs.existsSync(CACHE_PATH)) {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
    cache[key] = {
      data,
      timestamp: Date.now()
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing TMDB cache:', e);
  }
}

// Enriched Movie Metadata Cache (Unified)
const METADATA_PATH = require('path').join(process.cwd(), 'data', 'movie_metadata.json');

export function getMovieMetadata(tmdbId: string): any | null {
  try {
    if (typeof window !== 'undefined') return null;
    const fs = require('fs');
    if (!fs.existsSync(METADATA_PATH)) return null;
    const cache = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    const entry = cache[tmdbId];
    if (entry && (Date.now() - (entry._cachedAt || 0) < 24 * 60 * 60 * 1000)) {
      return entry;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export function saveMovieMetadata(tmdbId: string, metadata: any) {
  try {
    if (typeof window !== 'undefined') return;
    const fs = require('fs');
    let cache: any = {};
    if (fs.existsSync(METADATA_PATH)) {
      cache = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    }
    cache[tmdbId] = {
      ...metadata,
      _cachedAt: Date.now()
    };
    fs.writeFileSync(METADATA_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving movie metadata:', e);
  }
}

export function deleteMovieMetadata(tmdbId: string) {
  try {
    if (typeof window !== 'undefined') return;
    const fs = require('fs');
    if (!fs.existsSync(METADATA_PATH)) return;
    const cache = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    if (cache[tmdbId]) {
      delete cache[tmdbId];
      fs.writeFileSync(METADATA_PATH, JSON.stringify(cache, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('Error deleting movie metadata:', e);
  }
}

// --- Short-term Cache (Pretix Availability, etc.) ---
const SHORT_TERM_CACHE_PATH = require('path').join(process.cwd(), 'data', 'short_term_cache.json');

export function getShortTermCache(key: string, ttlSeconds: number = 60): any | null {
  try {
    if (typeof window !== 'undefined') return null;
    const fs = require('fs');
    if (!fs.existsSync(SHORT_TERM_CACHE_PATH)) return null;
    const cache = JSON.parse(fs.readFileSync(SHORT_TERM_CACHE_PATH, 'utf8'));
    const entry = cache[key];
    if (entry && (Date.now() - entry.timestamp < ttlSeconds * 1000)) {
      return entry.data;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export function setShortTermCache(key: string, data: any) {
  try {
    if (typeof window !== 'undefined') return;
    const fs = require('fs');
    let cache: any = {};
    if (fs.existsSync(SHORT_TERM_CACHE_PATH)) {
      cache = JSON.parse(fs.readFileSync(SHORT_TERM_CACHE_PATH, 'utf8'));
    }
    cache[key] = {
      data,
      timestamp: Date.now()
    };
    fs.writeFileSync(SHORT_TERM_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing short-term cache:', e);
  }
}
