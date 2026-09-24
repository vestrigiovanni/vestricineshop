'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { adminListQuotas } from '@/actions/adminActions';
import { planningCheckMove, planningMoveShow, type MoveCheck } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import { useToast } from '@/components/cabina/Toast';
import DeleteDialog from './DeleteDialog';
import { dayLong, dayShort } from './labels';
import type { TavoloBlock, TavoloDay } from './week';
import styles from './BlockPanel.module.css';

export interface MoveIntent {
  day: string;
  time: string;
}

interface Quota {
  id: number;
  name: string | { it?: string };
  size: number | null;
  available_number?: number | null;
}

interface Props {
  block: TavoloBlock;
  day: TavoloDay;
  /** I giorni in cui si può spostare: quelli del periodo, non passati. */
  targetDays: string[];
  roomId: number;
  from: string;
  intent: MoveIntent | null;
  onClose: () => void;
  /** Qualcosa è cambiato in sala: il tavolo va riletto. */
  onChanged: (opts?: { keepOpen?: boolean }) => void;
  /** "Replica": il tavolo accende i posti dove questo film ci sta. */
  onReplica: (tmdbId: string) => void;
}

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function normalizeClock(v: string): string | null {
  const m = v.trim().match(CLOCK);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function quotaName(q: Quota): string {
  return typeof q.name === 'string' ? q.name : q.name?.it ?? 'Quota';
}

export default function BlockPanel({ block, day, targetDays, roomId, from, intent, onClose, onChanged, onReplica }: Props) {
  const toast = useToast();
  const [moveDay, setMoveDay] = useState(intent?.day ?? day.date);
  const [moveTime, setMoveTime] = useState(intent?.time ?? block.time);
  const [result, setResult] = useState<{ key: string; check: MoveCheck | null; error?: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [quotas, setQuotas] = useState<Quota[] | null>(null);
  const [loadingQuotas, setLoadingQuotas] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const request = useRef(0);

  const clock = normalizeClock(moveTime);
  const changed = moveDay !== day.date || (clock !== null && clock !== block.time);
  const wanted = block.touchable && changed && clock ? `${moveDay}@${clock}` : null;
  const checking = wanted !== null && result?.key !== wanted;
  const check = wanted !== null && result?.key === wanted ? result.check : null;

  // Si chiede alla sala solo dopo che si è smesso di scrivere.
  useEffect(() => {
    if (!wanted || block.pretixId === null || !clock) return;
    const id = ++request.current;
    const timer = window.setTimeout(async () => {
      try {
        const c = await planningCheckMove({ seatingPlanId: roomId, pretixId: block.pretixId!, day: moveDay, time: clock, fromDate: from });
        if (request.current === id) setResult({ key: wanted, check: c });
      } catch {
        if (request.current === id) setResult({ key: wanted, check: null, error: 'Non sono riuscito a leggere la sala. Riprova.' });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [wanted, block.pretixId, clock, moveDay, roomId, from]);

  const conflicts = check?.conflicts ?? [];
  const replaces = conflicts.map((c) => c.pretixId).filter((v): v is number => v != null);
  const needsConsent = (check?.soldTickets ?? 0) > 0;
  const canMove = Boolean(check?.usable) && (!needsConsent || consent) && !working;

  const confirmMove = async () => {
    if (!check || block.pretixId === null || !clock) return;
    setWorking(true);
    setMoveError(null);
    try {
      const res = await planningMoveShow({
        seatingPlanId: roomId,
        pretixId: block.pretixId,
        day: moveDay,
        time: clock,
        fromDate: from,
        replaces,
        force: needsConsent,
        allowOutsideHours: Boolean(check.outsideHours),
      });
      if (!res.moved) {
        setMoveError(res.error ?? 'Lo spostamento non è riuscito.');
        if (res.deleted.length > 0) onChanged({ keepOpen: true });
        return;
      }
      toast(`«${block.title}» spostato a ${dayLong(moveDay)} alle ${check.slot?.time ?? clock}.`, 'ok');
      onChanged();
    } catch {
      setMoveError('Lo spostamento non è riuscito. Ricarica il tavolo e controlla.');
    } finally {
      setWorking(false);
    }
  };

  const readQuotas = async () => {
    if (block.pretixId === null) return;
    setLoadingQuotas(true);
    try {
      setQuotas((await adminListQuotas(block.pretixId)) as Quota[]);
    } catch {
      toast('Pretix non ha risposto. Riprova fra poco.', 'alarm');
    } finally {
      setLoadingQuotas(false);
    }
  };

  const seats = block.soldOut
    ? 'Tutto esaurito'
    : block.sold !== null && block.total !== null
      ? `${block.sold} / ${block.total} venduti`
      : 'Posti non ancora letti';
  const soldShare = block.sold !== null && block.total ? Math.min(block.sold / block.total, 1) : 0;

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Chiudi">
        <X size={16} />
      </button>

      <header>
        <p className={styles.kicker}>{block.touchable ? 'In sala · Pretix' : day.isPast ? 'Già passato' : 'Fuori dalla programmazione'}</p>
        <h2 className={styles.title}>{block.title}</h2>
        <p className={styles.meta}>
          {dayShort(day.date)} · <span className={styles.clock}>{block.time} – {block.endTime}</span> · {block.runtime}′
        </p>
      </header>

      <section className={styles.group}>
        <div className={styles.row}>
          <span className={styles.label}>Posti</span>
          <span className={styles.mono}>{seats}</span>
        </div>
        <div className={styles.seatBar}><span style={{ width: `${soldShare * 100}%` }} /></div>
        {block.pretixId !== null && (
          quotas ? (
            <ul className={styles.quotas}>
              {quotas.map((q) => (
                <li key={q.id}>
                  {quotaName(q)} <b>{q.available_number ?? '…'} / {q.size ?? '∞'}</b>
                </li>
              ))}
            </ul>
          ) : (
            <Button variant="ghost" onClick={readQuotas} disabled={loadingQuotas}>
              {loadingQuotas ? 'Leggo…' : 'Quote Pretix'}
            </Button>
          )
        )}
      </section>

      {!block.touchable ? (
        <p className={styles.text}>
          {day.isPast
            ? 'È già passato: si guarda, non si tocca.'
            : 'Non è nato dalla programmazione, quindi qui non si sposta: si gestisce da Pretix.'}
        </p>
      ) : (
        <>
          <section className={styles.group}>
            <span className={styles.label}>Sposta</span>
            <div className={styles.fields}>
              <select value={moveDay} onChange={(e) => { setMoveDay(e.target.value); setConsent(false); }} aria-label="Giorno">
                {targetDays.map((d) => (
                  <option key={d} value={d}>{dayShort(d)}</option>
                ))}
              </select>
              <input
                value={moveTime}
                onChange={(e) => { setMoveTime(e.target.value); setConsent(false); }}
                inputMode="numeric"
                aria-label="Orario"
                aria-invalid={clock === null ? true : undefined}
              />
            </div>

            {!changed && <p className={styles.hint}>Scrivi un altro orario, scegli un altro giorno, o trascina il blocco sulla settimana.</p>}
            {clock === null && <p className={styles.alarmText}>Scrivi l’orario come 18:30.</p>}
            {checking && <p className={styles.hint}>Guardo la sala…</p>}
            {result?.error && wanted && <p className={styles.alarmText}>{result.error}</p>}

            {check && (
              <>
                <p className={check.usable ? (conflicts.length || check.outsideHours ? styles.warnText : styles.okText) : styles.alarmText}>
                  {check.message}
                </p>
                {check.warning && <p className={styles.warnText}>{check.warning}</p>}
                {check.movingShowSoldTickets === null && (
                  <p className={styles.warnText}>Non sono riuscito a contare i biglietti già venduti per questo spettacolo.</p>
                )}
                {(check.movingShowSoldTickets ?? 0) > 0 && (
                  <p className={styles.warnText}>
                    {check.movingShowSoldTickets}{' '}
                    {check.movingShowSoldTickets === 1 ? 'persona ha' : 'persone hanno'} già un biglietto per le {block.time}:
                    si presenteranno all’orario vecchio. Pretix non le avvisa, devi farlo tu.
                  </p>
                )}
                {needsConsent && (
                  <label className={styles.consent}>
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    Ho capito: elimino {conflicts.length === 1 ? 'uno spettacolo' : `${conflicts.length} spettacoli`} con{' '}
                    {check.soldTickets} {check.soldTickets === 1 ? 'biglietto venduto' : 'biglietti venduti'}.
                  </label>
                )}
              </>
            )}
            {moveError && <p className={styles.alarmText}>{moveError}</p>}

            {check?.usable && (
              <Button variant={conflicts.length ? 'alarm' : 'fill'} onClick={confirmMove} disabled={!canMove}>
                {working
                  ? 'Sposto…'
                  : conflicts.length
                    ? `Sposta ed elimina ${conflicts.map((c) => `«${c.title}»`).join(' e ')}`
                    : check.outsideHours
                      ? 'Sposta lo stesso'
                      : `Sposta a ${dayShort(moveDay)} ${check.slot?.time ?? clock}`}
              </Button>
            )}
          </section>

          <section className={styles.group}>
            <span className={styles.label}>Altro</span>
            {block.tmdbId && (
              <Button variant="ghost" onClick={() => onReplica(block.tmdbId!)}>
                + Aggiungi una replica
              </Button>
            )}
            <Button variant="alarm" onClick={() => setDeleting(true)}>Elimina lo spettacolo</Button>
            <p className={styles.hint}>
              {block.sold ? `${block.sold} biglietti venduti: prima di eliminarlo te lo ricordo.` : 'Si elimina da Pretix e dal sito, dopo una conferma.'}
            </p>
          </section>
        </>
      )}

      {deleting && (
        <DeleteDialog
          block={block}
          when={dayLong(day.date)}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            toast(`«${block.title}» eliminato.`, 'ok');
            onChanged();
          }}
        />
      )}
    </div>
  );
}
