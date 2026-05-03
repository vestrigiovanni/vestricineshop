import { normalizeRating } from '@/utils/ratingUtils';
const TMDB_API_KEY = '00ea09c7fb5bf89b064f6001a2de3122';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

import { MovieItem, isNonLatin } from './tmdb.utils';
import { fetchMubiAwards } from './mubi';
export * from './tmdb.utils';

export interface MovieDetails extends MovieItem {
  runtime: number;
  imdb_id: string | null;
  tagline?: string;
  genres: { id: number; name: string }[];
  release_dates?: {
    results: {
      iso_3166_1: string;
      release_dates: { certification: string; type: number }[];
    }[];
  };
  credits?: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
    crew: { id: number; name: string; job: string; department: string }[];
  };
  images?: {
    logos: { file_path: string; iso_639_1: string | null }[];
    backdrops?: { file_path: string; iso_639_1: string | null; width: number; vote_average: number; vote_count: number }[];
  };
  videos?: {
    results: any[];
  };
}

/**
 * Searches for movies on TMDB based on a text query.
 * If query is empty, it returns popular movies.
 */
export async function searchMovies(query: string = '', enrich: boolean = true): Promise<MovieItem[]> {
  try {
    const { getCachedTMDB, setCachedTMDB } = await import('./db.service');
    const cacheKey = `search_${query || 'now_playing'}_${enrich ? 'en' : 'std'}`;
    const cached = getCachedTMDB(cacheKey);
    if (cached) return cached;

    const endpoint = query 
      ? `/search/movie?query=${encodeURIComponent(query)}&language=it-IT&page=1`
      : `/movie/now_playing?language=it-IT&page=1`; // Use now_playing for cinema feel instead of popular
      
    const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}t=${Date.now()}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'accept': 'application/json'
      },
      cache: 'no-store'
    });

    let data;
    if (!response.ok) {
      const retryUrl = url.includes('?') 
        ? `${url}&api_key=${TMDB_API_KEY}` 
        : `${url}?api_key=${TMDB_API_KEY}`;
        
      const responseRetry = await fetch(retryUrl, {
        headers: { 'accept': 'application/json' },
        cache: 'no-store'
      });
      
      if (!responseRetry.ok) throw new Error('Failed to fetch from TMDB');
      data = await responseRetry.json();
    } else {
      data = await response.json();
    }

    const results: MovieItem[] = (data.results || []).filter((m: MovieItem) => !isNonLatin(m.title));
    
    if (!enrich) {
      setCachedTMDB(cacheKey, results);
      return results;
    }

    // Enrich the first 5 results with ratings and basic info
    const enrichedResults = await Promise.all(
      results.slice(0, 5).map(async (movie) => {
        try {
          const enriched = await getEnrichedMovieMetadata(String(movie.id));
          if (enriched) {
            return {
              ...movie,
              overview: enriched.overview || movie.overview,
              rating: enriched.rating
            };
          }
          return movie;
        } catch {
          return movie;
        }
      })
    );

    const finalResults = [...enrichedResults, ...results.slice(5)];
    setCachedTMDB(cacheKey, finalResults);
    return finalResults;
  } catch (error) {
    console.error('Error fetching movies from TMDB:', error);
    return [];
  }
}

/**
 * Gets rich metadata for a specific movie by its TMDB ID.
 */
export async function getMovieDetails(id: string): Promise<MovieDetails | null> {
  try {
    const { getCachedTMDB, setCachedTMDB } = await import('./db.service');
    const cacheKey = `movie_details_${id}`;
    const cached = getCachedTMDB(cacheKey);
    if (cached) return cached;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[TMDB DEBUG] Recupero dettagli per ID: ${id}`);
    }
    const url = `${TMDB_BASE_URL}/movie/${id}?language=it-IT&append_to_response=credits,images,release_dates&include_image_language=it,en,null&api_key=${TMDB_API_KEY}&t=${Date.now()}`;
    
    const response = await fetch(url, {
      headers: { 'accept': 'application/json' },
      cache: 'no-store'
    });
    
    if (!response.ok) return null;
    const details = await response.json();
    
    // Standard Tecnico: Latinizzazione Obbligatoria
    if (isNonLatin(details.title)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[TMDB DEBUG] Titolo non latino rilevato per ID ${id} ("${details.title}"), scarto e cerco fallback...`);
      }
      
      // Fallback 1: Versione Inglese
      const enUrl = `${TMDB_BASE_URL}/movie/${id}?language=en-US&api_key=${TMDB_API_KEY}`;
      try {
        const enResponse = await fetch(enUrl, { headers: { 'accept': 'application/json' }, cache: 'no-store' });
        if (enResponse.ok) {
          const enData = await enResponse.json();
          if (enData.title && !isNonLatin(enData.title)) {
            details.title = enData.title;
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[TMDB DEBUG] Titolo inglese recuperato come fallback: ${details.title}`);
            }
          } else {
             // Se anche l'inglese è non latino (raro), usiamo il titolo italiano originale se è latino, 
             // altrimenti scartiamo o mettiamo placeholder
             if (process.env.NODE_ENV !== 'production') {
               console.warn(`[TMDB WARNING] Fallback inglese non valido per ${id}, il film potrebbe avere problemi di visualizzazione.`);
             }
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(`[TMDB ERROR] Latinization fallback fallito per ${id}:`, e);
        }
      }
    }
    
    // FALLBACK: Se la trama in italiano manca, proviamo a recuperare quella in inglese
    if (!details.overview || details.overview.trim() === '') {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[TMDB DEBUG] Trama italiana mancante per ID ${id}, recupero versione inglese...`);
      }
      const enUrl = `${TMDB_BASE_URL}/movie/${id}?language=en-US&api_key=${TMDB_API_KEY}`;
      try {
        const enResponse = await fetch(enUrl, {
          headers: { 'accept': 'application/json' },
          cache: 'no-store'
        });
        if (enResponse.ok) {
          const enData = await enResponse.json();
          if (enData.overview) {
            details.overview = enData.overview;
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[TMDB DEBUG] Trama inglese recuperata per ID ${id}`);
            }
          }
          if (!details.tagline && enData.tagline) {
            details.tagline = enData.tagline;
          }
        }
      } catch (e) {
        console.error(`[TMDB ERROR] Fallback inglese fallito per ${id}:`, e);
      }
    }

    // Recupero video separato senza filtro lingua per ottenere TUTTE le versioni (identifica l'originale con precisione)
    const videoUrl = `${TMDB_BASE_URL}/movie/${id}/videos?api_key=${TMDB_API_KEY}`;
    try {
      const videoResponse = await fetch(videoUrl, {
        headers: { 'accept': 'application/json' },
        cache: 'no-store'
      });
      if (videoResponse.ok) {
        details.videos = await videoResponse.json();
      }
    } catch (e) {
      console.error(`[TMDB ERROR] Impossibile recuperare i video per ${id}:`, e);
    }

    setCachedTMDB(cacheKey, details);
    return details;
  } catch (error) {
    console.error(`Error fetching details for movie ${id}:`, error);
    return null;
  }
}

/**
 * Extracts all directors' names from the movie details crew.
 */
export function getDirectors(details: MovieDetails): string[] {
  const directors = details.credits?.crew.filter(person => person.job === 'Director');
  return directors ? directors.map(d => d.name) : [];
}

/**
 * Extracts the primary director's name (compatibility helper).
 */
export function getDirector(details: MovieDetails): string {
  const directors = getDirectors(details);
  return directors.length > 0 ? directors[0] : 'Sconosciuto';
}

/**
 * Extracts the main cast members (top 5-6) from the movie details.
 */
export function getCast(details: any, limit: number = 5): string[] {
  const credits = details?.credits;
  if (!credits) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[TMDB WARNING] Nessun credito trovato per il film: ${details?.title}`);
    }
    return [];
  }
  
  const cast = credits.cast;
  if (!cast || !Array.isArray(cast) || cast.length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[TMDB WARNING] Cast non trovato o vuoto per il film: ${details?.title}`);
    }
    return [];
  }

  return cast
    .slice(0, limit)
    .map((person: any) => person.name);
}

// Simple in-memory cache for trailer keys to avoid redundant TMDb calls
const trailerCache = new Map<string, string | null>();
const trailersCache = new Map<string, string[]>();

/**
 * Smart Fetch: Extracts the best trailer key (YouTube) following strict priority:
 * 1. IT Official Trailer
 * 2. IT Trailer
 * 3. EN Official Trailer
 * 4. Teaser (IT then EN)
 */
export async function getMovieTrailer(id: string): Promise<string | null> {
  const cacheKey = `${id}_smart_v3`;
  if (trailerCache.has(cacheKey)) return trailerCache.get(cacheKey)!;

  const trailers = await getMovieTrailers(id);
  const result = trailers.length > 0 ? trailers[0] : null;
  trailerCache.set(cacheKey, result);
  return result;
}

/**
 * Smart Multi-Fetch: Returns up to 5 prioritized trailer keys.
 */
export async function getMovieTrailers(id: string): Promise<string[]> {
  const cacheKey = `${id}_smart_multi_v3`;
  if (trailersCache.has(cacheKey)) return trailersCache.get(cacheKey)!;

  try {
    const multiLang = await getMultiLangVideos(id);
    const allVideos = [...multiLang.it, ...multiLang.en];

    // Score and Sort by priority
    const scored = allVideos.map(v => {
      let score = 0;
      // Priority 1: Type (Trailer > Teaser)
      if (v.type === 'Trailer') score += 1000;
      else if (v.type === 'Teaser') score += 500;

      // Priority 2: Official
      if (v.official) score += 300;

      // Priority 3: Language (IT > EN)
      if (v.iso_639_1 === 'it') score += 100;

      return { ...v, score };
    }).sort((a, b) => b.score - a.score);

    const result = Array.from(new Set(scored.map(v => v.key))).slice(0, 5);
    trailersCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`[TMDB ERROR] Smart fetch failed for ${id}:`, error);
    return [];
  }
}

/**
 * Finds the best available movie logo from TMDB images.
 * Prioritizes Italian ('it'), then English ('en'), then neutral (null).
 */
export function getMovieLogo(details: MovieDetails): string | null {
  if (!details.images?.logos || details.images.logos.length === 0) return null;
  
  const logos = details.images.logos;
  const itLogo = logos.find(l => l.iso_639_1 === 'it');
  if (itLogo) return itLogo.file_path;
  
  const enLogo = logos.find(l => l.iso_639_1 === 'en');
  if (enLogo) return enLogo.file_path;
  
  return logos[0].file_path;
}

/**
 * Fetches all images (posters and backdrops) for a movie from TMDB.
 */
export async function getMovieImages(id: string): Promise<{ posters: any[], backdrops: any[] }> {
  try {
    const url = `${TMDB_BASE_URL}/movie/${id}/images?api_key=${TMDB_API_KEY}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return { posters: [], backdrops: [] };
    const data = await response.json();
    return {
      posters: data.posters || [],
      backdrops: data.backdrops || []
    };
  } catch (error) {
    console.error(`Error fetching images for movie ${id}:`, error);
    return { posters: [], backdrops: [] };
  }
}


/**
 * Helper to map international ratings to the Italian standard (T, 6+, 14+, 18+).
 * Mapping based on strict provided cross-country tables.
 */
function mapForeignToItalianRating(country: string, cert: string): string {
  const c = cert.toUpperCase().replace(/[\s\.\-]/g, '');
  if (!c) return '';

  if (country === 'US') {
    if (c === 'G') return 'T';
    if (c === 'PG') return '6+';
    if (c === 'PG13') return '14+';
    if (c === 'R') return '14+'; // Fix: R-Rated US maps to 14+ in Italy
    if (c === 'NC17' || c === 'X') return '18+';
  }
  
  if (country === 'GB') {
    if (c === 'U') return 'T';
    if (c === 'PG') return '6+';
    if (c === '12' || c === '12A') return '10+';
    if (c === '15') return '14+';
    if (c === '18') return '18+';
  }
  
  if (country === 'FR') {
    if (c === 'U') return 'T';
    if (c === '12' || c === '10') return '10+';
    if (c === '16' || c === '18') return '18+';
  }

  // Use general normalization for anything else
  return normalizeRating(c);
}

/**
 * Universal Censorship Translator (Smart Fallback).
 * 1. Checks IT (Theatrical priority).
 * 2. Falls back through priority list: US -> GB -> DE -> FR.
 * 3. Maps foreign codes to Italian levels (T, 6+, 14+, 18+).
 * 4. Logs fallback usage for diagnostics.
 */
/**
 * Implementation of the "Cascading" logic for ratings:
 * 1. Italy (IT) - Priority Absolute.
 * 2. Global Red Flags - Security Scanner (18+, 16+, etc. in any country).
 * 3. USA (US) - Fallback 1.
 * 4. Great Britain (GB) or France (FR) - Fallback 2.
 * 5. Genre-based security (Horror/Thriller cannot be T).
 * 6. Normalization and Default.
 */

function getEuropeanConsensus(results: any[]): string | null {
  const targetCountries = ['AT', 'DE', 'CH', 'GB'];
  for (const countryCode of targetCountries) {
    const data = results.find(r => r.iso_3166_1 === countryCode);
    if (data && data.release_dates.length > 0) {
      const cert = data.release_dates[0].certification.toUpperCase().replace(/[\s\.\-+]/g, '');
      if (!cert) continue;

      // Regola Marty Supreme: Se trovi 12, 14 o 15 in paesi core Europei -> 14+
      if (['12', '14', '15'].includes(cert)) return '14+';
      
      // Se trovi 6 o 9 -> 10+
      if (['6', '9'].includes(cert)) return '10+';
    }
  }
  return null;
}

function scanGlobalRedFlags(results: any[]): string | null {
  for (const r of results) {
    for (const rd of r.release_dates) {
      const cert = rd.certification.toUpperCase().replace(/[\s\.\-+]/g, '');
      if (!cert) continue;

      // Extreme ratings (18, 19, 21, III, C)
      if (['18', '19', '21', 'III', 'C', 'NC17', 'X'].includes(cert)) return '18+';
      
      // High-rigour ratings (16, 15) -> Map to 18+ for security on unrated titles
      // Ma solo se non abbiamo trovato un consenso europeo più morbido prima.
      if (['16', '15'].includes(cert)) return '18+';
    }
  }
  return null;
}

export function getItalianRating(details: MovieDetails): string {
  const results = details.release_dates?.results;
  if (!results) {
    console.warn(`[WARN] Nessun rating trovato per ${details.title}, impostato T di default`);
    return 'T';
  }

  // 1. Priorità Assoluta: ITALIA (IT)
  const itData = results.find(r => r.iso_3166_1 === 'IT');
  if (itData && itData.release_dates.length > 0) {
    // Privilegiamo release di type: 3 (Cinema)
    const theatrical = itData.release_dates.find(rd => rd.type === 3);
    const cert = theatrical ? theatrical.certification : itData.release_dates[0].certification;
    
    if (cert && cert.trim() !== '') {
      return normalizeRating(cert);
    }
  }

  // 2. Priorità "Vicini di Casa" (Consenso Europeo Core: AT, DE, CH, GB)
  // Se l'Italia manca, ascoltiamo i vicini europei prima degli americani.
  const europeanConsensus = getEuropeanConsensus(results);
  if (europeanConsensus) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Rating System] 🇪🇺 EUROPEAN CONSENSUS per "${details.title}": ${europeanConsensus}`);
    }
    return europeanConsensus;
  }

  // 3. Global Security Scanner (Red Flags)
  // Se l'Europa core manca, cerchiamo se nel resto del mondo il film è considerato estremo.
  const globalRedFlag = scanGlobalRedFlags(results);
  if (globalRedFlag) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Rating System] 🚨 GLOBAL RED FLAG rilevata per "${details.title}": ${globalRedFlag}`);
    }
    return globalRedFlag;
  }

  // 3. Fallback 1: Stati Uniti (US)
  const usData = results.find(r => r.iso_3166_1 === 'US');
  if (usData && usData.release_dates.length > 0) {
    const cert = usData.release_dates[0].certification;
    if (cert && cert.trim() !== '') {
      return mapForeignToItalianRating('US', cert);
    }
  }

  // 3. Fallback 2: Gran Bretagna (GB) o Francia (FR)
  const gbData = results.find(r => r.iso_3166_1 === 'GB');
  if (gbData && gbData.release_dates.length > 0) {
    const cert = gbData.release_dates[0].certification;
    if (cert && cert.trim() !== '') {
      return mapForeignToItalianRating('GB', cert);
    }
  }

  const frData = results.find(r => r.iso_3166_1 === 'FR');
  if (frData && frData.release_dates.length > 0) {
    const cert = frData.release_dates[0].certification;
    if (cert && cert.trim() !== '') {
      return mapForeignToItalianRating('FR', cert);
    }
  }

  // 5. Validazione finale e Protezione per Genere (Horror/Thriller)
  const isDarkGenre = details.genres?.some(g => 
    g.name.toLowerCase().includes('horror') || 
    g.name.toLowerCase().includes('thriller')
  );

  if (isDarkGenre) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Rating System] 🛡️ Protezione Genere attivata per "${details.title}": Default 14+`);
    }
    return '14+';
  }

  console.warn(`[WARN] Nessun rating trovato per ${details.title}, impostato T di default`);
  return 'T';
}

/**
 * Mappa i rating US (OMDb) secondo le regole italiane fornite.
 */
/**
 * Maps US ratings (from OMDb) to Italian standards using the normalization engine.
 */
function translateUSRating(omdbRated: string): string {
  const r = omdbRated.toUpperCase().trim();
  if (r === 'N/A' || !r) return 'T';
  
  // The normalization engine handles G, PG, PG-13, R, NC-17, TV-MA, etc.
  return normalizeRating(r);
}

/**
 * Funzione di utilità per confrontare la restrizione dei rating.
 * Restituisce true se 'newRating' è più restrittivo di 'currentRating'.
 */
function isMoreRestrictive(current: string, next: string): boolean {
  const levels: Record<string, number> = { 'T': 0, '6+': 1, '14+': 2, '18+': 3 };
  const currentLevel = levels[current] || 0;
  const nextLevel = levels[next] || 0;
  return nextLevel > currentLevel;
}

/**
 * Recupera il rating da OMDb usando l'IMDb ID.
 */
export async function getOMDbRating(imdbId: string): Promise<string | null> {
  const OMDB_API_KEY = '962dd713';
  try {
    const url = `http://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.Rated || null;
  } catch (error) {
    console.error(`[OMDb ERROR] Impossibile recuperare rating per ${imdbId}:`, error);
    return null;
  }
}

/**
 * Override manuali per titoli specifici (Correzioni legali/ufficiali IT)
 */
const MANUAL_RATING_OVERRIDES: Record<string, string> = {
  "As bestas - La terra della discordia": "14+",
  "As bestas": "14+",
  "Ennio": "T",
  "Perfect Days": "T"
};

/**
 * ENHANCED RATING: Implementa la logica di precedenza TMDb/OMDb.
 * Applica la regola della "Massima Restrizione" con override manuali e filtri per documentari.
 */
export async function getEnhancedRating(details: MovieDetails): Promise<string> {
  const title = details.title;
  const imdbId = details.imdb_id;
  const results = details.release_dates?.results || [];

  // 1. Check Override Manuali (Priorità Assoluta)
  if (MANUAL_RATING_OVERRIDES[title]) {
    const val = MANUAL_RATING_OVERRIDES[title];
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Rating System] Film: ${title} | Fonte: OVERRIDE MANUALE | Rating finale: ${val}`);
    }
    return val;
  }

  // 2. Priorità "Italia First" (TMDb)
  const itData = results.find(r => r.iso_3166_1 === 'IT');
  if (itData && itData.release_dates.length > 0) {
    const theatrical = itData.release_dates.find(rd => rd.type === 3);
    const cert = (theatrical ? theatrical.certification : itData.release_dates[0].certification)?.trim();
    
    if (cert) {
      const normalized = normalizeRating(cert);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Rating System] Film: ${title} | Fonte: TMDb ITALIA | Rating finale: ${normalized}`);
      }
      return normalized;
    }
  }

  // 3. Fallback: TMDb Internazionale (Cascata pre-definita)
  let currentRating = getItalianRating(details);
  let fonteUsata = "TMDb FALLBACK (US/GB/FR)";

  // 4. Logica Speciale Documentari
  const isDocumentary = details.genres?.some(g => g.id === 99 || g.name.toLowerCase().includes('documentario') || g.name.toLowerCase().includes('documentary'));
  if (isDocumentary && currentRating !== '18+') {
    currentRating = 'T';
    fonteUsata += " + DOC FILTER";
  }

  // 5. Sincronizzazione con OMDb (Fonte di Verità Internazionale - Solo se IT è mancante)
  if (imdbId) {
    const omdbRated = await getOMDbRating(imdbId);
    
    if (omdbRated && omdbRated !== 'N/A') {
      const mappedRating = translateUSRating(omdbRated);
      
      if (isDocumentary && mappedRating !== '18+') {
        // Skip intermediate OMDb ratings for documentaries
      } else if (isMoreRestrictive(currentRating, mappedRating)) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[OMDb Sync] Film: ${title} | Rating US: ${omdbRated} -> Convertito in IT: ${mappedRating} (Sostituito TMDb '${currentRating}')`);
        }
        currentRating = mappedRating;
        fonteUsata = `OMDb (IMDb: ${omdbRated})`;
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n==================================================`);
    console.log(`🎬 [RATING SYSTEM] Film: ${title}`);
    console.log(`📊 Fonte: ${fonteUsata}`);
    console.log(`✅ Rating finale: ${currentRating}`);
    console.log(`==================================================\n`);
  }
  return currentRating;
}

/**
 * Unified function to get fully enriched movie metadata.
 * Uses a persistent cache to avoid repeated heavy API calls.
 */
export async function getEnrichedMovieMetadata(tmdbId: string): Promise<any> {
  const { getMovieMetadata, saveMovieMetadata } = await import('./db.service');
  // 1. Try to get from persistent cache
  const cached = getMovieMetadata(tmdbId);
  if (cached) {
    return cached;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[METADATA SYNC] 🚀 Syncing full metadata for TMDB ID: ${tmdbId}`);
  }

  try {
    // 2. Fetch basic details (this uses its own internal cache for the raw response)
    const details = await getMovieDetails(tmdbId);
    if (!details) return null;

    // 3. Process all heavy metadata in parallel
  const [rating, trailerKeys, multiLangVideos, mubiData] = await Promise.all([
    getEnhancedRating(details),
    getMovieTrailers(tmdbId),
    getMultiLangVideos(tmdbId),
    fetchMubiAwards(tmdbId, details.title, details.original_title, details.release_date?.split('-')[0])
  ]);

  const directors = getDirectors(details);
  const cast = getCast(details, 5);
  const logo_path = getMovieLogo(details);
  const trailerKey = trailerKeys[0] || null;

  // 4. Advanced Backdrop Logic (HD filtering, deterministic selection)
  let backdrop_path = details.backdrop_path;
  if (details.images?.backdrops && details.images.backdrops.length > 0) {
    const allBackdrops = details.images.backdrops;
    const noLangBackdrops = allBackdrops.filter((b: any) => !b.iso_639_1);
    const highQualityPool = (noLangBackdrops.length > 0 ? noLangBackdrops : allBackdrops)
      .filter((b: any) => b.width >= 1920)
      .sort((a: any, b: any) => (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0));

    const finalPool = highQualityPool.length > 0 ? highQualityPool : (noLangBackdrops.length > 0 ? noLangBackdrops : allBackdrops);
    const backdropIndex = Number(tmdbId) % finalPool.length;
    backdrop_path = finalPool[backdropIndex].file_path;
  }

  // 5. Construct the final object
    const result = {
      tmdbId,
      title: details.title,
      original_title: details.original_title,
      overview: details.overview,
      poster_path: details.poster_path,
      backdrop_path,
      logo_path,
      rating,
      release_date: details.release_date,
      runtime: details.runtime,
      director: directors,
      cast,
      trailerUrl: trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : null,
      multiLangVideos,
      awards: mubiData?.awards || [],
      mubiId: mubiData?.mubiId || null,
      syncedAt: new Date().toISOString()
    };

  // 6. Save to persistent cache
  saveMovieMetadata(tmdbId, result);

    return result;
  } catch (error) {
    console.error(`[METADATA SYNC] ❌ FAILED for tmdbId=${tmdbId}:`, error);
    // Don't throw, just return null to allow the rest of the application to function
    return null;
  }
}

export async function getMultiLangVideos(id: string) {
  const languages = ['it-IT', 'en-US', 'null'];
  const results: { it: any[]; en: any[]; original: any[] } = { it: [], en: [], original: [] };

  await Promise.all(languages.map(async (lang) => {
    const url = `${TMDB_BASE_URL}/movie/${id}/videos?api_key=${TMDB_API_KEY}${lang !== 'null' ? `&language=${lang}` : ''}`;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const filtered = (data.results || []).filter((v: any) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (lang === 'it-IT') results.it = filtered;
        else if (lang === 'en-US') results.en = filtered;
        else results.original = filtered;
      }
    } catch (e) {}
  }));

  return results;
}
