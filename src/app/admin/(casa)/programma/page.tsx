import type { Metadata } from 'next';
import Tavolo from './_tavolo/Tavolo';
import { loadTavolo, type TavoloData } from './_tavolo/load';
import { parseQuery, type SearchParams } from './_tavolo/query';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Programma' };

export default async function ProgrammaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  let data: TavoloData | null = null;
  try {
    data = await loadTavolo(parseQuery(sp));
  } catch (err) {
    console.error('[TAVOLO] Lettura della sala fallita:', err);
  }

  if (!data) {
    return (
      <p style={{ maxWidth: 560, margin: '64px auto', padding: '0 16px', color: 'var(--c-dim)' }}>
        Non riesco a leggere la sala in questo momento. Riprova fra poco.
      </p>
    );
  }
  return <Tavolo data={data} />;
}
