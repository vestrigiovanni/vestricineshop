'use client';

/**
 * PASSO 2 AL CONTRARIO — GLI ORARI LIBERI.
 *
 * Il film è deciso: qui si vede dove ci sta. Le giornate arrivano già filtrate
 * dal server — solo quelle con spazio vero, dalla più vicina — e ogni orario
 * proposto è già passato dalle regole del motore, quindi cliccarlo non può
 * produrre uno spettacolo che poi verrà rifiutato.
 *
 * Si possono spuntare più orari, anche su giorni diversi: sono le repliche.
 */

import React from 'react';
import {
  CalendarClock, CalendarPlus, Check, Clapperboard, Loader2, Lock, Search,
} from 'lucide-react';
import styles from './Programmazione.module.css';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { PlanningFindSlotsResult, SlotProposal } from '@/actions/planningActions';
import { BAND_LABELS, type Band } from '@/services/scheduling/times';
import { dayLabel, type CatalogItem } from './types';

const BAND_CLASS: Record<Band, string> = {
  matinee: styles.bandMatinee,
  afternoon: styles.bandAfternoon,
  evening: styles.bandEvening,
  night: styles.bandNight,
};

const BAND_FILTERS: { value: Band | ''; label: string }[] = [
  { value: '', label: 'Tutte le fasce' },
  { value: 'matinee', label: 'Matinée' },
  { value: 'afternoon', label: 'Pomeriggio' },
  { value: 'evening', label: 'Prima serata' },
  { value: 'night', label: 'Seconda serata' },
];

/** Identità di un orario proposto: il minuto d'inizio è già unico. */
export function slotKey(s: SlotProposal): string {
  return `${s.day}@${s.startMinute}`;
}

interface Props {
  film: CatalogItem;
  result: PlanningFindSlotsResult | null;
  loading: boolean;
  selected: Map<string, SlotProposal>;
  onToggleSlot: (slot: SlotProposal) => void;
  band: Band | '';
  onBandChange: (b: Band | '') => void;
  /** Allarga la ricerca ai giorni successivi. */
  onLookFurther: () => void;
  /** Vero mentre si sta allargando: il bottone non deve poter partire due volte. */
  expanding: boolean;
}

export default function StepFreeSlots({
  film, result, loading, selected, onToggleSlot, band, onBandChange, onLookFurther, expanding,
}: Props) {
  const poster = getTMDBImageUrl(film.posterPath, 'w154');
  const runtime = result?.film?.runtime ?? film.runtime ?? film.durationMin;
  const days = result?.days ?? [];

  return (
    <main className={styles.stepBody}>
      {/* ── Il film di cui stiamo cercando gli orari ────────────────────── */}
      <section className={styles.panel}>
        <div className={styles.slotHeader}>
          <div className={styles.chosenPoster}>
            {poster ? <img src={poster} alt="" /> : <Clapperboard size={22} />}
          </div>
          <div className={styles.chosenMain}>
            <b>{result?.film?.title ?? film.title}</b>
            <span>
              {runtime ? `${runtime}′` : 'durata ignota'}
              {' · cerco gli orari liberi dal giorno più vicino'}
            </span>
          </div>

          <label className={styles.field}>
            <span>Fascia</span>
            <select value={band} onChange={(e) => onBandChange(e.target.value as Band | '')}>
              {BAND_FILTERS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </label>
        </div>

        {selected.size > 0 && (
          <p className={styles.periodSummary}>
            Hai scelto <b>{selected.size} orari{selected.size === 1 ? 'o' : ''}</b>:{' '}
            {[...selected.values()]
              .sort((a, b) => a.startMinute - b.startMinute)
              .map((s) => `${dayLabel(s.day)} alle ${s.time}`)
              .join(' · ')}
          </p>
        )}
      </section>

      {/* ── Le giornate con spazio ──────────────────────────────────────── */}
      {loading && days.length === 0 && (
        <div className={styles.emptyState}>
          <Loader2 size={30} className={styles.spin} />
          <p>Cerco gli orari liberi…</p>
        </div>
      )}

      {!loading && days.length === 0 && (
        <div className={styles.emptyState}>
          <Search size={30} />
          <p>{result?.reason ?? 'Nessun orario libero da queste parti.'}</p>
          <button className={styles.ghostBtnSmall} onClick={onLookFurther} disabled={expanding}>
            {expanding ? <Loader2 size={13} className={styles.spin} /> : <CalendarClock size={13} />}
            Guarda più avanti
          </button>
        </div>
      )}

      {days.length > 0 && (
        <section className={styles.slotDays}>
          {days.map((d) => (
            <article key={d.day} className={`${styles.slotDay} ${d.isWeekend ? styles.dayWeekend : ''}`}>
              <header className={styles.slotDayHead}>
                <span className={styles.slotDayName}>{dayLabel(d.day)}</span>
                <span className={styles.slotDayCount}>
                  {d.existing.length === 0
                    ? 'giornata libera'
                    : `${d.existing.length} già in sala`}
                </span>
              </header>

              <div className={styles.slotTimes}>
                {d.slots.map((s) => {
                  const key = slotKey(s);
                  const on = selected.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.slotChip} ${on ? styles.slotChipOn : ''}`}
                      onClick={() => onToggleSlot(s)}
                      title={`${s.time}–${s.endTime} · ${BAND_LABELS[s.band]}`}
                    >
                      {on ? <Check size={13} strokeWidth={3} /> : <CalendarPlus size={13} />}
                      <b>{s.time}</b>
                      <span className={`${styles.bandTag} ${BAND_CLASS[s.band]}`}>{BAND_LABELS[s.band]}</span>
                      <span className={styles.slotChipEnd}>fine {s.endTime}</span>
                    </button>
                  );
                })}
              </div>

              {d.existing.length > 0 && (
                <div className={styles.slotExisting}>
                  {d.existing.map((s, i) => (
                    <span key={`${s.pretixId ?? i}`} title={`${s.title} · ${s.time}–${s.endTime}`}>
                      <Lock size={9} /> {s.time} {s.title}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {days.length > 0 && (
        <div className={styles.slotMore}>
          <button className={styles.ghostBtnSmall} onClick={onLookFurther} disabled={expanding || loading}>
            {expanding ? <Loader2 size={13} className={styles.spin} /> : <CalendarClock size={13} />}
            Guarda più avanti
          </button>
          <span className={styles.presetHint}>
            {days.length} giornat{days.length === 1 ? 'a' : 'e'} con spazio
            {result ? `, trovate nei primi ${result.scannedDays} giorni` : ''}
          </span>
        </div>
      )}
    </main>
  );
}
