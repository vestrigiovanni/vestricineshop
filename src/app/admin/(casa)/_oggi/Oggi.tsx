import Button from '@/components/cabina/Button';
import AutoRefresh from './AutoRefresh';
import SyncSeatsButton from './SyncSeatsButton';
import type { OggiData, OggiShow } from './buildOggi';
import styles from './Oggi.module.css';

function language(s: OggiShow): string {
  if (!s.lingua) return 'Lingua da indicare';
  return s.sottotitoli ? `${s.lingua}, sott. ${s.sottotitoli}` : s.lingua;
}

function seats(s: OggiShow): string {
  if (s.soldOut) return 'tutto esaurito';
  if (s.sold === null || s.total === null) return 'posti da leggere';
  return `${s.sold}/${s.total} venduti`;
}

const STATE_LABEL = { finito: 'finito', 'in-sala': 'in sala', dopo: 'dopo' } as const;

function NowCard({ data }: { data: OggiData }) {
  const s = data.current;
  if (s) {
    return (
      <section className={styles.now} aria-label="In sala adesso">
        <p className={styles.nowLabel}>
          <span className={styles.dot} aria-hidden /> In sala adesso · {s.start} – {s.end}
        </p>
        <h2 className={styles.nowTitle}>{s.title}</h2>
        <p className={styles.nowMeta}>{[s.director, language(s)].filter(Boolean).join(' · ')}</p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(s.progress * 100)}
          aria-label="Avanzamento del film"
        >
          <span style={{ width: `${Math.round(s.progress * 100)}%` }} />
        </div>
      </section>
    );
  }
  const n = data.next;
  return (
    <section className={`${styles.now} ${styles.nowIdle}`} aria-label="In sala adesso">
      <p className={styles.nowLabel}>Sala ferma</p>
      {n ? (
        <>
          <h2 className={styles.nowTitle}>{n.title}</h2>
          <p className={styles.nowMeta}>
            Il prossimo, {n.when} alle {n.start} · {language(n)}
          </p>
        </>
      ) : (
        <h2 className={styles.nowTitle}>Niente in programma</h2>
      )}
    </section>
  );
}

export default function Oggi({ data }: { data: OggiData }) {
  const soldToday = data.stats.soldToday;
  return (
    <div className={styles.room}>
      <AutoRefresh />
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>
            {data.dateLabel}
            {data.rooms.length > 0 && ` · ${data.rooms.join(' · ')}`}
          </p>
          <h1 className={styles.title}>Oggi in sala</h1>
        </div>
        <div className={styles.headActions}>
          <Button href="/admin/cassa">Apri cassa</Button>
          <Button href="/admin/programma" variant="fill">+ Programma</Button>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={styles.main}>
          <NowCard data={data} />

          <section aria-label="La giornata">
            <h3 className={styles.section}>La giornata</h3>
            {data.day.length === 0 ? (
              <p className={styles.empty}>Oggi non ci sono spettacoli.</p>
            ) : (
              <ol className={styles.list}>
                {data.day.map((s) => (
                  <li key={s.id} className={styles.row} data-state={s.state}>
                    <span className={styles.time}>{s.start}</span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{s.title}</span>
                      <span className={styles.rowMeta}>{language(s)}</span>
                    </span>
                    <span className={styles.rowSide}>
                      <span className={styles.seats}>{seats(s)}</span>
                      <span className={styles.pill}>{STATE_LABEL[s.state]}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className={styles.side}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Spettacoli</span>
              <b>{data.stats.showsToday}</b>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Venduti</span>
              <b title={soldToday === null ? 'I posti di oggi non sono ancora stati letti da Pretix' : undefined}>
                {soldToday ?? '—'}
              </b>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Settimana</span>
              <b>{data.stats.showsWeek}</b>
            </div>
          </div>

          <section aria-label="Da guardare">
            <h3 className={styles.section}>Da guardare</h3>
            {data.alerts.length === 0 ? (
              <p className={styles.calm}>Tutto in ordine.</p>
            ) : (
              <ul className={styles.alerts}>
                {data.alerts.map((a) => (
                  <li key={a.id} className={styles.alert} data-tone={a.tone}>
                    <p>{a.text}</p>
                    {a.action?.kind === 'sync-posti' && <SyncSeatsButton label={a.action.label} />}
                    {a.action?.href && (
                      <Button href={a.action.href} variant="ghost">
                        {a.action.label}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
