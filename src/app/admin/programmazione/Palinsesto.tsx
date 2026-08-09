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

import React, { useState } from 'react';
import { CalendarRange, Clapperboard, GripVertical, Loader2, Pencil, Trash2 } from 'lucide-react';
import styles from './Programmazione.module.css';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import {
  planningCheckMove,
  planningDeleteShow,
  planningMoveShow,
  type ExistingShow,
  type PeriodOccupancy,
} from '@/actions/planningActions';
import MovePanel, { type Pending } from './MovePanel';
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
  /** Da chiamare dopo ogni modifica: la sala non è più quella che avevamo letto. */
  onReload: () => void;
}

function saturationClass(s: number): string {
  if (s > 0.7) return styles.satHigh;
  if (s > 0.4) return styles.satMid;
  return styles.satLow;
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

export default function Palinsesto({
  rooms, roomId, onRoomChange,
  startDate, onStartDateChange,
  days, onDaysChange,
  occupancy, loading, onReload,
}: Props) {
  const total = occupancy?.totalShows ?? 0;

  const [dragging, setDragging] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Chiede al server cosa comporta, e apre il pannello mentre lo chiede. */
  const askMove = async (show: ExistingShow, fromDay: string, toDay: string, time: string) => {
    if (!show.pretixId || !roomId) return;
    setError(null);
    setPending({ kind: 'move', show, fromDay, toDay, time, check: null });
    try {
      const check = await planningCheckMove({
        seatingPlanId: roomId,
        pretixId: show.pretixId,
        day: toDay,
        time,
        fromDate: startDate,
      });
      // Se nel frattempo il pannello è stato chiuso o riaperto su un altro
      // spettacolo, questa risposta non riguarda più ciò che si sta guardando.
      setPending((p) =>
        p && p.kind === 'move' && p.show.pretixId === show.pretixId && p.time === time
          ? { ...p, check }
          : p
      );
    } catch (e) {
      console.error('[Palinsesto] controllo spostamento', e);
      setError('Non sono riuscito a leggere la sala. Riprova.');
    }
  };

  const confirmMove = async (opts: { replaces: number[]; force: boolean; allowOutsideHours: boolean }) => {
    if (!pending || pending.kind !== 'move' || !pending.show.pretixId || !roomId) return;
    setWorking(true);
    setError(null);
    try {
      const res = await planningMoveShow({
        seatingPlanId: roomId,
        pretixId: pending.show.pretixId,
        day: pending.toDay,
        time: pending.time,
        fromDate: startDate,
        replaces: opts.replaces,
        force: opts.force,
        allowOutsideHours: opts.allowOutsideHours,
      });
      if (!res.moved) {
        setError(res.error ?? 'Lo spostamento non è riuscito.');
        // Qualcosa può essere già stato eliminato: la vista va riletta comunque.
        if (res.deleted.length > 0) onReload();
        return;
      }
      setPending(null);
      onReload();
    } catch (e) {
      console.error('[Palinsesto] spostamento', e);
      setError('Lo spostamento non è riuscito. Ricarica il palinsesto e controlla.');
    } finally {
      setWorking(false);
    }
  };

  const confirmDelete = async (force: boolean) => {
    if (!pending || pending.kind !== 'delete' || !pending.show.pretixId) return;
    setWorking(true);
    setError(null);
    try {
      const res = await planningDeleteShow(pending.show.pretixId, force);
      if (!res.deleted) {
        // Non è un errore: è la rete di sicurezza. Il pannello ora sa quanti
        // biglietti ci sono sopra e può chiedere il consenso.
        setPending({ ...pending, refusal: { message: res.error ?? '', soldTickets: res.soldTickets } });
        return;
      }
      setPending(null);
      onReload();
    } catch (e) {
      console.error('[Palinsesto] eliminazione', e);
      setError("L'eliminazione non è riuscita. Ricarica il palinsesto e controlla.");
    } finally {
      setWorking(false);
    }
  };

  const commitTime = (show: ExistingShow, day: string) => {
    const value = editValue.trim();
    setEditing(null);
    if (parseClock(value) == null || value === show.time) return;
    askMove(show, day, day, value);
  };

  const dropOnDay = (targetDay: string) => {
    const id = dragging;
    setDragging(null);
    if (id == null) return;
    for (const d of occupancy?.daysDetail ?? []) {
      const show = d.shows.find((s) => s.pretixId === id);
      if (show) {
        if (d.date === targetDay) return;
        askMove(show, d.date, targetDay, show.time);
        return;
      }
    }
  };

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
          Trascina uno spettacolo su un altro giorno, o clicca l&apos;orario per riscriverlo.
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
                  className={`${styles.dayCol} ${d.isWeekend ? styles.dayWeekend : ''} ${d.isPast ? styles.dayPast : ''} ${dragging && !d.isPast ? styles.calDayDroppable : ''}`}
                  onDragOver={(e) => { if (dragging && !d.isPast) e.preventDefault(); }}
                  onDrop={() => { if (!d.isPast) dropOnDay(d.date); }}
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
                      // Senza id Pretix non è nostro: si vede, non si tocca.
                      const touchable = Boolean(s.pretixId) && !d.isPast;
                      return (
                        <article
                          key={s.pretixId ?? `x-${i}`}
                          className={`${styles.calShow} ${touchable ? '' : styles.palLocked} ${dragging === s.pretixId ? styles.calShowDragging : ''}`}
                          draggable={touchable}
                          onDragStart={() => { if (touchable) setDragging(s.pretixId!); }}
                          onDragEnd={() => setDragging(null)}
                        >
                          <div className={styles.calShowTop}>
                            {editing === s.pretixId ? (
                              <input
                                className={styles.timeInput}
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => commitTime(s, d.date)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitTime(s, d.date);
                                  if (e.key === 'Escape') setEditing(null);
                                }}
                              />
                            ) : (
                              <button
                                className={styles.calShowTime}
                                disabled={!touchable}
                                title={touchable ? 'Cambia orario' : undefined}
                                onClick={() => { setEditing(s.pretixId!); setEditValue(s.time); }}
                              >
                                {s.time}
                              </button>
                            )}
                            {touchable && <GripVertical size={13} opacity={0.4} />}
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

                          {touchable && (
                            <div className={styles.calShowActions}>
                              <button
                                onClick={() => { setEditing(s.pretixId!); setEditValue(s.time); }}
                                title="Cambia orario"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                className={styles.actionDanger}
                                title="Elimina questo spettacolo"
                                onClick={() => { setError(null); setPending({ kind: 'delete', show: s, day: d.date, refusal: null }); }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
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

      {pending && (
        <MovePanel
          // Rimontato a ogni apertura: senza, la spunta di consenso resterebbe
          // segnata da una decisione precedente.
          key={`${pending.kind}-${pending.show.pretixId}`}
          pending={pending}
          working={working}
          error={error}
          onCancel={() => { setPending(null); setError(null); }}
          onConfirmMove={confirmMove}
          onConfirmDelete={confirmDelete}
        />
      )}
    </main>
  );
}
