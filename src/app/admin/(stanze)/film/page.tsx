import type { Metadata } from 'next';
import StanzaFilm from '@/gestionale/film/StanzaFilm';

export const metadata: Metadata = { title: 'Film' };

/** `?tmdb=` apre subito la scheda di quel film (ci si arriva dal Catalogo e dal Programma). */
export default async function Film({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tmdb = Array.isArray(sp.tmdb) ? sp.tmdb[0] : sp.tmdb;
  return <StanzaFilm iniziale={tmdb && /^\d+$/.test(tmdb.trim()) ? tmdb.trim() : null} />;
}
