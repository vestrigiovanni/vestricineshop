'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { planningCheckManualSlot, type ManualSlotCheck } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import { useToast } from '@/components/cabina/Toast';
import { PROJECTION_SPECS, type ProjectionSpecCode } from '@/constants/projectionSpecs';
import type { ScheduledShow } from '@/services/scheduling/engine';
import { commitKey } from './types';
import {
  clashesWithDraft,
  draftKey,
  maxRuntimeAt,
  minuteOfDay,
  removeShow,
  replaceShow,
  setSpecs,
  showFromSlot,
  swapFilm,
  type Draft,
} from './draft';
import { dayShort } from './labels';
import SwapDialog from './SwapDialog';
import styles from './BlockPanel.module.css';

interface Props {
  show: ScheduledShow;
  draft: Draft;
  roomId: number;
  from: string;
  targetDays: string[];
  existingOn: (day: string) => { start: number; end: number }[];
  update: (change: (d: Draft) => Draft) => void;
  onReselect: (key: string | null) => void;
}

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function normalizeClock(v: string): string | null {
  const m = v.trim().match(CLOCK);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

export default function DraftPanel({ show, draft, roomId, from, targetDays, existingOn, update, onReselect }: Props) {
  const toast = useToast();
  const key = draftKey(show);
  const [moveDay, setMoveDay] = useState(show.day);
  const [moveTime, setMoveTime] = useState(show.time);
  const [result, setResult] = useState<{ key: string; check: ManualSlotCheck | null; error?: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const request = useRef(0);

  const clock = normalizeClock(moveTime);
  const changed = moveDay !== show.day || (clock !== null && clock !== show.time);
  const wanted = changed && clock ? `${moveDay}@${clock}` : null;
  const checking = wanted !== null && result?.key !== wanted;
  const check = wanted !== null && result?.key === wanted ? result.check : null;

  useEffect(() => {
    if (!wanted || !clock) return;
    const id = ++request.current;
    const timer = window.setTimeout(async () => {
      try {
        const c = await planningCheckManualSlot({ seatingPlanId: roomId, tmdbId: show.tmdbId, day: moveDay, time: clock, fromDate: from });
        if (request.current === id) setResult({ key: wanted, check: c });
      } catch {
        if (request.current === id) setResult({ key: wanted, check: null, error: 'Non sono riuscito a leggere la sala. Riprova.' });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [wanted, clock, moveDay, roomId, from, show.tmdbId]);

  const slotStart = check?.slot ? minuteOfDay(check.slot) : null;
  const clash = check?.slot && slotStart !== null
    ? clashesWithDraft(draft, check.slot.day, slotStart, slotStart + show.runtime, key)
    : null;
  const conflicts = check?.conflicts ?? [];
  const needsConsent = (check?.soldTickets ?? 0) > 0;
  const canPlace = Boolean(check?.usable) && !clash && (!needsConsent || consent);

  const place = () => {
    if (!check?.slot || !canPlace) return;
    const next = showFromSlot(show, check.slot);
    update((d) =>
      replaceShow(d, key, next, {
        replaces: conflicts.map((c) => c.pretixId).filter((v): v is number => v != null),
        force: needsConsent,
        label: conflicts.map((c) => `«${c.title}» delle ${c.time}`).join(', ') || undefined,
        soldTickets: check.soldTickets,
        outsideHours: check.outsideHours,
      }),
    );
    onReselect(draftKey(next));
  };

  const pick = draft.picks[show.tmdbId];
  const specs = pick?.specs ?? [];
  const toggleSpec = (code: ProjectionSpecCode) =>
    update((d) => setSpecs(d, show.tmdbId, { specs: specs.includes(code) ? specs.filter((c) => c !== code) : [...specs, code] }));

  const siblings = draft.shows.filter((s) => s.tmdbId === show.tmdbId);
  const maxOne = maxRuntimeAt(draft, show.day, minuteOfDay(show), existingOn(show.day), key);
  const maxAll = Math.min(
    ...siblings.map((s) => maxRuntimeAt(draft, s.day, minuteOfDay(s), existingOn(s.day), draftKey(s))),
  );
  const exclude = [...new Set([...draft.shows.map((s) => s.tmdbId), ...draft.rejected])];
  const replacement = draft.replacements[commitKey(show)];

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.close} onClick={() => onReselect(null)} aria-label="Chiudi">
        <X size={16} />
      </button>

      <header>
        <p className={styles.kicker}>In bozza · non ancora in sala</p>
        <h2 className={styles.title}>{show.title}</h2>
        <p className={styles.meta}>
          {dayShort(show.day)} · <span className={styles.clock}>{show.time} – {show.endTime}</span> · {show.runtime}′
        </p>
        {replacement && replacement.replaces.length > 0 && (
          <p className={styles.warnText}>
            Sostituirà {replacement.label ?? 'uno spettacolo in sala'}
            {replacement.soldTickets > 0 ? `, con ${replacement.soldTickets} biglietti venduti` : ''}.
          </p>
        )}
        {replacement?.outsideHours && <p className={styles.warnText}>Esce dall’orario d’apertura: l’hai scelto tu.</p>}
      </header>

      <section className={styles.group}>
        <span className={styles.label}>Orario</span>
        <div className={styles.fields}>
          <select value={moveDay} onChange={(e) => { setMoveDay(e.target.value); setConsent(false); }} aria-label="Giorno">
            {targetDays.map((d) => <option key={d} value={d}>{dayShort(d)}</option>)}
          </select>
          <input value={moveTime} onChange={(e) => { setMoveTime(e.target.value); setConsent(false); }} inputMode="numeric" aria-label="Orario" aria-invalid={clock === null ? true : undefined} />
        </div>
        {!changed && <p className={styles.hint}>Scrivi un orario, anche occupato: ti dico cosa comporta. Oppure trascina il blocco.</p>}
        {clock === null && <p className={styles.alarmText}>Scrivi l’orario come 18:30.</p>}
        {checking && <p className={styles.hint}>Guardo la sala…</p>}
        {result?.error && wanted && <p className={styles.alarmText}>{result.error}</p>}
        {check && (
          <>
            <p className={check.usable && !clash ? (conflicts.length || check.outsideHours ? styles.warnText : styles.okText) : styles.alarmText}>
              {clash ? `Si scontra con «${clash.title}» delle ${clash.time}, anche lui in bozza.` : check.message}
            </p>
            {check.warning && !clash && <p className={styles.warnText}>{check.warning}</p>}
            {needsConsent && !clash && (
              <label className={styles.consent}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                Ho capito: alla conferma elimino {conflicts.length === 1 ? 'uno spettacolo' : `${conflicts.length} spettacoli`} con {check.soldTickets}{' '}
                {check.soldTickets === 1 ? 'biglietto venduto' : 'biglietti venduti'}.
              </label>
            )}
            {check.usable && !clash && (
              <Button variant={conflicts.length ? 'alarm' : 'fill'} onClick={place} disabled={!canPlace}>
                {conflicts.length
                  ? `Metti qui, al posto di ${conflicts.map((c) => `«${c.title}»`).join(' e ')}`
                  : `Metti a ${dayShort(moveDay)} ${check.slot?.time ?? clock}`}
              </Button>
            )}
          </>
        )}
      </section>

      <section className={styles.group}>
        <span className={styles.label}>Il film · vale per {siblings.length === 1 ? 'questo spettacolo' : `tutti e ${siblings.length} gli spettacoli`}</span>
        <div className={styles.specs}>
          {PROJECTION_SPECS.map((s) => (
            <label key={s.code} title={s.description}>
              <input type="checkbox" checked={specs.includes(s.code)} onChange={() => toggleSpec(s.code)} />
              {s.adminLabel}
            </label>
          ))}
        </div>
        <input
          className={styles.note}
          value={pick?.specsNote ?? ''}
          onChange={(e) => update((d) => setSpecs(d, show.tmdbId, { specsNote: e.target.value }))}
          placeholder="Nota di proiezione (es. copia restaurata)"
          aria-label="Nota di proiezione"
        />
      </section>

      <section className={styles.group}>
        <span className={styles.label}>Altro</span>
        <Button variant="ghost" onClick={() => setSwapOpen(true)}>⇄ Scambia il film</Button>
        <Button
          variant="alarm"
          onClick={() => {
            update((d) => removeShow(d, key));
            toast(`«${show.title}» tolto dalla bozza.`);
            onReselect(null);
          }}
        >
          Togli dalla bozza
        </Button>
      </section>

      {swapOpen && (
        <SwapDialog
          show={show}
          occurrences={siblings.length}
          maxOne={maxOne}
          maxAll={maxAll}
          exclude={exclude}
          onClose={() => setSwapOpen(false)}
          onSwap={(film, scope) => {
            setSwapOpen(false);
            update((d) => swapFilm(d, key, film, scope));
            toast(`Al posto di «${show.title}»: «${film.title}».`, 'ok');
            onReselect(draftKey({ tmdbId: film.tmdbId!, date: show.date, time: show.time }));
          }}
        />
      )}
    </div>
  );
}
