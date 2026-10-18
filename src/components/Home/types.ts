/** Un film come lo prepara `app/page.tsx` per la home: scheda, spettacoli, premi, fondali. */
export interface GroupedMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  logo_path?: string | null;
  release_date: string;
  /** Anno già estratto lato server, per non calcolarlo dopo l'hydration. */
  release_year?: string;
  director?: string;
  runtime?: number;
  isSoldOut?: boolean;
  cast?: string[];
  trailerKey?: string | null;
  trailerKeys?: string[];
  rating?: string;
  versionLanguage?: string;
  subtitles?: string;
  format?: string;
  /** Le specifiche comuni a tutti gli spettacoli del film. Vedi `app/page.tsx`. */
  specs?: string[];
  subevents: any[];
  awards?: any[];
  tagline?: string;
  extraBackdrops?: string[];
  genres?: string[];
  voteAverage?: number | null;
}
