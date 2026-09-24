import type { Metadata } from 'next';
import { loadOggi } from '../_oggi/loadOggi';
import type { OggiData } from '../_oggi/buildOggi';
import DisplayControls from './_display/DisplayControls';
import styles from '../_stanza.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Display' };

/** Cosa mostrerebbe adesso lo schermo d'ingresso: lo stesso database di Oggi. */
export default async function DisplayPage() {
  let data: OggiData | null = null;
  try {
    data = await loadOggi();
  } catch (err) {
    console.error('[DISPLAY] Lettura del database fallita:', err);
  }
  const upcoming = data ? data.day.filter((s) => s.state === 'dopo').slice(0, 2) : [];
  const next = data?.next;

  return (
    <div className={styles.room}>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>Lo schermo all’ingresso</p>
          <h1 className={styles.title}>Display</h1>
        </div>
      </header>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <p className={styles.section}>Adesso, sullo schermo</p>
          {!data ? (
            <p className={styles.hint}>Non riesco a leggere il database in questo momento.</p>
          ) : (
            <div className={styles.screen}>
              <p className={styles.hint}>{data.current ? `In sala fino alle ${data.current.end}` : 'Sala ferma'}</p>
              <p className={styles.screenNow}>{data.current?.title ?? next?.title ?? 'Niente in programma'}</p>
              {!data.current && next && (
                <p className={styles.screenLine}>
                  <b>{next.start}</b> {next.when}
                </p>
              )}
              {upcoming.map((s) => (
                <p key={s.id} className={styles.screenLine}>
                  <b>{s.start}</b> {s.title}
                </p>
              ))}
            </div>
          )}
          <p className={styles.hint}>È un’anteprima di cosa c’è in sala e dopo; il display vero aggiunge immagini, trailer e orologio.</p>
        </section>

        <section className={styles.panel}>
          <p className={styles.section}>Accendi lo schermo</p>
          <DisplayControls />
        </section>
      </div>
    </div>
  );
}
