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

import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, CalendarPlus, Check, Clapperboard, Loader2, Lock, Pencil,
  Search, TriangleAlert,
} from 'lucide-react';
import styles from './Programmazione.module.css';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import {
  planningCheckManualSlot,
  type ManualSlotCheck,
  type PlanningFindSlotsResult,
  type SlotProposal,
} from '@/actions/planningActions';
import { BAND_LABELS, type Band } from '@/services/scheduling/times';
import { dayLabel, slotKey, type CatalogItem, type ChosenSlot } from './types';

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

interface Props {
  film: CatalogItem;
  roomId: number;
  /** Origine dei minuti globali: la stessa da cui il server ha cercato. */
  fromDate: string;
  minDate: string;
  result: PlanningFindSlotsResult | null;
  loading: boolean;
  selected: Map<string, ChosenSlot>;
  onToggleSlot: (slot: SlotProposal) => void;
  /** Aggiunge un orario deciso a mano, sostituzione compresa. */
  onAddChosen: (chosen: ChosenSlot) => void;
  band: Band | '';
  onBandChange: (b: Band | '') => void;
  /** Allarga la ricerca ai giorni successivi. */
  onLookFurther: () => void;
  /** Vero mentre si sta allargando: il bottone non deve poter partire due volte. */
  expanding: boolean;
}

export default function StepFreeSlots({
  film, roomId, fromDate, minDate, result, loading, selected,
  onToggleSlot, onAddChosen, band, onBandChange, onLookFurther, expanding,
}: Props) {
  const poster = getTMDBImageUrl(film.posterPath, 'w154');
  const runtime = result?.film?.runtime ?? film.runtime ?? film.durationMin;
  // Memoizzato perché finisce fra le dipendenze di un effetto: un array nuovo a
  // ogni render lo farebbe ripartire all'infinito.
  const days = useMemo(() => result?.days ?? [], [result]);

  // ── L'orario deciso a mano ──────────────────────────────────────────────
  const [manualDay, setManualDay] = useState('');
  const [manualTime, setManualTime] = useState('21:00');
  const [check, setCheck] = useState<ManualSlotCheck | null>(null);
  const [checking, setChecking] = useState(false);
  /** Consenso esplicito a passare sopra biglietti già venduti. */
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!manualDay) setManualDay(days[0]?.day ?? fromDate);
  }, [days, fromDate, manualDay]);

  // Cambiare data o ora invalida l'esito precedente: lasciarlo lì, con il suo
  // bottone «sostituisci» ancora attivo, significherebbe far cancellare uno
  // spettacolo che non c'entra niente con quello che si sta guardando adesso.
  useEffect(() => {
    setCheck(null);
    setConsent(false);
  }, [manualDay, manualTime, roomId, film.tmdbId]);

  const runCheck = async () => {
    if (!manualDay || !manualTime || !film.tmdbId) return;
    setChecking(true);
    try {
      setCheck(await planningCheckManualSlot({
        seatingPlanId: roomId,
        tmdbId: film.tmdbId,
        day: manualDay,
        time: manualTime,
        fromDate,
      }));
    } catch (e) {
      console.error('[Programmazione] verifica orario manuale', e);
      setCheck({
        free: false, usable: false, slot: null, conflicts: [], soldTickets: 0,
        outsideHours: false, warning: null,
        message: 'Non sono riuscito a controllare la sala. Riprova.',
      });
    } finally {
      setChecking(false);
    }
  };

  const addManual = () => {
    if (!check?.usable || !check.slot) return;
    if (check.soldTickets > 0 && !consent) return;
    onAddChosen({
      slot: check.slot,
      replaces: check.conflicts.map((c) => c.pretixId!).filter((id) => id != null),
      replacesLabel: check.conflicts.length
        ? check.conflicts.map((c) => `${c.title} (${c.time})`).join(' e ')
        : undefined,
      soldTickets: check.soldTickets,
      force: check.soldTickets > 0 && consent,
      manual: true,
      outsideHours: check.outsideHours,
    });
    setCheck(null);
    setConsent(false);
  };

  const alreadyChosen = check?.slot ? selected.has(slotKey(check.slot)) : false;

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
              .sort((a, b) => a.slot.startMinute - b.slot.startMinute)
              .map((c) => `${dayLabel(c.slot.day)} alle ${c.slot.time}`)
              .join(' · ')}
          </p>
        )}

        {/* Le sostituzioni si dicono una volta di più, tutte insieme: sono
            l'unica parte di questo piano che *distrugge* qualcosa, e chi
            conferma deve saperlo senza doverlo ricostruire orario per orario. */}
        {[...selected.values()].some((c) => c.replaces.length > 0) && (
          <div className={styles.replaceNotice}>
            <TriangleAlert size={15} />
            <div>
              <b>Confermando, questi spettacoli verranno eliminati:</b>
              {[...selected.values()]
                .filter((c) => c.replaces.length > 0)
                .sort((a, b) => a.slot.startMinute - b.slot.startMinute)
                .map((c) => (
                  <span key={slotKey(c.slot)}>
                    {dayLabel(c.slot.day)} — {c.replacesLabel}
                    {c.soldTickets > 0 && (
                      <em> · {c.soldTickets} bigliett{c.soldTickets === 1 ? 'o venduto' : 'i venduti'}</em>
                    )}
                  </span>
                ))}
            </div>
          </div>
        )}
      </section>

      {/* ── L'orario deciso a mano ──────────────────────────────────────── */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}><Pencil size={17} /> Oppure decidi tu giorno e ora</h2>
        <p className={styles.sideHint}>
          Le proposte qui sopra mostrano solo il libero. Se il posto che vuoi è
          già occupato, qui puoi vedere da cosa e prenderlo comunque.
        </p>

        <div className={styles.manualRow}>
          <label className={styles.field}>
            <span>Giorno</span>
            <input
              type="date"
              value={manualDay}
              min={minDate}
              onChange={(e) => setManualDay(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Ora</span>
            <input type="time" value={manualTime} onChange={(e) => setManualTime(e.target.value)} />
          </label>
          <button
            className={styles.ghostBtnSmall}
            onClick={runCheck}
            disabled={checking || !manualDay || !manualTime}
          >
            {checking ? <Loader2 size={13} className={styles.spin} /> : <Search size={13} />}
            Vedi se si può
          </button>
        </div>

        {check && (
          <div
            className={`${styles.manualResult} ${
              check.free && !check.outsideHours ? styles.manualFree
              : check.usable ? styles.manualBusy
              : styles.manualNo
            }`}
          >
            <p className={styles.manualMessage}>
              {check.usable && (!check.free || check.outsideHours) && <TriangleAlert size={15} />}
              {check.message}
            </p>

            {/* Fuori orario si può, ma va detto qui e ridetto al riepilogo:
                non è un dettaglio tecnico, è il cinema che resta aperto oltre
                l'orario — con chi ci lavora dentro. */}
            {check.outsideHours && check.usable && (
              <p className={styles.manualMessage}>
                Fuori dalla fascia d&apos;apertura: si può fare lo stesso, ma decidilo tu.
              </p>
            )}

            {check.conflicts.length > 0 && (
              <div className={styles.manualConflicts}>
                {check.conflicts.map((c, i) => (
                  <span key={c.pretixId ?? i}>
                    <b>{c.time}–{c.endTime}</b> {c.title}
                    {c.soldTickets > 0 && (
                      <em> · {c.soldTickets} bigliett{c.soldTickets === 1 ? 'o' : 'i'}</em>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Passare sopra a chi ha pagato non può essere un clic distratto:
                serve dirlo, non solo cliccare. */}
            {check.usable && check.soldTickets > 0 && (
              <label className={styles.manualConsent}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                So che {check.soldTickets === 1 ? 'un ordine pagato resterà orfano' : `${check.soldTickets} ordini pagati resteranno orfani`} e
                che dovrò rimborsarli a mano da Pretix.
              </label>
            )}

            {check.usable && check.slot && (
              alreadyChosen ? (
                <p className={styles.manualDone}><Check size={14} /> Già fra gli orari scelti.</p>
              ) : (
                <button
                  className={check.free && !check.outsideHours ? styles.ctaBtnSmall : styles.dangerBtnSmall}
                  onClick={addManual}
                  disabled={check.soldTickets > 0 && !consent}
                >
                  {check.free
                    ? <><CalendarPlus size={14} /> Aggiungi alle {check.slot.time}</>
                    : <><TriangleAlert size={14} /> Sostituisci e metti «{film.title}» alle {check.slot.time}</>}
                </button>
              )
            )}
          </div>
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
