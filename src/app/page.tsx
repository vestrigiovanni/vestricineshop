import { programmaDalDatabase } from '@/services/proiezioni';

export const dynamic = 'force-dynamic';

const giornoLungo = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });

export default async function Home() {
  const giorni = await programmaDalDatabase();
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ fontSize: 32, margin: '0 0 8px' }}>Vestri Cinema</h1>
      <p style={{ opacity: 0.6, margin: '0 0 40px' }}>v2 — scheletro. Proiezioni future dal database.</p>
      {giorni.length === 0 && <p>Nessuna proiezione in programma.</p>}
      {giorni.map((g) => (
        <section key={g.giorno} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, textTransform: 'capitalize', borderBottom: '1px solid #333', paddingBottom: 8 }}>
            {giornoLungo.format(g.proiezioni[0].inizio)}
          </h2>
          {g.proiezioni.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 16, padding: '6px 0' }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 48 }}>{ora.format(p.inizio)}</span>
              <span style={{ flex: 1 }}>{p.titolo}</span>
              <span style={{ opacity: 0.5 }}>{p.sala}</span>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
