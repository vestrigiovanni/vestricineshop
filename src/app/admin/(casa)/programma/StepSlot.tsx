'use client';

/**
 * PASSO 1 — LO SLOT.
 *
 * Si sceglie prima *dove e quando*, e solo dopo *cosa*. È l'inversione rispetto
 * al planner vecchio, e non è un dettaglio di comodità: sapere dove sono i
 * buchi liberi è ciò che permette al passo 2 di proporre film con la durata
 * giusta. Scegliendo i film per primi, quell'informazione non esisterebbe
 * ancora.
 */

import React from 'react';
import { CalendarRange, Loader2, Lock, Sparkles } from 'lucide-react';
import styles from './Programmazione.module.css';
import type { DayOccupancy, PeriodOccupancy } from '@/actions/planningActions';
import { shortDayLabel } from './types';

const PRESETS: { label: string; days: number; hint: string }[] = [
  { label: 'Oggi', days: 1, hint: 'una giornata sola' },
  { label: 'Weekend', days: 3, hint: 'tre giorni' },
  { label: '1 settimana', days: 7, hint: 'sette giorni' },
  { label: '10 giorni', days: 10, hint: 'dieci giorni' },
  { label: '2 settimane', days: 14, hint: 'quattordici giorni' },
];

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
  minDate: string;
}

function saturationClass(s: number): string {
  if (s > 0.7) return styles.satHigh;
  if (s > 0.4) return styles.satMid;
  return styles.satLow;
}

function DayColumn({ day }: { day: DayOccupancy }) {
  const pct = Math.round(day.saturation * 100);
  return (
    <div className={`${styles.dayCol} ${day.isWeekend ? styles.dayWeekend : ''} ${day.isPast ? styles.dayPast : ''}`}>
      <div className={styles.dayColHead}>
        <span className={styles.dayColName}>{shortDayLabel(day.date)}</span>
        <span className={`${styles.dayColPct} ${saturationClass(day.saturation)}`}>{pct}%</span>
      </div>

      <div className={styles.satTrack} title={`${pct}% delle ore utili già occupate`}>
        <div className={`${styles.satFill} ${saturationClass(day.saturation)}`} style={{ width: `${pct}%` }} />
      </div>

      <div className={styles.dayColBody}>
        {day.shows.length === 0 && !day.isPast && (
          <div className={styles.dayColEmpty}>giornata libera</div>
        )}
        {day.isPast && day.shows.length === 0 && (
          <div className={styles.dayColEmpty}>passata</div>
        )}
        {day.shows.map((s, i) => (
          <div key={`${s.pretixId ?? i}`} className={styles.existingShow} title={`${s.title} · ${s.time}–${s.endTime}`}>
            <Lock size={10} />
            <b>{s.time}</b>
            <span>{s.title}</span>
          </div>
        ))}
        {day.gaps.map((g, i) => (
          <div key={`gap-${i}`} className={styles.gapChip}>
            libero {Math.floor(g.minutes / 60)}h{String(g.minutes % 60).padStart(2, '0')}′ · {g.from}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StepSlot({
  rooms, roomId, onRoomChange,
  startDate, onStartDateChange,
  days, onDaysChange,
  occupancy, loading, minDate,
}: Props) {
  return (
    <main className={styles.stepBody}>
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}><CalendarRange size={18} /> Dove e quando</h2>

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
              min={minDate}
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

        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`${styles.presetBtn} ${days === p.days ? styles.presetActive : ''}`}
              onClick={() => onDaysChange(p.days)}
              title={p.hint}
            >
              {p.label}
            </button>
          ))}
          <span className={styles.presetHint}>o scegli tu, fino a 30 giorni</span>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          <Sparkles size={18} /> Cosa c&apos;è già in sala
          {loading && <Loader2 size={15} className={styles.spin} />}
        </h2>

        {occupancy && !loading && (
          <p className={styles.periodSummary}>
            In questi <b>{occupancy.days} giorni</b> ci sono già{' '}
            <b>{occupancy.totalShows} proiezion{occupancy.totalShows === 1 ? 'e' : 'i'}</b>.
            {occupancy.freeSlotsEstimate > 0
              ? <> Restano circa <b>{occupancy.freeSlotsEstimate} spettacoli</b> di spazio.</>
              : <> Non c&apos;è quasi più spazio: allarga il periodo o scegli un&apos;altra sala.</>}
          </p>
        )}

        {loading && !occupancy && (
          <div className={styles.emptyState}>
            <Loader2 size={30} className={styles.spin} />
            <p>Leggo la sala…</p>
          </div>
        )}

        {occupancy && (
          <div className={styles.dayStrip}>
            {occupancy.daysDetail.map((d) => <DayColumn key={d.date} day={d} />)}
          </div>
        )}
      </section>
    </main>
  );
}
