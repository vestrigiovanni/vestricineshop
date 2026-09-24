import type { Metadata } from 'next';
import Oggi from './_oggi/Oggi';
import { loadOggi } from './_oggi/loadOggi';
import type { OggiData } from './_oggi/buildOggi';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Oggi' };

export default async function OggiPage() {
  let data: OggiData | null = null;
  try {
    data = await loadOggi();
  } catch (err) {
    console.error('[OGGI] Lettura del database fallita:', err);
  }

  if (!data) {
    return (
      <p style={{ maxWidth: 560, margin: '64px auto', padding: '0 16px', color: 'var(--c-dim)' }}>
        Non riesco a leggere il database in questo momento. Le altre stanze funzionano; riprova fra poco.
      </p>
    );
  }
  return <Oggi data={data} />;
}
