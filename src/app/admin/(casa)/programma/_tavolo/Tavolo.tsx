'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { catalogPreviewTmdb } from '@/actions/catalogActions';
import { planningFindSlots, planningSnapShow, type SlotProposal } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import type { ScheduledShow } from '@/services/scheduling/engine';
import { MINUTES_PER_DAY, OPENING_MINUTE, daysBetweenISO, formatClock } from '@/services/scheduling/times';
import type { CatalogItem } from '../wizard/types';
import BlockPanel, { type MoveIntent } from './BlockPanel';
import CatalogDrawer from './CatalogDrawer';
import CommitBar from './CommitBar';
import DraftPanel from './DraftPanel';
import {
  addShow,
  draftBlocksOn,
  findDraft,
  rebase,
  replaceShow,
  showFromSlot,
  showsFor,
  visibleSlots,
  withoutCommitted,
} from './draft';
import { minuteAt, place, ticks } from './geometry';
import { dayShort, periodLabel } from './labels';
import type { TavoloData } from './load';
import { SPANS, shiftFrom, toSearch, type Span } from './query';
import { useCommit } from './useCommit';
import { useDraft } from './useDraft';
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

function runtimeOf(f: CatalogItem | null): number {
  return f ? f.runtime ?? f.durationMin ?? 0 : 0;
}

export default function Tavolo({ data }: { data: TavoloData }) {
  const router = useRouter();
  const toast = useToast();
  const isMobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE).matches, () => false);
  const [selected, setSelected] = useState<string | null>(null);
  const [intent, setIntent] = useState<MoveIntent | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [film, setFilm] = useState<CatalogItem | null>(null);
  const [catalogSheet, setCatalogSheet] = useState(false);
  const [slotResult, setSlotResult] = useState<{ key: string; slots: SlotProposal[]; reason?: string } | null>(null);
  /** Dove hai afferrato il blocco, in minuti dal suo inizio: il film non "salta" al rilascio. */
  const grabMinutes = useRef(0);
  /** I film del catalogo che si stanno trascinando, per riconoscerli al rilascio. */
  const films = useRef(new Map<string, CatalogItem>());

  const { week, roomId } = data;
  const { draft, savedAt, update, discard } = useDraft(roomId, data.from);
  const commit = useCommit(roomId, (created) => {
    update((d) => withoutCommitted(d, created));
    router.refresh();
  });

  const found = selected && week ? findBlock(week, selected) : null;
  const draftShow = selected?.startsWith('d:') && draft ? findDraft(draft, selected) : null;
  const targetDays = week ? week.days.filter((d) => !d.isPast).map((d) => d.date) : [];

  // ── Posti accesi per il film scelto ────────────────────────────────────
  const slotWanted = film?.tmdbId && roomId !== null ? `${film.tmdbId}@${roomId}@${data.from}@${data.days}` : null;
  useEffect(() => {
    if (!slotWanted || !film?.tmdbId || roomId === null) return;
    let cancelled = false;
    planningFindSlots({ seatingPlanId: roomId, tmdbId: film.tmdbId, fromDate: data.from, maxDays: data.days, horizonDays: data.days })
      .then((res) => {
        if (!cancelled) setSlotResult({ key: slotWanted, slots: res.days.flatMap((d) => d.slots), reason: res.reason });
      })
      .catch(() => {
        if (!cancelled) setSlotResult({ key: slotWanted, slots: [], reason: 'Non sono riuscito a leggere la sala.' });
      });
    return () => {
      cancelled = true;
    };
  }, [slotWanted, film?.tmdbId, roomId, data.from, data.days]);

  const lit = useMemo(
    () => (draft && film && slotResult?.key === slotWanted ? visibleSlots(slotResult.slots, draft, runtimeOf(film)) : []),
    [draft, film, slotResult, slotWanted],
  );
  const litLoading = Boolean(film && slotWanted && slotResult?.key !== slotWanted);

  // ── Navigazione ────────────────────────────────────────────────────────
  const go = (patch: Partial<{ room: number; from: string; days: Span; onlyEmpty: boolean }>, replace = false) => {
    if (roomId === null) return;
    const next = { room: roomId, from: data.from, days: data.days, onlyEmpty: data.onlyEmpty, ...patch };
    setSelected(null);
    setIntent(null);
    const url = `/admin/programma${toSearch(next)}`;
    if (replace) router.replace(url);
    else router.push(url);
  };

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

  // Un trascinamento lasciato fuori dalla settimana non deve lasciare le righe accese.
  useEffect(() => {
    const reset = () => setDragKey(null);
    window.addEventListener('dragend', reset);
    return () => window.removeEventListener('dragend', reset);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      setSelected(null);
      setIntent(null);
      setFilm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const chooseRoom = (id: number) => {
    try {
      localStorage.setItem('defaultSalaId', String(id));
    } catch {
      /* vale solo per questa visita */
    }
    go({ room: id });
  };

  const close = () => {
    setSelected(null);
    setIntent(null);
  };

  const chooseFilm = (f: CatalogItem | null) => {
    setFilm(f);
    setCatalogSheet(false);
    if (f) {
      if (f.tmdbId) films.current.set(f.tmdbId, f);
      setSelected(null);
    }
  };

  // ── Bozza: mettere, spostare ───────────────────────────────────────────
  const globalMinute = (day: string, minute: number) => daysBetweenISO(data.from, day) * MINUTES_PER_DAY + minute;

  const snap = async (show: ScheduledShow, desired: number) => {
    if (roomId === null || !draft) return null;
    const res = await planningSnapShow(show, desired, {
      seatingPlanId: roomId,
      startDate: data.from,
      days: data.days,
      otherShows: showsFor(draft, data.from),
    });
    if (!res.show) toast(res.reason ?? 'Qui non c’è spazio.', 'alarm');
    return res.show;
  };

  const placeFilm = async (f: CatalogItem, day: string, minute: number) => {
    const runtime = runtimeOf(f);
    if (!f.tmdbId || runtime <= 0) {
      toast('Di questo film non conosco la durata: non so dove metterlo.', 'alarm');
      return;
    }
    const m = Math.max(minute, OPENING_MINUTE);
    const start = globalMinute(day, m);
    const skeleton: ScheduledShow = {
      tmdbId: f.tmdbId,
      title: f.title,
      runtime,
      posterPath: f.posterPath ?? undefined,
      day,
      date: day,
      time: formatClock(m),
      endTime: formatClock(m + runtime),
      startMinute: start,
      endMinute: start + runtime,
      band: 'evening',
      locked: true,
    };
    const placed = await snap(skeleton, start);
    if (!placed) return;
    update((d) => addShow(d, placed, f));
    toast(`«${f.title}» in bozza, ${dayShort(placed.day)} alle ${placed.time}.`, 'ok');
  };

  const moveDraft = async (key: string, day: string, minute: number) => {
    const show = draft ? findDraft(draft, key) : null;
    if (!show) return;
    const placed = await snap(rebase(show, data.from), globalMinute(day, Math.max(minute, OPENING_MINUTE)));
    if (!placed) return;
    update((d) => replaceShow(d, key, placed));
    setSelected(null);
  };

  const addSlot = (slot: SlotProposal) => {
    if (!film?.tmdbId) return;
    const show = showFromSlot({ tmdbId: film.tmdbId, title: film.title, runtime: runtimeOf(film), posterPath: film.posterPath ?? undefined }, slot);
    update((d) => addShow(d, show, film));
    toast(`«${film.title}» in bozza, ${dayShort(slot.day)} alle ${slot.time}.`, 'ok');
  };

  const drop = (e: React.DragEvent<HTMLDivElement>, day: TavoloDay) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData('text/plain') || dragKey;
    setDragKey(null);
    if (!payload || !week || day.isPast) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const axisLength = week.axis.end - week.axis.start;
    const minute = minuteAt((e.clientX - rect.left) / rect.width - grabMinutes.current / axisLength, week.axis);
    grabMinutes.current = 0;

    if (payload.startsWith('film:')) {
      const f = films.current.get(payload.slice(5));
      if (f) void placeFilm(f, day.date, minute);
      return;
    }
    if (payload.startsWith('d:')) {
      void moveDraft(payload, day.date, minute);
      return;
    }
    setSelected(payload);
    setIntent({ day: day.date, time: formatClock(minute) });
  };

  const startDrag = (e: React.DragEvent<HTMLElement>, key: string, start: number, end: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    grabMinutes.current = ((e.clientX - r.left) / r.width) * (end - start);
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
    setDragKey(key);
  };

  const replica = async (tmdbId: string) => {
    try {
      const f = await catalogPreviewTmdb(tmdbId);
      if (!f) throw new Error();
      chooseFilm(f as unknown as CatalogItem);
      toast('Scegli uno dei posti accesi, o trascina il film dal catalogo.');
    } catch {
      toast('Non riesco a leggere questo film.', 'alarm');
    }
  };

  const changed = (opts?: { keepOpen?: boolean }) => {
    if (!opts?.keepOpen) close();
    router.refresh();
  };

  // ── Cassetto ───────────────────────────────────────────────────────────
  const gapMinutes = useMemo(() => (week ? week.days.flatMap((d) => (d.isPast ? [] : d.gaps.map((g) => g.minutes))) : []), [week]);
  const inDraft = useMemo(() => new Set(draft?.shows.map((s) => s.tmdbId) ?? []), [draft]);
  const existingOn = (day: string) => week?.days.find((d) => d.date === day)?.blocks.map((b) => ({ start: b.start, end: b.end })) ?? [];

  const catalog = (
    <CatalogDrawer
      gaps={gapMinutes}
      selected={film?.tmdbId ?? null}
      inDraft={inDraft}
      onSelect={chooseFilm}
      onDragFilm={(f) => {
        if (f.tmdbId) films.current.set(f.tmdbId, f);
        grabMinutes.current = 0;
        setDragKey(`film:${f.tmdbId}`);
      }}
    />
  );

  const panel =
    found && roomId !== null ? (
      <BlockPanel
        key={`${found.block.key}@${intent?.day ?? ''}${intent?.time ?? ''}`}
        block={found.block}
        day={found.day}
        targetDays={targetDays}
        roomId={roomId}
        from={data.from}
        intent={intent}
        onClose={close}
        onChanged={changed}
        onReplica={replica}
      />
    ) : draftShow && draft && roomId !== null ? (
      <DraftPanel
        key={selected!}
        show={draftShow}
        draft={draft}
        roomId={roomId}
        from={data.from}
        targetDays={targetDays}
        existingOn={existingOn}
        update={update}
        onReselect={setSelected}
      />
    ) : null;

  const title = data.days === 1 ? 'La giornata' : data.days === 7 ? 'La settimana' : 'Il periodo';

  return (
    <div className={styles.room}>
      <header className={styles.head}>
        <div>
          <div className={styles.controls}>
            <select className={styles.select} value={roomId ?? ''} onChange={(e) => chooseRoom(Number(e.target.value))} aria-label="Sala">
              {data.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
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
            <select className={styles.select} value={data.days} onChange={(e) => go({ days: Number(e.target.value) as Span })} aria-label="Ampiezza">
              {SPANS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <h1 className={styles.title}>{title}</h1>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" className={styles.mobileOnly} onClick={() => setCatalogSheet(true)}>
            <Plus size={14} /> Film
          </Button>
          <Button variant={data.onlyEmpty ? 'fill' : 'ghost'} onClick={() => go({ onlyEmpty: !data.onlyEmpty }, true)}>Solo vuote</Button>
          <Button href={PRETIX_URL} variant="ghost">Pretix ↗</Button>
          <Button href={`/admin/programma/wizard${roomId !== null ? `?room=${roomId}` : ''}`} variant="ghost">Wizard</Button>
        </div>
      </header>

      {film && (
        <div className={styles.filmBar}>
          <span>
            <b>{film.title}</b>{' '}
            {litLoading
              ? '· cerco dove ci sta…'
              : lit.length
                ? `· ${lit.length} ${lit.length === 1 ? 'posto acceso' : 'posti accesi'}: clicca quello che vuoi`
                : `· ${slotResult?.reason ?? 'nessun posto libero in questo periodo'}`}
          </span>
          <button type="button" onClick={() => setFilm(null)}>Lascia stare</button>
        </div>
      )}

      {!week ? (
        <p className={styles.empty}>
          {data.rooms.length === 0
            ? 'Non trovo le sale su Pretix: forse in questo momento non risponde. Riprova fra poco.'
            : 'Nessuna sala scelta.'}
        </p>
      ) : (
        <div className={styles.table}>
          <div className={styles.timeline}>
            <div className={styles.ruler} aria-hidden>
              <span />
              <div className={styles.ticks}>
                {ticks(week.axis).map((t) => <span key={t.minute} style={{ left: `${t.left}%` }}>{t.label}</span>)}
              </div>
            </div>

            {week.days.map((day) => {
              const drafts = draft ? draftBlocksOn(draft, day.date) : [];
              const slots = lit.filter((s) => s.day === day.date);
              return (
                <div key={day.date} className={styles.day} data-past={day.isPast || undefined} data-weekend={day.isWeekend || undefined}>
                  <span className={styles.dayLabel}>{dayShort(day.date)}</span>

                  <div
                    className={styles.track}
                    data-drop={dragKey && !day.isPast ? '' : undefined}
                    onDragOver={(e) => { if (dragKey && !day.isPast) e.preventDefault(); }}
                    onDrop={(e) => drop(e, day)}
                    onClick={(e) => { if (e.target === e.currentTarget) close(); }}
                  >
                    {day.gaps.map((g) => {
                      const pos = place(g.start, g.end, week.axis);
                      return <span key={`gap-${g.start}`} className={styles.gap} style={{ left: `${pos.left}%`, width: `${pos.width}%` }} title={`Libero ${g.from} – ${g.to}`} />;
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
                          onDragStart={(e) => startDrag(e, b.key, b.start, b.end)}
                          onDragEnd={() => setDragKey(null)}
                          onClick={() => { setSelected(b.key); setIntent(null); }}
                          title={`${b.time} ${b.title}`}
                        >
                          <span className={styles.blockTime}>{b.time}</span>
                          <span className={styles.blockTitle}>{b.title}</span>
                        </button>
                      );
                    })}
                    {drafts.map((b) => {
                      const pos = place(b.start, b.end, week.axis);
                      return (
                        <button
                          key={b.key}
                          type="button"
                          className={`${styles.block} ${styles.draft}`}
                          style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                          data-selected={selected === b.key || undefined}
                          draggable={!day.isPast}
                          onDragStart={(e) => startDrag(e, b.key, b.start, b.end)}
                          onDragEnd={() => setDragKey(null)}
                          onClick={() => { setSelected(b.key); setIntent(null); }}
                          title={`In bozza: ${b.show.time} ${b.show.title}`}
                        >
                          <span className={styles.blockTime}>{b.show.time}</span>
                          <span className={styles.blockTitle}>{b.show.title}</span>
                        </button>
                      );
                    })}
                    {slots.map((s) => {
                      const pos = place(s.start, s.end, week.axis);
                      return (
                        <button
                          key={`slot-${s.day}-${s.time}`}
                          type="button"
                          className={styles.slot}
                          style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                          onClick={() => addSlot(s)}
                          title={`Metti «${film?.title}» alle ${s.time}`}
                        >
                          + {s.time}
                        </button>
                      );
                    })}
                  </div>

                  <ol className={styles.dayList}>
                    {day.blocks.length === 0 && drafts.length === 0 && slots.length === 0 && <li className={styles.dayListEmpty}>Nessuno spettacolo</li>}
                    {day.blocks.map((b) => (
                      <li key={b.key}>
                        <button type="button" onClick={() => { setSelected(b.key); setIntent(null); }} data-dim={(data.onlyEmpty && b.sold !== 0) || undefined}>
                          <span className={styles.blockTime}>{b.time}</span>
                          <span className={styles.listTitle}>{b.title}</span>
                          <span className={styles.listSeats}>{seatNote(b)}</span>
                        </button>
                      </li>
                    ))}
                    {drafts.map((b) => (
                      <li key={b.key}>
                        <button type="button" data-draft="" onClick={() => setSelected(b.key)}>
                          <span className={styles.blockTime}>{b.show.time}</span>
                          <span className={styles.listTitle}>{b.show.title}</span>
                          <span className={styles.listSeats}>bozza</span>
                        </button>
                      </li>
                    ))}
                    {slots.map((s) => (
                      <li key={`slot-${s.time}`}>
                        <button type="button" data-slot="" onClick={() => addSlot(s)}>
                          <span className={styles.blockTime}>{s.time}</span>
                          <span className={styles.listTitle}>+ {film?.title}</span>
                          <span className={styles.listSeats}>metti qui</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>

          <aside className={styles.side}>{!isMobile && (panel ?? catalog)}</aside>
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

      {draft && <CommitBar draft={draft} savedAt={savedAt} commit={commit} onDiscard={() => void discard()} />}

      {isMobile && panel && (
        <Dialog open onClose={close} title="Spettacolo" variant="sheet">
          {panel}
        </Dialog>
      )}
      {isMobile && catalogSheet && !panel && (
        <Dialog open onClose={() => setCatalogSheet(false)} title="Catalogo" variant="sheet">
          <div className={styles.sheetCatalog}>{catalog}</div>
        </Dialog>
      )}
    </div>
  );
}
