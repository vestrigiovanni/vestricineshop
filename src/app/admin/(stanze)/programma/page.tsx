import type { Metadata } from 'next';
import Tavolo from '@/gestionale/programma/Tavolo';
import { caricaTavolo, type TavoloData } from '@/gestionale/programma/carica';
import { parseQuery, type SearchParams } from '@/gestionale/programma/query';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata: Metadata = { title: 'Programma' };

/** `?room=&from=&days=&vuote=1&tmdb=`: la sala, il periodo, solo le vuote, un film da accendere. */
export default async function Programma({ searchParams }: { searchParams: Promise<SearchParams> }) {
  let data: TavoloData | null = null;
  try {
    data = await caricaTavolo(parseQuery(await searchParams));
  } catch (e) {
    console.error('[programma] lettura della sala non riuscita:', e);
  }
  if (!data) {
    return (
      <div className="g-vuoto">
        <p className="g-vuoto__titolo">Non riesco a leggere la sala</p>
        <p className="g-nota">Pretix o il database non rispondono. Riprova fra poco.</p>
      </div>
    );
  }
  return <Tavolo data={data} />;
}
