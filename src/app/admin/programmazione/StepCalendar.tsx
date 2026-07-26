'use client';

/**
 * PASSO 3 — IL CALENDARIO.
 *
 * Il motore propone, tu correggi. Ogni correzione passa dalla *stessa* funzione
 * che ha generato il piano: cambiare le repliche ricostruisce l'elenco dei
 * bloccati e richiama `planningGenerate`, spostare uno spettacolo passa da
 * `planningSnapShow`. Non esiste un secondo percorso che calcoli gli orari in
 * modo leggermente diverso, ed è per questo che l'anteprima è affidabile.
 */

import React, { useMemo, useState } from 'react';
import {
  Clapperboard, Lock, LockOpen, Loader2, RefreshCw, Trash2, TriangleAlert,
} from 'lucide-react';
import styles from './Programmazione.module.css';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { ScheduledShow } from '@/services/scheduling/engine';
import type { DayOccupancy } from '@/actions/planningActions';
import {
  BAND_LABELS, MINUTES_PER_DAY, OPENING_MINUTE, daysBetweenISO, type Band,
} from '@/services/scheduling/times';
import { dayLabel, showKey, type Pick } from './types';

const BAND_CLASS: Record<Band, string> = {
  matinee: styles.bandMatinee,
  afternoon: styles.bandAfternoon,
  evening: styles.bandEvening,
  night: styles.bandNight,
};

interface Props {
  shows: ScheduledShow[];
  warnings: string[];
  existing: DayOccupancy[];
  picks: Map<string, Pick>;
  busy: boolean;
  onToggleLock: (key: string) => void;
  onDelete: (key: string) => void;
  onMove: (show: ScheduledShow, desiredStartMinute: number) => void;
  onReplicasChange: (tmdbId: string, replicas: number) => void;
  onRegenerate: () => void;
}

/** 'HH:mm' → minuti dalla mezzanotte, o null se non è un orario. */
function parseClock(v: string): number | null {
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export default function StepCalendar({
  shows, warnings, existing, picks, busy,
  onToggleLock, onDelete, onMove, onReplicasChange, onRegenerate,
}: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  /** Giorni del piano, con dentro sia gli spettacoli nuovi sia quelli esistenti. */
  const days = useMemo(() => {
    const map = new Map<string, { date: string; fresh: ScheduledShow[]; existing: DayOccupancy['shows'] }>();
    for (const d of existing) map.set(d.date, { date: d.date, fresh: [], existing: d.shows });
    for (const s of shows) {
      if (!map.has(s.day)) map.set(s.day, { date: s.day, fresh: [], existing: [] });
      map.get(s.day)!.fresh.push(s);
    }
    return [...map.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, fresh: [...d.fresh].sort((a, b) => a.startMinute - b.startMinute) }));
  }, [shows, existing]);

  /** Quante volte ogni film compare nel piano, per il pannello laterale. */
  const perFilm = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of shows) counts.set(s.tmdbId, (counts.get(s.tmdbId) ?? 0) + 1);
    return [...picks.values()].map((p) => ({
      pick: p,
      count: counts.get(p.film.tmdbId!) ?? 0,
    }));
  }, [shows, picks]);

  const commitTime = (show: ScheduledShow) => {
    const parsed = parseClock(editValue);
    setEditing(null);
    if (parsed == null) return;
    // Un orario prima dell'apertura è la coda della nottata: appartiene alla
    // stessa serata ma alla data di calendario successiva.
    const dayStart = show.startMinute - (show.startMinute % MINUTES_PER_DAY);
    const programmingDayStart =
      (show.startMinute % MINUTES_PER_DAY) < OPENING_MINUTE ? dayStart - MINUTES_PER_DAY : dayStart;
    const desired = programmingDayStart + parsed + (parsed < OPENING_MINUTE ? MINUTES_PER_DAY : 0);
    if (desired !== show.startMinute) onMove(show, desired);
  };

  const dropOnDay = (targetDate: string) => {
    if (!dragging) return;
    const show = shows.find((s) => showKey(s) === dragging);
    setDragging(null);
    if (!show || show.day === targetDate) return;
    const dayDelta = daysBetweenISO(show.day, targetDate);
    // Stesso orario, giorno diverso: il motore poi lo aggancia al minuto
    // elegante libero più vicino, o rifiuta se lì non ci sta.
    onMove(show, show.startMinute + dayDelta * MINUTES_PER_DAY);
  };

  return (
    <main className={styles.stepBody}>
      {warnings.length > 0 && (
        <div className={styles.warnings}>
          {warnings.map((w, i) => <div key={i}><TriangleAlert size={14} /> {w}</div>)}
        </div>
      )}

      <div className={styles.calendarLayout}>
        {/* ── Pannello laterale: repliche per film ────────────────────── */}
        <aside className={styles.sidePanel}>
          <div className={styles.sidePanelHead}>
            <h3>Repliche</h3>
            <button className={styles.ghostBtnSmall} onClick={onRegenerate} disabled={busy}>
              {busy ? <Loader2 size={13} className={styles.spin} /> : <RefreshCw size={13} />} Rigenera
            </button>
          </div>
          <p className={styles.sideHint}>
            Cambiare un numero ricalcola il piano lasciando fermo tutto ciò che hai bloccato con 🔒.
          </p>
          {perFilm.map(({ pick, count }) => {
            const poster = getTMDBImageUrl(pick.film.posterPath, 'w92');
            return (
              <div key={pick.film.tmdbId} className={styles.sideFilm}>
                <div className={styles.sidePoster}>
                  {poster ? <img src={poster} alt="" /> : <Clapperboard size={14} />}
                </div>
                <span className={styles.sideTitle} title={pick.film.title}>{pick.film.title}</span>
                <div className={styles.stepper}>
                  <button
                    onClick={() => onReplicasChange(pick.film.tmdbId!, Math.max(count - 1, 0))}
                    disabled={busy || count === 0}
                    aria-label="Una replica in meno"
                  >−</button>
                  <b>{count}</b>
                  <button
                    onClick={() => onReplicasChange(pick.film.tmdbId!, count + 1)}
                    disabled={busy}
                    aria-label="Una replica in più"
                  >+</button>
                </div>
              </div>
            );
          })}
        </aside>

        {/* ── Colonne-giorno ──────────────────────────────────────────── */}
        <div className={styles.calendarGrid}>
          {days.map((d) => (
            <section
              key={d.date}
              className={`${styles.calDay} ${dragging ? styles.calDayDroppable : ''}`}
              onDragOver={(e) => { if (dragging) e.preventDefault(); }}
              onDrop={() => dropOnDay(d.date)}
            >
              <header className={styles.calDayHead}>
                <span>{dayLabel(d.date)}</span>
                <span className={styles.calDayCount}>
                  {d.fresh.length > 0 ? `+${d.fresh.length}` : '—'}
                </span>
              </header>

              <div className={styles.calDayBody}>
                {d.existing.map((s, i) => (
                  <div key={`ex-${s.pretixId ?? i}`} className={styles.calExisting} title="Proiezione già esistente: non si tocca">
                    <Lock size={10} /> <b>{s.time}</b> <span>{s.title}</span>
                  </div>
                ))}

                {d.fresh.map((s) => {
                  const key = showKey(s);
                  const poster = getTMDBImageUrl(s.posterPath ?? null, 'w92');
                  return (
                    <article
                      key={key}
                      className={`${styles.calShow} ${s.locked ? styles.calShowLocked : ''} ${dragging === key ? styles.calShowDragging : ''}`}
                      draggable={!busy}
                      onDragStart={() => setDragging(key)}
                      onDragEnd={() => setDragging(null)}
                    >
                      <div className={styles.calShowTop}>
                        {editing === key ? (
                          <input
                            className={styles.timeInput}
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitTime(s)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitTime(s);
                              if (e.key === 'Escape') setEditing(null);
                            }}
                          />
                        ) : (
                          <button
                            className={styles.calShowTime}
                            onClick={() => { setEditing(key); setEditValue(s.time); }}
                            title="Cambia orario"
                            disabled={busy}
                          >
                            {s.time}
                          </button>
                        )}
                        <span className={`${styles.bandTag} ${BAND_CLASS[s.band]}`}>{BAND_LABELS[s.band]}</span>
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

                      <div className={styles.calShowActions}>
                        <button
                          onClick={() => onToggleLock(key)}
                          title={s.locked ? 'Sbloccalo: i ricalcoli potranno spostarlo' : 'Bloccalo: i ricalcoli non lo sposteranno'}
                          className={s.locked ? styles.actionOn : ''}
                        >
                          {s.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                        </button>
                        <button onClick={() => onDelete(key)} title="Togli dal piano" className={styles.actionDanger}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </article>
                  );
                })}

                {d.fresh.length === 0 && d.existing.length === 0 && (
                  <div className={styles.calDayEmpty}>niente in questa giornata</div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
