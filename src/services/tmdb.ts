const TMDB_API_KEY = '00ea09c7fb5bf89b064f6001a2de3122';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export interface MovieItem {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  original_language?: string;
  rating?: string;
}

const LANGUAGE_MAP: Record<string, string> = {
  'en': 'Inglese',
  'it': 'Italiano',
  'fr': 'Francese',
  'de': 'Tedesco',
  'es': 'Spagnolo',
  'ja': 'Giapponese',
  'ko': 'Coreano',
  'zh': 'Cinese',
  'ru': 'Russo',
  'pt': 'Portoghese',
  'hi': 'Indiano',
  'ar': 'Arabo',
};

/**
 * Converts a TMDB language code to a human-readable Italian name.
 */
export function getLanguageName(code?: string): string {
  if (!code) return 'N/D';
  const name = LANGUAGE_MAP[code.toLowerCase()];
  if (name) return name;
  return 'Originale';
}

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
  };
}

/**
 * Searches for movies on TMDB based on a text query.
 * If query is empty, it returns popular movies.
 */
export async function searchMovies(query: string = ''): Promise<MovieItem[]> {
  try {
    const endpoint = query 
      ? `/search/movie?query=${encodeURIComponent(query)}&language=it-IT&page=1`
      : `/movie/now_playing?language=it-IT&page=1`; // Use now_playing for cinema feel instead of popular
      
    const url = `${TMDB_BASE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'accept': 'application/json'
      },
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!response.ok) {
      // The API key is passed as query param if not using Bearer
      // Wait, the prompt specified a raw string API KEY, not a Bearer Token.
      // Let's use the query param approach since it's a raw key: ?api_key=...
      const retryUrl = url.includes('?') 
        ? `${url}&api_key=${TMDB_API_KEY}` 
        : `${url}?api_key=${TMDB_API_KEY}`;
        
      const responseRetry = await fetch(retryUrl, {
        headers: { 'accept': 'application/json' },
        next: { revalidate: 3600 }
      });
      
      if (!responseRetry.ok) throw new Error('Failed to fetch from TMDB');
      
      const data = await responseRetry.json();
      return data.results || [];
    }

    const data = await response.json();
    const results: MovieItem[] = data.results || [];

    // Enrich the first 10 results with ratings (VM14, VM18, etc)
    // We do this by calling getMovieDetails which includes release_dates.
    // This makes the search slightly slower but provides critical age info as requested.
    const enrichedResults = await Promise.all(
      results.slice(0, 10).map(async (movie) => {
        try {
          const details = await getMovieDetails(String(movie.id));
          if (details) {
            return {
              ...movie,
              rating: await getEnhancedRating(details)
            };
          }
          return movie;
        } catch {
          return movie;
        }
      })
    );

    // Combine enriched results with the rest
    return [...enrichedResults, ...results.slice(10)];
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
    console.log(`[TMDB DEBUG] Recupero dettagli per ID: ${id}`);
    const url = `${TMDB_BASE_URL}/movie/${id}?language=it-IT&append_to_response=credits,images,release_dates&include_image_language=it,en,null&api_key=${TMDB_API_KEY}`;
    
    const response = await fetch(url, {
      headers: { 'accept': 'application/json' },
      next: { revalidate: 3600 }
    });
    
    if (!response.ok) return null;
    const details = await response.json();

    // Recupero video separato senza filtro lingua per ottenere TUTTE le versioni (identifica l'originale con precisione)
    const videoUrl = `${TMDB_BASE_URL}/movie/${id}/videos?api_key=${TMDB_API_KEY}`;
    try {
      const videoResponse = await fetch(videoUrl, {
        headers: { 'accept': 'application/json' },
        next: { revalidate: 3600 }
      });
      if (videoResponse.ok) {
        details.videos = await videoResponse.json();
      }
    } catch (e) {
      console.error(`[TMDB ERROR] Impossibile recuperare i video per ${id}:`, e);
    }

    return details;
  } catch (error) {
    console.error(`Error fetching details for movie ${id}:`, error);
    return null;
  }
}

/**
 * Extracts the director's name from the movie details crew.
 */
export function getDirector(details: MovieDetails): string {
  const director = details.credits?.crew.find(person => person.job === 'Director');
  return director ? director.name : 'Sconosciuto';
}

/**
 * Extracts the main cast members (top 5-6) from the movie details.
 */
export function getCast(details: any, limit: number = 5): string[] {
  const credits = details?.credits;
  if (!credits) {
    console.warn(`[TMDB WARNING] Nessun credito trovato per il film: ${details?.title}`);
    return [];
  }
  
  const cast = credits.cast;
  if (!cast || !Array.isArray(cast) || cast.length === 0) {
    console.warn(`[TMDB WARNING] Cast non trovato o vuoto per il film: ${details?.title}`);
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
 * Extracts the best trailer key (YouTube) following surgical linguistic rules:
 * 1. IT: it-IT > en-US > first available
 * 2. EN: en-US/en-GB > first available
 * 3. UR/PA/SD: Forced EN (en-US)
 * 4. Others: Original > EN > first available
 * Filters: Site "YouTube", Type "Trailer", Priority "official: true"
 */
export async function getMovieTrailer(id: string, originalLanguage: string = 'en'): Promise<string | null> {
  const cacheKey = `${id}_${originalLanguage}_strict`; // Updated cache key to force refresh
  if (trailerCache.has(cacheKey)) {
    return trailerCache.get(cacheKey)!;
  }

  try {
    const trailerKeys = await getMovieTrailers(id, originalLanguage);
    const trailerKey = trailerKeys.length > 0 ? trailerKeys[0] : null;
    trailerCache.set(cacheKey, trailerKey);
    return trailerKey;
  } catch (error) {
    console.error(`[TMDB ERROR] Error fetching trailer for ${id}:`, error);
    return null;
  }
}

/**
 * NEW: Extracts multiple trailer keys (YouTube) for fallback resilience.
 * Returns up to 5 keys, prioritized by:
 * 1. Language priority (IT/EN/Original)
 * 2. Type priority (Trailer > Teaser > Clip)
 * 3. Official status
 */
export async function getMovieTrailers(id: string, originalLanguage: string = 'en'): Promise<string[]> {
  const cacheKey = `${id}_${originalLanguage}_multi_strict_v2`; // Updated cache key to force refresh
  if (trailersCache.has(cacheKey)) {
    return trailersCache.get(cacheKey)!;
  }

  try {
    const allVideos: any[] = [];

    // Determina la lingua primaria e secondaria
    let primaryLang = 'en-US';
    let secondaryLang: string | null = null;

    if (originalLanguage === 'it') {
      primaryLang = 'it-IT';
      secondaryLang = 'en-US';
    } else if (['ur', 'pa', 'sd'].includes(originalLanguage)) {
      primaryLang = 'en-US';
      secondaryLang = null;
    } else if (originalLanguage !== 'en') {
      // Per altri film, l'utente preferisce trailer in lingua originale se possibile, altrimenti EN
      primaryLang = originalLanguage;
      secondaryLang = 'en-US';
    }

    const langsToFetch = secondaryLang ? [primaryLang, secondaryLang] : [primaryLang];

    // Fetch videos for each target language
    for (const lang of langsToFetch) {
      const url = `${TMDB_BASE_URL}/movie/${id}/videos?api_key=${TMDB_API_KEY}&language=${lang}`;
      const response = await fetch(url, { next: { revalidate: 3600 } }); // Reduced revalidate for immediate update
      if (!response.ok) continue;
      
      const data = await response.json();
      if (data.results && Array.isArray(data.results)) {
        allVideos.push(...data.results.map((v: any) => ({ ...v, fetchLang: lang })));
      }
    }

    // Fallback: search without language restriction
    const fallbackUrl = `${TMDB_BASE_URL}/movie/${id}/videos?api_key=${TMDB_API_KEY}`;
    const fbResponse = await fetch(fallbackUrl, { next: { revalidate: 3600 } });
    if (fbResponse.ok) {
      const fbData = await fbResponse.json();
      if (fbData.results) {
        allVideos.push(...fbData.results.map((v: any) => ({ ...v, fetchLang: 'any' })));
      }
    }

    // 1. FILTRO RIGOROSO: Solo YouTube, Chiave presente, ed ESCLUSIONE CATEGORICA di Featurette, Clip, etc.
    const forbiddenTypes = ['Featurette', 'Behind the Scenes', 'Bloopers', 'Clip', 'Other'];
    const candidates = allVideos.filter(v => 
      v.site === 'YouTube' && 
      v.key && 
      !forbiddenTypes.includes(v.type) &&
      (v.type === 'Trailer' || v.type === 'Teaser')
    );

    // Se non abbiamo Trailer o Teaser, restituiamo vuoto (null) come richiesto
    if (candidates.length === 0) {
      trailersCache.set(cacheKey, []);
      return [];
    }

    // 2. SCORING SYSTEM (Strict Trailer Priority)
    const scoredVideos = candidates.map(v => {
      let score = 0;
      
      // PRIORITÀ 1: Tipo (Trailer >> Teaser)
      if (v.type === 'Trailer') score += 5000;
      else if (v.type === 'Teaser') score += 1000;
      
      // PRIORITÀ 2: Official
      if (v.official === true) score += 2000;
      
      // PRIORITÀ 3: Lingua
      if (v.fetchLang === primaryLang) score += 500;
      else if (v.fetchLang === secondaryLang) score += 250;
      else if (v.fetchLang === 'any') score += 100;
      
      // Bonus per qualità (se presente nel nome, es. "Official Trailer", "4K")
      const name = v.name.toLowerCase();
      if (name.includes('official')) score += 100;
      if (name.includes('trailer') && !name.includes('teaser')) score += 50;

      return { key: v.key, score, type: v.type };
    });

    // 3. SEPARAZIONE E ORDINE: Prima tutti i Trailer, poi i Teaser (se nessun Trailer esiste)
    const trailers = scoredVideos.filter(v => v.type === 'Trailer').sort((a, b) => b.score - a.score);
    const teasers = scoredVideos.filter(v => v.type === 'Teaser').sort((a, b) => b.score - a.score);

    // Se abbiamo dei Trailer, prendiamo solo quelli (scartando i Teaser)
    // Se non abbiamo Trailer, prendiamo i Teaser come fallback.
    const sortedVideos = trailers.length > 0 ? trailers : teasers;

    // Remove duplicates and take top 5
    const finalKeys = Array.from(new Set(
      sortedVideos.map(v => v.key)
    )).slice(0, 5);

    trailersCache.set(cacheKey, finalKeys);
    return finalKeys;
  } catch (error) {
    console.error(`[TMDB ERROR] Error fetching multiple trailers for ${id}:`, error);
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
 * Helper to construct the full image URL from TMDB path.
 * Size can be 'w500', 'original', etc.
 */
export function getTMDBImageUrl(path: string | null | undefined, size: string = 'w500'): string | undefined {
  if (!path) return undefined;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/**
 * Helper to map international ratings to the Italian standard (T, 6+, 14+, 18+).
 * Mapping based on strict provided cross-country tables.
 */
function mapForeignToItalianRating(country: string, cert: string): string {
  const c = cert.toUpperCase().replace(/\s+/g, '');
  if (!c) return '';

  if (country === 'US') {
    if (c === 'G') return 'T';
    if (c === 'PG') return '6+';
    if (c === 'PG-13') return '14+';
    if (c === 'R' || c === 'NC-17') return '18+';
  }
  
  if (country === 'GB') {
    if (c === 'U') return 'T';
    if (c === 'PG') return '6+';
    if (c === '12' || c === '12A' || c === '15') return '14+';
    if (c === '18') return '18+';
  }
  
  if (country === 'DE') {
    if (c === '0') return 'T';
    if (c === '6') return '6+';
    if (c === '12') return '14+';
    if (c === '16' || c === '18') return '18+';
  }
  
  if (country === 'FR') {
    if (c === 'U') return 'T';
    if (c === '10') return '6+'; // common FR rating
    if (c === '12') return '14+';
    if (c === '16' || c === '18') return '18+';
  }

  // Fallback generico per formati numerici "puri"
  const num = parseInt(c.replace(/\D/g, ''));
  if (!isNaN(num)) {
    if (num >= 18) return '18+';
    if (num >= 14) return '14+';
    if (num >= 6) return '6+';
    return 'T';
  }

  return '';
}

/**
 * Universal Censorship Translator (Smart Fallback).
 * 1. Checks IT (Theatrical priority).
 * 2. Falls back through priority list: US -> GB -> DE -> FR.
 * 3. Maps foreign codes to Italian levels (T, 6+, 14+, 18+).
 * 4. Logs fallback usage for diagnostics.
 */
export function getItalianRating(details: MovieDetails): string {
  const results = details.release_dates?.results;
  if (!results) return 'T';

  // 1. Priorità di Ricerca (Fallback Sequence)
  const priorityCountries = ['IT', 'US', 'GB', 'DE', 'FR'];
  
  for (const countryCode of priorityCountries) {
    const countryData = results.find(r => r.iso_3166_1 === countryCode);
    if (!countryData || countryData.release_dates.length === 0) continue;

    // Filtriamo solo le release che hanno una certificazione non vuota
    const validReleases = countryData.release_dates.filter(rd => rd.certification && rd.certification.trim() !== '');
    if (validReleases.length === 0) continue;

    // Cerchiamo preferibilmente la release cinematografica (type: 3)
    const theatrical = validReleases.find(rd => rd.type === 3);
    const rawCert = (theatrical ? theatrical.certification : validReleases[0].certification).trim().toUpperCase();

    if (countryCode === 'IT') {
      // Normalizzazione standard IT
      const cert = rawCert.replace(/\s+/g, '');
      if (cert === 'T' || cert === 'PT' || !cert) return 'T';
      if (cert === '6' || cert === '6+') return '6+';
      if (cert === '14' || cert === 'VM14' || cert === '14+') return '14+';
      if (cert === '18' || cert === 'VM18' || cert === '18+') return '18+';
      return cert;
    } else {
      // Fallback: Mappiamo la certificazione trovata
      const mapped = mapForeignToItalianRating(countryCode, rawCert);
      
      if (mapped) {
        console.log(`[Rating Fallback] Film: ${details.title} | Usato rating ${countryCode}: ${rawCert} -> Mappato come ${mapped}`);
        return mapped;
      }
    }
  }

  // 5. Ultima Istanza
  console.warn(`[TMDb Critical] Nessun rating trovato per "${details.title}" (ID: ${details.id}) nei paesi di fallback. Impostato 'T'.`);
  return 'T';
}

/**
 * Mappa i rating US (OMDb) secondo le regole italiane fornite.
 */
function translateUSRating(omdbRated: string): string {
  const r = omdbRated.toUpperCase().trim();
  
  if (["G", "APPROVED", "PASSED"].includes(r)) return 'T';
  if (["PG", "TV-PG"].includes(r)) return '6+';
  if (["PG-13", "TV-14"].includes(r)) return '14+';
  if (["R", "NC-17", "TV-MA", "X"].includes(r)) return '18+';
  
  return 'T'; // Default for N/A or Unrated
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

  // 1. Check Override Manuali (Priorità Assoluta)
  if (MANUAL_RATING_OVERRIDES[title]) {
    console.log(`[Rating Override] Film: ${title} -> Forza Rating: ${MANUAL_RATING_OVERRIDES[title]}`);
    return MANUAL_RATING_OVERRIDES[title];
  }

  // 2. Ottieni rating base da TMDb
  let currentRating = getItalianRating(details);

  // 3. Logica Speciale Documentari: Se è un documentario, tendiamo al 'T' 
  // a meno che non ci sia una restrizione 18+ esplicita.
  const isDocumentary = details.genres?.some(g => g.id === 99 || g.name.toLowerCase().includes('documentario') || g.name.toLowerCase().includes('documentary'));
  
  if (isDocumentary && currentRating !== '18+') {
    // Se è un documentario e non è 18+, forziamo a T per evitare falsi positivi (es. Ennio)
    // a meno che OMDb non gridi al lupo con un '18+' esplicito dopo.
    currentRating = 'T';
  }

  // 4. Sincronizzazione con OMDb (Fonte di Verità Internazionale)
  if (imdbId) {
    const omdbRated = await getOMDbRating(imdbId);
    
    if (omdbRated && omdbRated !== 'N/A') {
      const mappedRating = translateUSRating(omdbRated);
      
      // Regola della Massima Restrizione
      // Se è un documentario, applichiamo OMDb solo se è 18+ (Sicurezza Nucleare)
      if (isDocumentary && mappedRating !== '18+') {
        // Ignoriamo rating intermedi di OMDb per documentari (spesso TV-14 US -> 14+ IT errati)
      } else if (isMoreRestrictive(currentRating, mappedRating)) {
        console.log(`[OMDb Sync] Film: ${title} | Rating US: ${omdbRated} -> Convertito in IT: ${mappedRating} (Sostituito TMDb '${currentRating}')`);
        currentRating = mappedRating;
      } else {
        // Manteniamo TMDb se più restrittivo o uguale
      }
    }
  }

  return currentRating;
}
