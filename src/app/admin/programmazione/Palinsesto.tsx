'use client';

/**
 * IL PALINSESTO — la settimana com'è, non come sarà.
 *
 * Gli altri due modi creano spettacoli; questo tocca quelli che esistono già,
 * e quindi ogni azione qui è **irreversibile e visibile online subito**. È la
 * ragione per cui niente parte da questo file: il trascinamento e l'orario
 * riscritto aprono un pannello che spiega cosa comporta, e la scrittura avviene
 * solo dopo una conferma esplicita.
 */

import React from 'react';
import { CalendarRange, Clapperboard, Loader2 } from 'lucide-react';
import styles from './Programmazione.module.css';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { PeriodOccupancy } from '@/actions/planningActions';
import { shortDayLabel } from './types';

interface Props {
  rooms: { id: number; name: string; isFavorite: boolean }[];
  roomId: number | null;
  onRoomChange: (id: number) => void;
  startDate: string;
  onStartDateChange: (d: string) => void;
  days: number;
  onDaysChange: (d: number) => void;
  occupancy: PeriodOccupancy | null;
  loading: boolean;
}

function saturationClass(s: number): string {
  if (s > 0.7) return styles.satHigh;
  if (s > 0.4) return styles.satMid;
  return styles.satLow;
}

export default function Palinsesto({
  rooms, roomId, onRoomChange,
  startDate, onStartDateChange,
  days, onDaysChange,
  occupancy, loading,
}: Props) {
  const total = occupancy?.totalShows ?? 0;

  return (
    <main className={styles.stepBody}>
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          <CalendarRange size={18} /> Il palinsesto
          {loading && <Loader2 size={15} className={styles.spin} />}
        </h2>

        <div className={styles.slotControls}>
          <label className={styles.field}>
            <span>Sala</span>
            <select value={roomId ?? ''} onChange={(e) => onRoomChange(Number(e.target.value))}>
              {rooms.length === 0 && <option value="">Nessuna sala disponibile</option>}
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.isFavorite ? '⭐ ' : ''}{r.name}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Dal giorno</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Per quanti giorni</span>
            <input
              type="number"
              min={1}
              max={30}
              value={days}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) onDaysChange(Math.min(Math.max(v, 1), 30));
              }}
            />
          </label>
        </div>

        <p className={styles.sideHint}>
          Qui non si crea niente: si sposta e si elimina ciò che è già in cartellone.
          Ogni modifica è immediata e si vede online.
        </p>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          {total > 0
            ? <>{total} proiezion{total === 1 ? 'e' : 'i'} in questi {occupancy?.days} giorni</>
            : <>Niente in cartellone in questi giorni</>}
        </h2>

        {loading && !occupancy && (
          <div className={styles.emptyState}>
            <Loader2 size={30} className={styles.spin} />
            <p>Leggo la sala…</p>
          </div>
        )}

        {occupancy && (
          <div className={styles.dayStrip}>
            {occupancy.daysDetail.map((d) => {
              const pct = Math.round(d.saturation * 100);
              return (
                <section
                  key={d.date}
                  className={`${styles.dayCol} ${d.isWeekend ? styles.dayWeekend : ''} ${d.isPast ? styles.dayPast : ''}`}
                >
                  <div className={styles.dayColHead}>
                    <span className={styles.dayColName}>{shortDayLabel(d.date)}</span>
                    <span className={`${styles.dayColPct} ${saturationClass(d.saturation)}`}>{pct}%</span>
                  </div>

                  <div className={styles.satTrack}>
                    <div className={`${styles.satFill} ${saturationClass(d.saturation)}`} style={{ width: `${pct}%` }} />
                  </div>

                  <div className={styles.dayColBody}>
                    {d.shows.length === 0 && (
                      <div className={styles.dayColEmpty}>{d.isPast ? 'passata' : 'giornata libera'}</div>
                    )}

                    {d.shows.map((s, i) => {
                      const poster = getTMDBImageUrl(s.posterPath ?? null, 'w92');
                      return (
                        <article key={s.pretixId ?? `x-${i}`} className={styles.calShow}>
                          <div className={styles.calShowTop}>
                            <span className={styles.calShowTime}>{s.time}</span>
                          </div>
                          <div className={styles.calShowMain}>
                            <div className={styles.calShowPoster}>
                              {poster ? <img src={poster} alt="" loading="lazy" /> : <Clapperboard size={14} />}
                            </div>
                            <div className={styles.calShowText}>
                              <b title={s.title}>{s.title}</b>
                              <span>{s.runtime}′ · fine {s.endTime}</span>
                            </div>
                          </div>
                        </article>
                      );
                    })}

                    {d.gaps.map((g, i) => (
                      <div key={`gap-${i}`} className={styles.gapChip}>
                        libero {Math.floor(g.minutes / 60)}h{String(g.minutes % 60).padStart(2, '0')}′ · {g.from}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
