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
    return data.results || [];
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
      cache: 'no-store'
    });

    if (!response.ok) throw new Error('Failed to fetch movie details');

    const data = await response.json();
    console.log(`[TMDB DEBUG] Dati ricevuti per ${id}. Keys:`, Object.keys(data).join(', '));
    if (data.credits) {
      console.log(`[TMDB DEBUG] Crediti presenti. Cast count: ${data.credits.cast?.length || 0}`);
    } else {
      console.log(`[TMDB DEBUG] ATTENZIONE: Proprietà "credits" MANCANTE in risposta TMDB`);
    }
    return data;
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
export function getTMDBImageUrl(path: string | null, size: string = 'w500'): string {
  if (!path) return ''; // Could return a local fallback placeholder
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
