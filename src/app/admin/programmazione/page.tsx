'use client';

/**
 * PROGRAMMAZIONE — il wizard unico.
 *
 * Sostituisce i cinque percorsi che convivevano prima (planner automatico,
 * modale "Cerca film", "Programma dal catalogo", slot settimanali, bulk).
 * Quattro passi: lo slot, il catalogo, il calendario, la sala.
 *
 * Questo file tiene lo stato e orchestra; i passi sono componenti separati e la
 * matematica degli orari non è né qui né lì, ma in `services/scheduling`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarCheck, CalendarClock, ChevronLeft, ChevronRight, Clapperboard, Loader2,
  Sparkles, Wand2, X,
} from 'lucide-react';
import styles from './Programmazione.module.css';
import StepSlot from './StepSlot';
import StepCatalog from './StepCatalog';
import StepCalendar from './StepCalendar';
import StepFilm from './StepFilm';
import StepFreeSlots from './StepFreeSlots';
import StepCommit, { type CommitFailure, type CommitProgress } from './StepCommit';
import {
  planningDefaultStartDate,
  planningFindSlots,
  planningGenerate,
  planningGetPeriodOccupancy,
  planningGetRooms,
  planningSnapShow,
  planningCommitStart,
  planningCommitStatus,
  type DayOccupancy,
  type PeriodOccupancy,
  type PlanningFindSlotsResult,
  type SlotProposal,
} from '@/actions/planningActions';
import { catalogEnsureByTmdbId } from '@/actions/catalogActions';
import type { ScheduledShow } from '@/services/scheduling/engine';
import type { Intensity } from '@/services/scheduling/engine';
import { MINUTES_PER_DAY, daysBetweenISO, type Band } from '@/services/scheduling/times';
import {
  commitKey, runtimeOf, showKey, slotKey,
  type CatalogItem, type ChosenSlot, type Pick, type PlanningMode, type WizardStep,
} from './types';

const STEP_LABELS: Record<PlanningMode, string[]> = {
  period: ['Lo slot', 'I film', 'Il calendario', 'In sala'],
  film: ['Il film', 'Gli orari', 'Il calendario', 'In sala'],
};

const MODES: { key: PlanningMode; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    key: 'period',
    label: 'Dal periodo',
    hint: 'Scegli sala e giorni, poi i film: il motore riempie la settimana.',
    icon: <Sparkles size={16} />,
  },
  {
    key: 'film',
    label: 'Dal film',
    hint: 'Scegli il titolo, e ti propongo gli orari liberi dal giorno più vicino.',
    icon: <CalendarClock size={16} />,
  },
];

/** Quante giornate con spazio mostrare, e fin dove spingersi a cercarle. */
const SLOT_DAYS_STEP = 7;

const INTENSITIES: { key: Intensity; label: string; hint: string }[] = [
  { key: 'soft', label: '🌙 Rilassata', hint: '4 spettacoli nei feriali · 5 nel weekend' },
  { key: 'normal', label: '🎬 Normale', hint: '6 spettacoli nei feriali · 7 nel weekend' },
  { key: 'festival', label: '🎪 Festival', hint: '7 spettacoli nei feriali · 8 nel weekend' },
];

export default function ProgrammazionePage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [mode, setMode] = useState<PlanningMode>('period');

  // ── Passo 1: lo slot ──────────────────────────────────────────────────
  const [rooms, setRooms] = useState<{ id: number; name: string; isFavorite: boolean }[]>([]);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [minDate, setMinDate] = useState('');
  const [days, setDays] = useState(7);
  const [occupancy, setOccupancy] = useState<PeriodOccupancy | null>(null);
  const [loadingOccupancy, setLoadingOccupancy] = useState(false);

  // ── Passo 2: i film ───────────────────────────────────────────────────
  const [picks, setPicks] = useState<Map<string, Pick>>(new Map());
  const [intensity, setIntensity] = useState<Intensity>('normal');

  // ── Al contrario: il film prima, gli orari poi ────────────────────────
  const [reverseFilm, setReverseFilm] = useState<CatalogItem | null>(null);
  const [slotsResult, setSlotsResult] = useState<PlanningFindSlotsResult | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<Map<string, ChosenSlot>>(new Map());
  /**
   * Le sostituzioni decise al passo 2, indicizzate per `commitKey`. Sono l'unica
   * parte del piano che elimina qualcosa, e restano fuori da `shows` perché
   * `ScheduledShow` appartiene al motore, che di Pretix non sa niente.
   */
  const [replacements, setReplacements] = useState<
    Map<string, { replaces: number[]; force: boolean; label?: string; soldTickets: number }>
  >(new Map());
  const [slotBand, setSlotBand] = useState<Band | ''>('');
  const [slotDays, setSlotDays] = useState(SLOT_DAYS_STEP);

  // ── Passo 3: il calendario ────────────────────────────────────────────
  const [shows, setShows] = useState<ScheduledShow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [existingDays, setExistingDays] = useState<DayOccupancy[]>([]);
  const [busy, setBusy] = useState(false);

  // ── Passo 4: la conferma ──────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<CommitProgress>({ step: '', done: 0, total: 1 });
  const [created, setCreated] = useState(0);
  const [failures, setFailures] = useState<CommitFailure[]>([]);

  // ── Avvio ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [r, d] = await Promise.all([planningGetRooms(), planningDefaultStartDate()]);
        if (cancelled) return;
        setRooms(r);
        setStartDate(d);
        setMinDate(d);

        // `?tmdb=` e `?room=` permettono di aprire il wizard già puntato su un
        // film — è così che funzionano la replica di uno spettacolo e il
        // "programma" del catalogo, senza che serva un secondo percorso.
        // Si legge da `window.location` invece che da `useSearchParams` per non
        // trascinarsi dietro un confine di Suspense per due parametri.
        const params = new URLSearchParams(window.location.search);
        const wantedRoom = Number(params.get('room'));
        const saved = localStorage.getItem('defaultSalaId');
        const savedId = saved ? Number(saved) : NaN;
        const chosen =
          r.find((x) => x.id === wantedRoom) ??
          r.find((x) => x.id === savedId) ??
          r[0];
        if (chosen) setRoomId(chosen.id);

        const wantedFilm = params.get('tmdb');
        if (wantedFilm) {
          const film = await catalogEnsureByTmdbId(wantedFilm);
          if (film && !cancelled) {
            setPicks((prev) => new Map(prev).set(wantedFilm, { film: film as unknown as CatalogItem }));
          }
        }
      } catch (e) {
        console.error('[Programmazione] avvio', e);
      }
    }
    boot();
    return () => { cancelled = true; };
  }, []);

  // Ogni cambio di sala o periodo rilegge l'occupazione: è l'informazione su
  // cui si appoggia tutto il resto del wizard. Programmando al contrario non
  // serve — lì il periodo non esiste ancora — e sarebbe una lettura di Pretix
  // buttata a ogni tasto premuto sulla data.
  useEffect(() => {
    if (mode !== 'period') return;
    if (!roomId || !startDate) return;
    let cancelled = false;
    async function loadOccupancy() {
      setLoadingOccupancy(true);
      try {
        const o = await planningGetPeriodOccupancy(roomId!, startDate, days);
        if (!cancelled) setOccupancy(o);
      } catch (e) {
        console.error('[Programmazione] occupazione', e);
      } finally {
        if (!cancelled) setLoadingOccupancy(false);
      }
    }
    loadOccupancy();
    return () => { cancelled = true; };
  }, [mode, roomId, startDate, days]);

  const gaps = useMemo(
    () => (occupancy?.daysDetail ?? []).flatMap((d) => d.gaps.map((g) => g.minutes)),
    [occupancy]
  );
  const genresInSchedule = useMemo(() => occupancy?.genresInSchedule ?? [], [occupancy]);

  // ── Selezione film ────────────────────────────────────────────────────
  const togglePick = useCallback((film: CatalogItem) => {
    if (!film.tmdbId) return;
    setPicks((prev) => {
      const next = new Map(prev);
      if (next.has(film.tmdbId!)) next.delete(film.tmdbId!);
      else next.set(film.tmdbId!, { film });
      return next;
    });
  }, []);

  const updatePick = useCallback((tmdbId: string, patch: Partial<Omit<Pick, 'film'>>) => {
    setPicks((prev) => {
      const cur = prev.get(tmdbId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(tmdbId, { ...cur, ...patch });
      return next;
    });
  }, []);

  // ── Al contrario: dal film agli orari ─────────────────────────────────
  // In questo verso `startDate` è il giorno da cui *cercare*, non l'inizio di
  // un periodo da riempire: la finestra vera nasce dopo, dagli orari scelti.
  useEffect(() => {
    if (mode !== 'film' || step !== 2) return;
    if (!roomId || !reverseFilm?.tmdbId || !startDate) return;

    let cancelled = false;
    async function loadSlots() {
      setLoadingSlots(true);
      try {
        const res = await planningFindSlots({
          seatingPlanId: roomId!,
          tmdbId: reverseFilm!.tmdbId!,
          fromDate: startDate,
          maxDays: slotDays,
          // Si guarda più lontano di quanto si mostri: se i prossimi giorni sono
          // pieni, le giornate buone vanno comunque trovate.
          horizonDays: Math.min(slotDays * 3, 60),
          band: slotBand || undefined,
        });
        if (!cancelled) setSlotsResult(res);
      } catch (e) {
        console.error('[Programmazione] orari liberi', e);
        if (!cancelled) {
          setSlotsResult({
            film: null, fromDate: startDate, days: [], scannedDays: 0, horizonDays: 0,
            reason: 'Non sono riuscito a leggere la sala. Riprova.',
          });
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }
    loadSlots();
    return () => { cancelled = true; };
  }, [mode, step, roomId, reverseFilm, startDate, slotBand, slotDays]);

  /**
   * Un orario scelto vale solo finché resta fra quelli proposti. Cambiando sala,
   * giorno di partenza o fascia la vecchia scelta non è più valida — e i suoi
   * minuti globali sarebbero perfino riferiti a un'altra origine, il che
   * produrrebbe spettacoli piazzati nel giorno sbagliato.
   */
  useEffect(() => {
    if (!slotsResult) return;
    const alive = new Set(slotsResult.days.flatMap((d) => d.slots.map(slotKey)));
    setSelectedSlots((prev) => {
      // Gli orari decisi a mano non compaiono fra le proposte — è tutto il loro
      // senso — quindi non vanno cercati lì: si giudicano solo quelli automatici,
      // altrimenti una scelta manuale sparirebbe al primo cambio di fascia.
      const stale = [...prev.entries()].filter(([k, c]) => !c.manual && !alive.has(k));
      if (stale.length === 0) return prev;
      return new Map([...prev].filter(([k, c]) => c.manual || alive.has(k)));
    });
  }, [slotsResult]);

  /**
   * Le scelte manuali restano legate alla sala e al giorno di partenza da cui
   * erano state verificate: cambiandoli, quella verifica non vale più — la sala
   * è un'altra, o i minuti globali hanno un'altra origine.
   */
  useEffect(() => {
    setSelectedSlots((prev) => {
      if (![...prev.values()].some((c) => c.manual)) return prev;
      return new Map([...prev].filter(([, c]) => !c.manual));
    });
  }, [roomId, startDate, reverseFilm]);

  const toggleSlot = useCallback((slot: SlotProposal) => {
    setSelectedSlots((prev) => {
      const next = new Map(prev);
      const key = slotKey(slot);
      if (next.has(key)) next.delete(key);
      // Un orario proposto è libero per costruzione: non sostituisce niente.
      else next.set(key, { slot, replaces: [], soldTickets: 0, force: false, manual: false });
      return next;
    });
  }, []);

  const addChosenSlot = useCallback((chosen: ChosenSlot) => {
    setSelectedSlots((prev) => new Map(prev).set(slotKey(chosen.slot), chosen));
  }, []);

  /**
   * Dagli orari spuntati al calendario.
   *
   * Gli spettacoli nascono **bloccati**: sono orari che hai scelto tu uno per
   * uno, e un ricalcolo che li spostasse tradirebbe la scelta. Da qui in poi il
   * passo 3 è lo stesso dell'altro verso — trascinamento, repliche, conferma —
   * perché ciò che gli serve è solo un elenco di spettacoli e una finestra.
   */
  const goToCalendarFromSlots = async () => {
    if (!roomId || !reverseFilm?.tmdbId || selectedSlots.size === 0 || !slotsResult) return;

    const chosen = [...selectedSlots.values()].sort((a, b) => a.slot.startMinute - b.slot.startMinute);
    const windowStart = chosen[0].slot.day;
    const span = Math.min(
      Math.max(daysBetweenISO(windowStart, chosen[chosen.length - 1].slot.day) + 1, 1),
      30
    );

    // I minuti globali arrivano riferiti al giorno da cui si era cercato. La
    // finestra del calendario però parte dal primo orario scelto, e i due assi
    // devono coincidere o il piano finirebbe traslato di giorni.
    const shift = daysBetweenISO(slotsResult.fromDate, windowStart) * MINUTES_PER_DAY;
    const info = slotsResult.film;

    const fresh: ScheduledShow[] = chosen.map(({ slot: s }) => ({
      tmdbId: reverseFilm.tmdbId!,
      title: info?.title ?? reverseFilm.title,
      runtime: info?.runtime || runtimeOf(reverseFilm) || 0,
      posterPath: info?.posterPath || reverseFilm.posterPath || undefined,
      day: s.day,
      date: s.date,
      time: s.time,
      endTime: s.endTime,
      startMinute: s.startMinute - shift,
      endMinute: s.endMinute - shift,
      band: s.band,
      locked: true,
    }));

    // Le sostituzioni viaggiano a parte, in una mappa indicizzata come lo
    // spettacolo *alla conferma*. Non stanno dentro `ScheduledShow` perché quel
    // tipo è del motore, che di Pretix non sa niente; e la chiave scelta ha un
    // effetto voluto: se al passo 3 sposti lo spettacolo a un altro orario, la
    // chiave cambia e la sostituzione si perde — che è giusto, perché ti sei
    // spostato via da ciò che volevi sostituire.
    // La chiave si ricava da `commitKey` applicata allo spettacolo vero, non
    // riscrivendone il formato a mano: le due stringhe devono coincidere, e un
    // duplicato del formato si sfalserebbe in silenzio alla prima modifica,
    // lasciando la sostituzione senza effetto e nessun errore a dirlo.
    setReplacements(new Map(
      chosen
        .map((c, i) => [c, fresh[i]] as const)
        .filter(([c]) => c.replaces.length > 0)
        .map(([c, show]) => [
          commitKey(show),
          { replaces: c.replaces, force: c.force, label: c.replacesLabel, soldTickets: c.soldTickets },
        ])
    ));

    setBusy(true);
    setStartDate(windowStart);
    setDays(span);
    setPicks(new Map([[reverseFilm.tmdbId!, { film: reverseFilm }]]));
    setShows(fresh);
    setWarnings([]);

    try {
      const occ = await planningGetPeriodOccupancy(roomId, windowStart, span);
      setExistingDays(occ.daysDetail);
    } catch (e) {
      console.error('[Programmazione] occupazione del piano', e);
      setExistingDays([]);
    } finally {
      setBusy(false);
    }

    setStep(3);
    window.scrollTo({ top: 0 });
  };

  /** Cambiare verso ricomincia: le due strade non condividono nessuna scelta. */
  const changeMode = (next: PlanningMode) => {
    if (next === mode) return;
    setMode(next);
    setPicks(new Map());
    setReverseFilm(null);
    setSlotsResult(null);
    setSelectedSlots(new Map());
    setReplacements(new Map());
    setSlotBand('');
    setSlotDays(SLOT_DAYS_STEP);
    setShows([]);
    setWarnings([]);
    setStartDate(minDate);
  };

  // ── Generazione e ricalcolo ───────────────────────────────────────────
  /**
   * Un solo punto d'ingresso per generare il piano — dalla prima generazione ai
   * ricalcoli dopo ogni modifica. `overrides` permette di forzare le repliche
   * di un film senza toccare la selezione dell'utente.
   */
  const generate = useCallback(async (opts: {
    locked?: ScheduledShow[];
    replicaOverrides?: Map<string, number>;
    seed?: number;
  } = {}) => {
    if (!roomId || !startDate || picks.size === 0) return;
    setBusy(true);
    try {
      const films = [...picks.values()]
        .map((p) => ({
          tmdbId: p.film.tmdbId!,
          replicas: opts.replicaOverrides?.get(p.film.tmdbId!) ?? p.replicas,
          preferredBand: p.preferredBand,
        }))
        // Un film portato a zero repliche esce dal piano ma resta selezionato:
        // così puoi rimetterlo senza tornare al catalogo.
        .filter((f) => f.replicas !== 0);

      const res = await planningGenerate({
        seatingPlanId: roomId,
        startDate,
        days,
        films,
        intensity,
        locked: opts.locked,
        seed: opts.seed,
      });
      setShows(res.shows);
      setWarnings(res.warnings);
      setExistingDays(res.existing);
    } catch (e) {
      console.error('[Programmazione] generazione', e);
      window.alert('Generazione fallita, vedi la console per il dettaglio.');
    } finally {
      setBusy(false);
    }
  }, [roomId, startDate, days, picks, intensity]);

  const goToCalendar = async () => {
    await generate();
    setStep(3);
    window.scrollTo({ top: 0 });
  };

  const lockedOf = useCallback(
    (list: ScheduledShow[]) => list.filter((s) => s.locked),
    []
  );

  const toggleLock = (key: string) => {
    setShows((prev) => prev.map((s) => (showKey(s) === key ? { ...s, locked: !s.locked } : s)));
  };

  const deleteShow = (key: string) => {
    setShows((prev) => prev.filter((s) => showKey(s) !== key));
  };

  const moveShow = async (show: ScheduledShow, desiredStartMinute: number) => {
    if (!roomId) return;
    setBusy(true);
    try {
      const res = await planningSnapShow(show, desiredStartMinute, {
        seatingPlanId: roomId,
        startDate,
        days,
        otherShows: shows,
      });
      if (!res.show) {
        window.alert(res.reason ?? 'Non è possibile spostarlo qui.');
        return;
      }
      const moved = res.show;
      // Uno spettacolo spostato a mano è una decisione tua: si blocca da solo,
      // altrimenti il primo ricalcolo lo rimetterebbe dov'era.
      setShows((prev) =>
        prev.map((s) => (showKey(s) === showKey(show) ? { ...moved, locked: true } : s))
      );
    } catch (e) {
      console.error('[Programmazione] spostamento', e);
    } finally {
      setBusy(false);
    }
  };

  /** Quante volte ogni film compare nel piano in questo momento. */
  const currentCounts = useCallback(() => {
    const counts = new Map<string, number>();
    for (const s of shows) counts.set(s.tmdbId, (counts.get(s.tmdbId) ?? 0) + 1);
    return counts;
  }, [shows]);

  const changeReplicas = async (tmdbId: string, replicas: number) => {
    const overrides = currentCounts();
    overrides.set(tmdbId, replicas);
    await generate({ locked: lockedOf(shows), replicaOverrides: overrides });
  };

  // "Rigenera" cambia gli orari, non le quantità: partire dai conteggi attuali
  // fa sì che gli spettacoli tolti a mano restino tolti.
  const regenerate = () => generate({
    locked: lockedOf(shows),
    replicaOverrides: currentCounts(),
    seed: Math.floor(Math.random() * 1_000_000),
  });

  // ── Conferma ──────────────────────────────────────────────────────────
  /**
   * Avvia la creazione e la segue.
   *
   * La sequenza vera (metadati, sub-eventi, sync) sta in `commitRunner`, la
   * stessa che serve l'app Swift: qui si avvia il lavoro e si chiede come va.
   * Averne una copia sul client avrebbe significato due implementazioni della
   * stessa cosa, pronte a divergere alla prima correzione fatta su una sola.
   */
  const runCommit = useCallback(async (targets: ScheduledShow[]) => {
    if (!roomId || targets.length === 0) return;
    setRunning(true);
    setFailures([]);
    setStep(4);
    window.scrollTo({ top: 0 });

    const sent = [...targets].sort((a, b) => a.startMinute - b.startMinute);
    setProgress({ step: 'Avvio…', done: 0, total: sent.length + 1 });

    try {
      const { jobId } = await planningCommitStart({
        seatingPlanId: roomId,
        shows: sent.map((s) => {
          // La sostituzione si riattacca qui, alla stessa chiave con cui era
          // stata registrata: uno spettacolo spostato nel frattempo non la
          // ritrova, e quindi non cancella niente.
          const replacing = replacements.get(commitKey(s));
          return {
            tmdbId: s.tmdbId,
            date: s.date,
            time: s.time,
            title: s.title,
            ...(replacing ? { replaces: replacing.replaces, forceReplace: replacing.force } : {}),
          };
        }),
      });

      // Il lavoro procede sul server: qui si chiede periodicamente a che punto è.
      for (;;) {
        await new Promise((r) => setTimeout(r, 1200));
        const job = await planningCommitStatus(jobId);
        if (!job) {
          // Il registro vive in memoria: se l'istanza cambia, il lavoro sparisce
          // dalla vista. Non si rilancia — creerebbe doppioni.
          setProgress({ step: 'Ho perso di vista il lavoro: ricontrolla la sala.', done: 1, total: 1 });
          break;
        }

        setProgress({ step: job.step, done: job.done, total: job.total });

        if (job.state === 'done' || job.state === 'error') {
          setCreated((c) => c + job.created.length);
          setFailures(job.errors);
          // Gli spettacoli creati escono dal piano: se poi si riprova, si
          // riprovano solo i falliti.
          const failedKeys = new Set(job.errors.map((e) => e.key));
          setShows((prev) => prev.filter((s) => failedKeys.has(commitKey(s))));
          break;
        }
      }
    } catch (e) {
      console.error('[Programmazione] conferma', e);
      setFailures([{ key: 'start', label: 'Avvio della creazione', error: String(e) }]);
    } finally {
      setRunning(false);
    }
  }, [roomId, replacements]);

  const restart = () => {
    setPicks(new Map());
    setShows([]);
    setWarnings([]);
    setFailures([]);
    setCreated(0);
    setProgress({ step: '', done: 0, total: 1 });
    setReverseFilm(null);
    setSlotsResult(null);
    setSelectedSlots(new Map());
    setReplacements(new Map());
    setSlotBand('');
    setSlotDays(SLOT_DAYS_STEP);
    setStep(1);
  };

  // ── Barra dei passi ───────────────────────────────────────────────────
  const canAdvance =
    step === 1 ? Boolean(roomId && startDate && (mode === 'period' || reverseFilm))
    : step === 2 ? (mode === 'period' ? picks.size > 0 : selectedSlots.size > 0)
    : step === 3 ? shows.length > 0
    : false;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}><Wand2 size={21} /></span>
          <div>
            <h1>Programmazione</h1>
            <p>Uno slot, dei film, un calendario</p>
          </div>
        </div>

        <nav className={styles.steps}>
          {STEP_LABELS[mode].map((label, i) => (
            <React.Fragment key={label}>
              {i > 0 && <ChevronRight size={13} className={styles.stepArrow} />}
              <button
                type="button"
                className={`${styles.step} ${i + 1 === step ? styles.stepActive : ''} ${i + 1 < step ? styles.stepDone : ''}`}
                onClick={() => { if (i + 1 < step && !running) setStep((i + 1) as WizardStep); }}
                disabled={i + 1 >= step || running}
              >
                <b>{i + 1 < step ? '✓' : i + 1}</b> {label}
              </button>
            </React.Fragment>
          ))}
        </nav>

        <Link className={styles.exitBtn} href="/admin" title="Torna all'admin"><X size={19} /></Link>
      </header>

      {step === 1 && (
        <section className={styles.modeBar}>
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`${styles.modeBtn} ${mode === m.key ? styles.modeActive : ''}`}
              onClick={() => changeMode(m.key)}
            >
              <b>{m.icon} {m.label}</b>
              <span>{m.hint}</span>
            </button>
          ))}
        </section>
      )}

      {step === 1 && mode === 'period' && (
        <StepSlot
          rooms={rooms}
          roomId={roomId}
          onRoomChange={(id) => { setRoomId(id); localStorage.setItem('defaultSalaId', String(id)); }}
          startDate={startDate}
          onStartDateChange={setStartDate}
          days={days}
          onDaysChange={setDays}
          occupancy={occupancy}
          loading={loadingOccupancy}
          minDate={minDate}
        />
      )}

      {step === 1 && mode === 'film' && (
        <StepFilm
          rooms={rooms}
          roomId={roomId}
          onRoomChange={(id) => { setRoomId(id); localStorage.setItem('defaultSalaId', String(id)); }}
          fromDate={startDate}
          onFromDateChange={setStartDate}
          minDate={minDate}
          film={reverseFilm}
          onFilmChange={(f) => { setReverseFilm(f); setSelectedSlots(new Map()); setSlotsResult(null); setReplacements(new Map()); }}
        />
      )}

      {step === 2 && mode === 'period' && (
        <StepCatalog
          picks={picks}
          onToggle={togglePick}
          onUpdatePick={updatePick}
          gaps={gaps}
          genresInSchedule={genresInSchedule}
        />
      )}

      {step === 2 && mode === 'film' && reverseFilm && (
        <StepFreeSlots
          film={reverseFilm}
          roomId={roomId!}
          fromDate={startDate}
          minDate={minDate}
          result={slotsResult}
          loading={loadingSlots}
          selected={selectedSlots}
          onToggleSlot={toggleSlot}
          onAddChosen={addChosenSlot}
          band={slotBand}
          onBandChange={setSlotBand}
          onLookFurther={() => setSlotDays((d) => Math.min(d + SLOT_DAYS_STEP, 20))}
          expanding={loadingSlots}
        />
      )}

      {step === 3 && (
        <StepCalendar
          shows={shows}
          warnings={warnings}
          existing={existingDays}
          picks={picks}
          busy={busy}
          onToggleLock={toggleLock}
          onDelete={deleteShow}
          onMove={moveShow}
          onReplicasChange={changeReplicas}
          onRegenerate={regenerate}
          replacements={replacements}
        />
      )}

      {step === 4 && (
        <StepCommit
          running={running}
          progress={progress}
          created={created}
          failures={failures}
          onRetry={() => runCommit(shows)}
          onRestart={restart}
        />
      )}

      {step < 4 && (
        <footer className={styles.footer}>
          {step > 1 && (
            <button className={styles.ghostBtn} onClick={() => setStep((step - 1) as WizardStep)}>
              <ChevronLeft size={17} /> Indietro
            </button>
          )}

          {step === 2 && mode === 'period' && (
            <div className={styles.intensityField}>
              <span>Ritmo</span>
              <div className={styles.intensityGroup}>
                {INTENSITIES.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    className={`${styles.intensityBtn} ${intensity === it.key ? styles.intensityActive : ''}`}
                    onClick={() => setIntensity(it.key)}
                    title={it.hint}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.footerSpacer} />

          {step === 1 && (
            <button className={styles.ctaBtn} onClick={() => setStep(2)} disabled={!canAdvance}>
              {mode === 'period'
                ? <><Clapperboard size={19} /> Scegli i film</>
                : <><CalendarClock size={19} /> Trova gli orari liberi</>}
            </button>
          )}
          {step === 2 && mode === 'period' && (
            <button className={styles.ctaBtn} onClick={goToCalendar} disabled={!canAdvance || busy}>
              {busy
                ? <><Loader2 size={19} className={styles.spin} /> Costruisco il calendario…</>
                : <><Sparkles size={19} /> Genera il calendario · {picks.size} film</>}
            </button>
          )}
          {step === 2 && mode === 'film' && (
            <button className={styles.ctaBtn} onClick={goToCalendarFromSlots} disabled={!canAdvance || busy}>
              {busy
                ? <><Loader2 size={19} className={styles.spin} /> Preparo il calendario…</>
                : <>
                    <CalendarCheck size={19} /> Metti in calendario · {selectedSlots.size}{' '}
                    spettacol{selectedSlots.size === 1 ? 'o' : 'i'}
                  </>}
            </button>
          )}
          {step === 3 && (
            <button className={styles.ctaBtn} onClick={() => runCommit(shows)} disabled={!canAdvance || busy}>
              <CalendarCheck size={19} /> Conferma · crea {shows.length} spettacol{shows.length === 1 ? 'o' : 'i'}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
