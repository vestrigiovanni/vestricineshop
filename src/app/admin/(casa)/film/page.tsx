import type { Metadata } from 'next';
import FilmRoom from './_film/FilmRoom';

export const metadata: Metadata = { title: 'Film' };

/** `?tmdb=` apre subito la scheda di quel film: ci si arriva dal tavolo e da Oggi. */
export default async function FilmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tmdb = Array.isArray(sp.tmdb) ? sp.tmdb[0] : sp.tmdb;
  return <FilmRoom initialTmdb={tmdb?.trim() || null} />;
}
