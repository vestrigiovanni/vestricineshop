

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
