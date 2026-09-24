'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { formatClock } from '@/services/scheduling/times';
import BlockPanel, { type MoveIntent } from './BlockPanel';
import { minuteAt, place, ticks } from './geometry';
import { dayShort, periodLabel } from './labels';
import type { TavoloData } from './load';
import { SPANS, shiftFrom, toSearch, type Span } from './query';
import { findBlock, type TavoloBlock, type TavoloDay } from './week';
import styles from './Tavolo.module.css';

const PRETIX_URL = 'https://pretix.eu/vestri/npkez/';
const MOBILE = '(max-width: 767px)';

function subscribeMobile(onChange: () => void) {
  const m = window.matchMedia(MOBILE);
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
}

function seatNote(b: TavoloBlock): string {
  if (b.soldOut) return 'esaurito';
  if (b.sold === null || b.total === null) return '';
  return `${b.sold}/${b.total}`;
}

export default function Tavolo({ data }: { data: TavoloData }) {
  const router = useRouter();
  const isMobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE).matches, () => false);
  const [selected, setSelected] = useState<string | null>(null);
  const [intent, setIntent] = useState<MoveIntent | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  /** Dove hai afferrato il blocco, in minuti dal suo inizio: il film non "salta" al rilascio. */
  const grabMinutes = useRef(0);

  const { week, roomId } = data;
  const found = selected && week ? findBlock(week, selected) : null;
  const targetDays = week ? week.days.filter((d) => !d.isPast).map((d) => d.date) : [];

  const go = (patch: Partial<{ room: number; from: string; days: Span; onlyEmpty: boolean }>, replace = false) => {
    if (roomId === null) return;
    const next = { room: roomId, from: data.from, days: data.days, onlyEmpty: data.onlyEmpty, ...patch };
    setSelected(null);
    setIntent(null);
    const url = `/admin/programma${toSearch(next)}`;
    if (replace) router.replace(url);
    else router.push(url);
  };

  // Senza sala nell'indirizzo si usa quella scelta su questo computer, come nel wizard.
  useEffect(() => {
    if (data.roomFromParam) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('defaultSalaId');
    } catch {
      /* archivio del browser non disponibile */
    }
    const id = Number(saved);
    if (id && id !== roomId && data.rooms.some((r) => r.id === id)) {
      router.replace(`/admin/programma${toSearch({ room: id, from: data.from, days: data.days, onlyEmpty: data.onlyEmpty })}`);
    }
  }, [data.roomFromParam, data.rooms, data.from, data.days, data.onlyEmpty, roomId, router]);

  // Esc chiude il cassetto, a meno che non ci sia una finestra aperta sopra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      setSelected(null);
      setIntent(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const chooseRoom = (id: number) => {
    try {
      localStorage.setItem('defaultSalaId', String(id));
    } catch {
      /* pazienza: vale solo per questa visita */
    }
    go({ room: id });
  };

  const open = (key: string) => {
    setSelected(key);
    setIntent(null);
  };

  const drop = (e: React.DragEvent<HTMLDivElement>, day: TavoloDay) => {
    e.preventDefault();
    const key = dragKey ?? e.dataTransfer.getData('text/plain');
    setDragKey(null);
    if (!key || !week || day.isPast) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const axisLength = week.axis.end - week.axis.start;
    const minute = minuteAt((e.clientX - rect.left) / rect.width - grabMinutes.current / axisLength, week.axis);
    setSelected(key);
    setIntent({ day: day.date, time: formatClock(minute) });
  };

  const changed = (opts?: { keepOpen?: boolean }) => {
    if (!opts?.keepOpen) {
      setSelected(null);
      setIntent(null);
    }
    router.refresh();
  };

  const panel = found && roomId !== null && (
    <BlockPanel
      key={`${found.block.key}@${intent?.day ?? ''}${intent?.time ?? ''}`}
      block={found.block}
      day={found.day}
      targetDays={targetDays}
      roomId={roomId}
      from={data.from}
      intent={intent}
      onClose={() => { setSelected(null); setIntent(null); }}
      onChanged={changed}
    />
  );

  const title = data.days === 1 ? 'La giornata' : data.days === 7 ? 'La settimana' : 'Il periodo';

  return (
    <div className={styles.room}>
      <header className={styles.head}>
        <div>
          <div className={styles.controls}>
            <select
              className={styles.select}
              value={roomId ?? ''}
              onChange={(e) => chooseRoom(Number(e.target.value))}
              aria-label="Sala"
            >
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <div className={styles.period}>
              <button type="button" onClick={() => go({ from: shiftFrom(data.from, data.days, -1) })} aria-label="Periodo precedente">
                <ChevronLeft size={15} />
              </button>
              <span>{periodLabel(data.from, data.days)}</span>
              <button type="button" onClick={() => go({ from: shiftFrom(data.from, data.days, 1) })} aria-label="Periodo successivo">
                <ChevronRight size={15} />
              </button>
            </div>
            <select
              className={styles.select}
              value={data.days}
              onChange={(e) => go({ days: Number(e.target.value) as Span })}
              aria-label="Ampiezza"
            >
              {SPANS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <h1 className={styles.title}>{title}</h1>
        </div>
        <div className={styles.actions}>
          <Button variant={data.onlyEmpty ? 'fill' : 'ghost'} onClick={() => go({ onlyEmpty: !data.onlyEmpty }, true)}>
            Solo vuote
          </Button>
          <Button href={PRETIX_URL} variant="ghost">Pretix ↗</Button>
          <Button href={`/admin/programma/wizard${roomId !== null ? `?room=${roomId}` : ''}`} variant="fill">+ Programma</Button>
        </div>
      </header>

      {!week ? (
        <p className={styles.empty}>
          {data.rooms.length === 0
            ? 'Non trovo le sale su Pretix: forse in questo momento non risponde. Riprova fra poco.'
            : 'Nessuna sala scelta.'}
        </p>
      ) : (
        <div className={styles.table} data-open={found ? '' : undefined}>
          <div className={styles.timeline}>
            <div className={styles.ruler} aria-hidden>
              <span />
              <div className={styles.ticks}>
                {ticks(week.axis).map((t) => (
                  <span key={t.minute} style={{ left: `${t.left}%` }}>{t.label}</span>
                ))}
              </div>
            </div>

            {week.days.map((day) => (
              <div key={day.date} className={styles.day} data-past={day.isPast || undefined} data-weekend={day.isWeekend || undefined}>
                <span className={styles.dayLabel}>{dayShort(day.date)}</span>

                <div
                  className={styles.track}
                  data-drop={dragKey && !day.isPast ? '' : undefined}
                  onDragOver={(e) => { if (dragKey && !day.isPast) e.preventDefault(); }}
                  onDrop={(e) => drop(e, day)}
                  onClick={(e) => { if (e.target === e.currentTarget) { setSelected(null); setIntent(null); } }}
                >
                  {day.gaps.map((g) => {
                    const pos = place(g.start, g.end, week.axis);
                    return (
                      <span
                        key={`gap-${g.start}`}
                        className={styles.gap}
                        style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                        title={`Libero ${g.from} – ${g.to}`}
                      />
                    );
                  })}
                  {day.blocks.map((b) => {
                    const pos = place(b.start, b.end, week.axis);
                    return (
                      <button
                        key={b.key}
                        type="button"
                        className={styles.block}
                        style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                        data-selected={selected === b.key || undefined}
                        data-locked={!b.touchable || undefined}
                        data-dim={(data.onlyEmpty && b.sold !== 0) || undefined}
                        data-soldout={b.soldOut || undefined}
                        draggable={b.touchable}
                        onDragStart={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          grabMinutes.current = ((e.clientX - r.left) / r.width) * (b.end - b.start);
                          e.dataTransfer.setData('text/plain', b.key);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragKey(b.key);
                        }}
                        onDragEnd={() => setDragKey(null)}
                        onClick={() => open(b.key)}
                        title={`${b.time} ${b.title}`}
                      >
                        <span className={styles.blockTime}>{b.time}</span>
                        <span className={styles.blockTitle}>{b.title}</span>
                      </button>
                    );
                  })}
                </div>

                <ol className={styles.dayList}>
                  {day.blocks.length === 0 && <li className={styles.dayListEmpty}>Nessuno spettacolo</li>}
                  {day.blocks.map((b) => (
                    <li key={b.key}>
                      <button
                        type="button"
                        onClick={() => open(b.key)}
                        data-dim={(data.onlyEmpty && b.sold !== 0) || undefined}
                      >
                        <span className={styles.blockTime}>{b.time}</span>
                        <span className={styles.listTitle}>{b.title}</span>
                        <span className={styles.listSeats}>{seatNote(b)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <aside className={styles.side}>
            {!isMobile && panel ? (
              panel
            ) : (
              <div className={styles.legend}>
                <p className={styles.legendTitle}>Il tavolo</p>
                <p>Clic su uno spettacolo per aprirlo. Trascinalo su un altro punto della settimana per spostarlo: prima di scrivere su Pretix ti dico cosa comporta.</p>
                <ul>
                  <li><span className={styles.swatchBlock} /> in sala, su Pretix</li>
                  <li><span className={styles.swatchSold} /> tutto esaurito</li>
                  <li><span className={styles.swatchGap} /> buco dove ci sta un film</li>
                </ul>
                <p className={styles.legendNote}>Per programmare film nuovi, “+ Programma” apre il wizard. Nella prossima tappa il catalogo arriva qui.</p>
              </div>
            )}
          </aside>
        </div>
      )}

      {week && (
        <footer className={styles.foot}>
          <span>
            {week.totalShows} {week.totalShows === 1 ? 'spettacolo' : 'spettacoli'} · {week.filmGaps}{' '}
            {week.filmGaps === 1 ? 'buco dove ci sta un film' : 'buchi dove ci sta un film'}
          </span>
          <span className={styles.footHint}>Esc chiude il cassetto</span>
        </footer>
      )}

      {isMobile && found && (
        <Dialog open onClose={() => { setSelected(null); setIntent(null); }} title={found.block.title} variant="sheet">
          {panel}
        </Dialog>
      )}
    </div>
  );
}
