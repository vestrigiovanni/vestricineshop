import type { Metadata } from 'next';
import Oggi from '@/gestionale/oggi/Oggi';
import { caricaOggi } from '@/gestionale/oggi/carica';
import type { OggiData } from '@/gestionale/oggi/buildOggi';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Oggi' };

/** Oggi è la porta del gestionale. */
export default async function Inizio() {
  let data: OggiData | null = null;
  try {
    data = await caricaOggi();
  } catch (e) {
    console.error('[oggi] lettura del database non riuscita:', e);
  }
  if (!data) {
    return (
      <div className="g-vuoto">
        <p className="g-vuoto__titolo">Il database non risponde</p>
        <p className="g-nota">Le altre stanze funzionano; riprova fra poco.</p>
      </div>
    );
  }
  return <Oggi data={data} />;
}
