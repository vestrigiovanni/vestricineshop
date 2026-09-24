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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CalendarCheck, CalendarClock, CalendarRange, ChevronLeft, ChevronRight, Clapperboard,
  LayoutGrid, Loader2, Rows3, Sparkles, Wand2, X, Zap,
} from 'lucide-react';
import styles from './Programmazione.module.css';
import StepSlot from './StepSlot';
import StepCatalog from './StepCatalog';
import StepBoard from './StepBoard';
import SwapPanel, { type SwapTarget } from './SwapPanel';
import StepCalendar from './StepCalendar';
import StepFilm from './StepFilm';
import StepFreeSlots from './StepFreeSlots';
import Palinsesto from './Palinsesto';
import StepCommit, { type CommitFailure, type CommitProgress } from './StepCommit';
import {
  planningDefaultStartDate,
  planningDropDraft,
  planningLoadDraft,
  planningSaveDraft,
  planningFindSlots,
  planningAutoPlan,
  planningGenerate,
  planningGetPeriodOccupancy,
  planningGetRooms,
  planningSnapShow,
  planningCommitStart,
  planningCommitRetry,
  planningCommitStatus,
  planningCommitTick,
  planningFindOpenCommit,
  type DayOccupancy,
  type PeriodOccupancy,
  type PlanningFindSlotsResult,
  type SlotProposal,
} from '@/actions/planningActions';
import { catalogEnsureByTmdbId } from '@/actions/catalogActions';
import type { ScheduledShow } from '@/services/scheduling/engine';
import type { Intensity } from '@/services/scheduling/engine';
import { MINUTES_PER_DAY, daysBetweenISO, formatClock, type Band } from '@/services/scheduling/times';
import {
  commitKey, defaultSpecsFor, runtimeOf, showKey, slotKey,
  type CatalogItem, type ChosenSlot, type Pick, type PlanningMode, type WizardStep,
} from './types';
import { normalizeProjectionSpecs } from '@/constants/projectionSpecs';

/** Il palinsesto non è qui perché di passi non ne ha: è una vista sola. */
const STEP_LABELS: Record<'period' | 'film', string[]> = {
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
  {
    key: 'palinsesto',
    label: 'Il palinsesto',
    hint: 'Cosa c\'è già in cartellone: spostalo, eliminalo, riordina la settimana.',
    icon: <CalendarRange size={16} />,
  },
];

/**
 * Dove si tiene l'id del lavoro di creazione in corso.
 *
 * Basta questo perché ricaricare la pagina, o riaprirla domani, ritrovi la
 * creazione dov'era invece di ricominciarla: il lavoro vero vive sul database,
 * qui c'è solo il filo per ripescarlo.
 */
const JOB_STORAGE_KEY = 'programmazione:job';

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
  /**
   * Dopo uno spostamento o un'eliminazione la sala non è più quella che
   * avevamo letto: sala, data e giorni non sono cambiati, quindi serve qualcosa
   * che dica all'effetto di rileggerla lo stesso.
   */
  const [occupancyTick, setOccupancyTick] = useState(0);
  const [loadingOccupancy, setLoadingOccupancy] = useState(false);

  // ── Passo 2: i film ───────────────────────────────────────────────────
  const [picks, setPicks] = useState<Map<string, Pick>>(new Map());
  /**
   * Come si guarda il catalogo. Il tabellone è il primo perché è il modo più
   * veloce di riconoscere cosa si vuole proiettare: cento locandine insieme si
   * scorrono in mezzo minuto, i filtri servono quando cerchi qualcosa di preciso.
   */
  const [catalogView, setCatalogView] = useState<'board' | 'rails'>('board');
  const [intensity, setIntensity] = useState<Intensity>('normal');

  // ── Al contrario: il film prima, gli orari poi ────────────────────────
  const [reverseFilm, setReverseFilm] = useState<CatalogItem | null>(null);
  const [slotsResult, setSlotsResult] = useState<PlanningFindSlotsResult | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<Map<string, ChosenSlot>>(new Map());
  /**
   * Ciò che il passo 2 ha deciso e il motore non sa portarsi dietro, indicizzato
   * per `commitKey`: le sostituzioni — l'unica parte del piano che elimina
   * qualcosa — e il permesso di sforare l'orario d'apertura. Stanno fuori da
   * `shows` perché `ScheduledShow` appartiene al motore, che di Pretix e di
   * orari d'apertura non sa niente.
   */
  const [replacements, setReplacements] = useState<
    Map<string, {
      replaces: number[]; force: boolean; label?: string; soldTickets: number;
      outsideHours?: boolean;
    }>
  >(new Map());
  const [slotBand, setSlotBand] = useState<Band | ''>('');
  const [slotDays, setSlotDays] = useState(SLOT_DAYS_STEP);

  // ── Passo 3: il calendario ────────────────────────────────────────────
  /** Lo spettacolo di cui si sta cambiando il film, se il pannello è aperto. */
  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null);
  /**
   * I film che hai scartato cambiandoli.
   *
   * Serve perché "rigenera" non te li rimetta davanti: una risposta già data
   * non va richiesta, e senza questo elenco l'autoprogrammazione riproporrebbe
   * ogni volta gli stessi titoli che stavi togliendo.
   */
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [shows, setShows] = useState<ScheduledShow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [existingDays, setExistingDays] = useState<DayOccupancy[]>([]);
  const [busy, setBusy] = useState(false);

  // ── Passo 4: la conferma ──────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<CommitProgress>({ step: '', done: 0, total: 1 });
  const [created, setCreated] = useState(0);
  const [failures, setFailures] = useState<CommitFailure[]>([]);
  /** Il lavoro in corso: è ciò che permette di riprenderlo dopo un ricaricamento. */
  const [jobId, setJobId] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  /**
   * Il controllo sul lavoro interrotto è stato fatto.
   *
   * Le due domande "riprendo la creazione?" e "riprendo la bozza?" non possono
   * arrivare insieme, e nemmeno nell'ordine sbagliato: se una creazione era in
   * corso, quella bozza è già superata dai fatti.
   */
  const [commitChecked, setCommitChecked] = useState(false);

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
            const item = film as unknown as CatalogItem;
            setPicks((prev) => new Map(prev).set(wantedFilm, { film: item, specs: defaultSpecsFor(item) }));
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
  // cui si appoggia tutto il resto del wizard, ed è tutto ciò che il palinsesto
  // mostra. Programmando al contrario non serve — lì il periodo non esiste
  // ancora — e sarebbe una lettura di Pretix buttata a ogni tasto premuto sulla
  // data.
  useEffect(() => {
    if (mode === 'film') return;
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
  }, [mode, roomId, startDate, days, occupancyTick]);

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
      else next.set(film.tmdbId!, { film, specs: defaultSpecsFor(film) });
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
    // Lo stesso vale per il permesso di sforare l'orario: viaggia con la stessa
    // chiave e si perde alla stessa condizione — se sposti lo spettacolo, la
    // ragione per cui sforava non c'è più, e la creazione lo ricontrolla.
    setReplacements(new Map(
      chosen
        .map((c, i) => [c, fresh[i]] as const)
        .filter(([c]) => c.replaces.length > 0 || c.outsideHours)
        .map(([c, show]) => [
          commitKey(show),
          {
            replaces: c.replaces, force: c.force, label: c.replacesLabel,
            soldTickets: c.soldTickets, outsideHours: c.outsideHours,
          },
        ])
    ));

    setBusy(true);
    setStartDate(windowStart);
    setDays(span);
    // Se il film era già stato scelto — arrivando da `?tmdb=` — le specifiche
    // spuntate fin lì restano: rifare la voce da zero le butterebbe via.
    setPicks((prev) => new Map([[
      reverseFilm.tmdbId!,
      prev.get(reverseFilm.tmdbId!) ?? { film: reverseFilm, specs: defaultSpecsFor(reverseFilm) },
    ]]));
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
    /**
     * I film da usare, quando non sono ancora quelli nello stato.
     *
     * `setPicks` non è immediato: chi cambia la selezione e ricalcola nello
     * stesso gesto — il cambio film, per esempio — leggerebbe qui la selezione
     * di prima e rigenererebbe il piano che stava cercando di cambiare.
     */
    picks?: Map<string, Pick>;
  } = {}) => {
    const source = opts.picks ?? picks;
    if (!roomId || !startDate || source.size === 0) return;
    setBusy(true);
    try {
      const films = [...source.values()]
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

  // ── Autoprogrammazione ────────────────────────────────────────────────
  /**
   * La settimana già scritta.
   *
   * Scegliere venti titoli prima di vedere un solo orario era la parte che
   * costava le ore, e non perché fosse difficile: perché è un lavoro che si fa
   * meglio **correggendo** che inventando. Qui si arriva al calendario con il
   * periodo già pieno, scelto dalla libreria in base a cosa sta bene in che
   * fascia, e da lì in poi si toglie ciò che non piace.
   *
   * `keep` ed `exclude` fanno sì che rigenerare non ricominci da zero: i film
   * che hai tenuto restano, quelli che hai scartato non si ripresentano.
   */
  const autoPlan = useCallback(async (opts: { keepCurrent?: boolean } = {}) => {
    if (!roomId || !startDate) return;
    setBusy(true);
    try {
      const res = await planningAutoPlan({
        seatingPlanId: roomId,
        startDate,
        days,
        intensity,
        keep: opts.keepCurrent ? [...picks.keys()] : undefined,
        exclude: [...rejected],
      });

      const next = new Map<string, Pick>();
      for (const c of res.chosen) {
        if (!c.film.tmdbId) continue;
        const item = c.film as unknown as CatalogItem;
        next.set(c.film.tmdbId, {
          film: item,
          replicas: c.replicas,
          preferredBand: c.preferredBand,
          specs: defaultSpecsFor(item),
        });
      }

      setPicks(next);
      setShows(res.shows);
      setWarnings(res.warnings);
      setExistingDays(res.existing);
      setStep(3);
      window.scrollTo({ top: 0 });
    } catch (e) {
      console.error('[Programmazione] autoprogrammazione', e);
      window.alert('Non sono riuscito a costruire il piano. Vedi la console per il dettaglio.');
    } finally {
      setBusy(false);
    }
  }, [roomId, startDate, days, intensity, picks, rejected]);

  // ── Cambio film in due clic ───────────────────────────────────────────
  /**
   * Sostituisce il film di uno spettacolo, o di tutti i suoi spettacoli.
   *
   * I due casi non passano dalla stessa strada, ed è voluto:
   *
   * - **uno solo** si può sostituire sul posto, perché il pannello ha già
   *   verificato che il film nuovo ci sta in quell'orario. Resta bloccato lì.
   * - **tutti** no: le altre repliche stanno in orari con spazi diversi, e un
   *   film più lungo non è detto che ci entri. Quindi si cambia la selezione e
   *   si richiama il motore, lasciando fermo tutto il resto del piano. È più
   *   lento di un decimo di secondo e non può produrre un piano impossibile.
   */
  const applySwap = useCallback(async (film: CatalogItem, scope: 'one' | 'all') => {
    const target = swapTarget;
    if (!target || !film.tmdbId) return;

    const runtime = runtimeOf(film) ?? 0;
    if (runtime <= 0) return;

    setSwapTarget(null);
    // Il film scartato non deve tornare alla prossima rigenerazione: è una
    // risposta che hai già dato.
    setRejected((prev) => new Set(prev).add(target.tmdbId));

    if (scope === 'one') {
      const replaced = shows.map((s) =>
        showKey(s) === target.key
          ? {
              ...s,
              tmdbId: film.tmdbId!,
              title: film.title,
              runtime,
              posterPath: film.posterPath ?? undefined,
              endMinute: s.startMinute + runtime,
              endTime: formatClock(s.startMinute + runtime),
              locked: true,
            }
          : s
      );
      setShows(replaced);

      // La selezione segue il piano: il film nuovo entra, quello vecchio esce
      // solo se non gli è rimasto nessuno spettacolo.
      setPicks((prev) => {
        const next = new Map(prev);
        if (!next.has(film.tmdbId!)) {
          next.set(film.tmdbId!, { film, specs: defaultSpecsFor(film) });
        }
        if (!replaced.some((s) => s.tmdbId === target.tmdbId)) next.delete(target.tmdbId);
        return next;
      });
      return;
    }

    // Tutti gli spettacoli di quel film: via il vecchio, dentro il nuovo con le
    // stesse repliche, e si rigenera lasciando fermo il resto.
    const old = picks.get(target.tmdbId);
    const nextPicks = new Map(picks);
    nextPicks.delete(target.tmdbId);
    nextPicks.set(film.tmdbId, {
      film,
      replicas: target.occurrences,
      preferredBand: old?.preferredBand,
      specs: defaultSpecsFor(film),
    });
    setPicks(nextPicks);

    const keepLocked = shows.filter((s) => s.tmdbId !== target.tmdbId);
    await generate({
      picks: nextPicks,
      locked: keepLocked,
      replicaOverrides: new Map(
        [...nextPicks.keys()].map((id) => [
          id,
          id === film.tmdbId
            ? target.occurrences
            : keepLocked.filter((s) => s.tmdbId === id).length,
        ])
      ),
    });
  }, [swapTarget, shows, picks, generate]);

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
   * Segue un lavoro di creazione **facendolo avanzare**.
   *
   * Non esiste nessuno che lo porti avanti in sottofondo, ed è voluto: una
   * promessa lasciata correre su un server serverless muore appena la risposta
   * è partita, ed era esattamente il motivo per cui la creazione di cento
   * spettacoli si fermava a metà. Qui ogni giro fa un lotto vero di lavoro.
   *
   * Ripetere è sicuro: ogni spettacolo è una riga con chiave unica che, appena
   * creata, si porta dietro il suo id Pretix. Un giro di troppo non ricrea
   * niente, e due schede aperte insieme nemmeno — le righe si prenotano.
   */
  const followJob = useCallback(async (id: string, opts: { resumed?: boolean } = {}) => {
    setRunning(true);
    setResumed(Boolean(opts.resumed));
    setJobId(id);
    setStep(4);
    window.localStorage.setItem(JOB_STORAGE_KEY, id);
    window.scrollTo({ top: 0 });

    try {
      for (;;) {
        const job = await planningCommitTick(id);

        if (!job) {
          // L'id non esiste più. Non si rilancia: si va a guardare la sala.
          setProgress({ step: 'Non trovo più questo lavoro: ricontrolla la sala.', done: 1, total: 1 });
          window.localStorage.removeItem(JOB_STORAGE_KEY);
          break;
        }

        setProgress({ step: job.step, done: job.done, total: job.total });
        setCreated(job.created.length);
        setFailures(job.errors);

        if (job.state === 'done' || job.state === 'error') {
          // Gli spettacoli creati escono dal piano: se poi si riprova, si
          // riprovano solo i falliti.
          const failedKeys = new Set(job.errors.map((e) => e.key));
          setShows((prev) => prev.filter((s) => failedKeys.has(commitKey(s))));
          window.localStorage.removeItem(JOB_STORAGE_KEY);
          // Il piano è in sala: la bozza non serve più, e lasciarla farebbe
          // proporre di "riprendere" qualcosa che è già stato creato.
          if (job.errors.length === 0 && roomId) planningDropDraft(roomId).catch(() => null);
          break;
        }

        // Un respiro fra un lotto e l'altro: serve a far vedere la barra che
        // avanza, non al server.
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e) {
      console.error('[Programmazione] avanzamento', e);
      setFailures((prev) => [
        ...prev,
        { key: 'tick', label: 'Avanzamento della creazione', error: String(e) },
      ]);
    } finally {
      setRunning(false);
    }
  }, [roomId]);

  /**
   * Avvia la creazione.
   *
   * La sequenza vera (metadati, sub-eventi, sync) sta in `commitRunner`, la
   * stessa che serve l'app Swift: qui si registra il lavoro e lo si fa
   * avanzare. Averne una copia sul client avrebbe significato due
   * implementazioni della stessa cosa, pronte a divergere alla prima
   * correzione fatta su una sola.
   */
  const runCommit = useCallback(async (targets: ScheduledShow[]) => {
    if (!roomId || targets.length === 0) return;
    setFailures([]);
    setCreated(0);

    const sent = [...targets].sort((a, b) => a.startMinute - b.startMinute);
    setProgress({ step: 'Registro il piano…', done: 0, total: sent.length });

    try {
      const { jobId: id } = await planningCommitStart({
        seatingPlanId: roomId,
        shows: sent.map((s) => {
          // La sostituzione si riattacca qui, alla stessa chiave con cui era
          // stata registrata: uno spettacolo spostato nel frattempo non la
          // ritrova, e quindi non cancella niente.
          const replacing = replacements.get(commitKey(s));
          // Le specifiche stanno sul film e si copiano su ogni suo spettacolo:
          // al commit ogni spettacolo viaggia da solo, e da lì in poi resta
          // modificabile uno per uno senza toccare gli altri.
          const pick = picks.get(s.tmdbId);
          const specs = normalizeProjectionSpecs(pick?.specs);
          const specsNote = pick?.specsNote?.trim();
          return {
            tmdbId: s.tmdbId,
            date: s.date,
            time: s.time,
            title: s.title,
            ...(specs.length ? { specs } : {}),
            ...(specsNote ? { specsNote } : {}),
            ...(replacing?.replaces.length
              ? { replaces: replacing.replaces, forceReplace: replacing.force }
              : {}),
            ...(replacing?.outsideHours ? { allowOutsideHours: true } : {}),
          };
        }),
      });

      await followJob(id);
    } catch (e) {
      console.error('[Programmazione] conferma', e);
      setStep(4);
      setRunning(false);
      setFailures([{ key: 'start', label: 'Avvio della creazione', error: String(e) }]);
    }
  }, [roomId, replacements, picks, followJob]);

  /** Riprova i falliti: quelli già creati non si toccano mai. */
  const retryFailures = useCallback(async () => {
    if (!jobId) return;
    await planningCommitRetry(jobId);
    await followJob(jobId);
  }, [jobId, followJob]);

  /**
   * Il lavoro interrotto, ripreso all'apertura.
   *
   * È la ragione per cui la pagina non deve più restare aperta per ore: se la
   * creazione era a metà — portatile chiuso, wifi caduto, scheda ricaricata —
   * qui la si ritrova e la si porta a termine. Non si ricrea niente: il lavoro
   * sa già quali spettacoli sono nati e li salta.
   *
   * L'id si cerca prima nel browser e poi, se lì non c'è, nella sala: capita di
   * riaprire da un altro computer, e un lavoro appeso non deve restare appeso
   * solo perché il filo era in un `localStorage` che non è questo.
   */
  useEffect(() => {
    if (running || jobId) return;
    let cancelled = false;

    async function resume() {
      const stored = window.localStorage.getItem(JOB_STORAGE_KEY);
      let id = stored;

      if (!id && roomId) {
        id = await planningFindOpenCommit(roomId).catch(() => null);
      }
      if (!id || cancelled) { setCommitChecked(true); return; }

      const job = await planningCommitStatus(id).catch(() => null);
      if (cancelled) return;

      if (!job || job.state === 'done' || job.state === 'error') {
        // Finito mentre non guardavamo: il filo non serve più.
        window.localStorage.removeItem(JOB_STORAGE_KEY);
        setCommitChecked(true);
        return;
      }

      const quanti = job.total - job.done;
      const ok = window.confirm(
        `C'è una creazione rimasta a metà: ${job.done} spettacoli su ${job.total} sono già in sala, ` +
        `ne mancano ${quanti}.\n\nLa riprendo da dove era? Gli spettacoli già creati non verranno rifatti.`
      );
      if (!ok || cancelled) {
        window.localStorage.removeItem(JOB_STORAGE_KEY);
        setCommitChecked(true);
        return;
      }

      await followJob(id, { resumed: true });
    }

    resume();
    return () => { cancelled = true; };
  }, [roomId, running, jobId, followJob]);

  // ── La bozza ──────────────────────────────────────────────────────────
  /**
   * Il piano, salvato mentre lo costruisci.
   *
   * Tutto lo stato di questo wizard viveva nel browser: un ricaricamento, una
   * scheda chiusa per sbaglio o un wifi caduto e il lavoro di un pomeriggio
   * spariva. Qui ne va su una fotografia a ogni modifica — poche centinaia di
   * byte — e all'apertura si può riprendere.
   *
   * Non è un salvataggio automatico di cui fidarsi ciecamente: è una rete. Se
   * fallisce non succede niente e non lo si dice, perché il lavoro vero
   * prosegue lo stesso.
   */
  const draftReady = useRef(false);

  useEffect(() => {
    if (!roomId || !draftReady.current) return;
    if (mode === 'palinsesto') return;
    // Un piano vuoto non è una bozza: salvarlo cancellerebbe quella buona.
    if (picks.size === 0 && shows.length === 0) return;

    const snapshot = {
      mode,
      step,
      picks: [...picks.entries()],
      shows,
      warnings,
      replacements: [...replacements.entries()],
      rejected: [...rejected],
    };

    const t = setTimeout(() => {
      planningSaveDraft(roomId, {
        startDate,
        days,
        intensity,
        state: snapshot,
        showCount: shows.length,
      }).catch(() => null);
    }, 1200);

    return () => clearTimeout(t);
  }, [roomId, mode, step, picks, shows, warnings, replacements, rejected, startDate, days, intensity]);

  /** All'apertura: c'è una bozza per questa sala? */
  useEffect(() => {
    // Prima si guarda se c'era una creazione a metà: se c'era, la bozza è già
    // superata dai fatti e chiederlo sarebbe una domanda di troppo.
    if (!roomId || draftReady.current || !commitChecked || jobId) return;
    let cancelled = false;

    async function offer() {
      const draft = await planningLoadDraft(roomId!).catch(() => null);
      if (cancelled) return;

      // Da qui in poi si salva: prima no, o il primo render sovrascriverebbe
      // la bozza con lo stato vuoto di partenza.
      draftReady.current = true;
      if (!draft) return;

      const state = draft.state as {
        mode?: PlanningMode; step?: WizardStep;
        picks?: [string, Pick][]; shows?: ScheduledShow[];
        warnings?: string[];
        replacements?: [string, { replaces: number[]; force: boolean; label?: string; soldTickets: number; outsideHours?: boolean }][];
        rejected?: string[];
      } | null;

      if (!state?.shows?.length && !state?.picks?.length) return;

      const quando = new Date(draft.updatedAt).toLocaleString('it-IT', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      });
      const ok = window.confirm(
        `C'è un piano lasciato a metà il ${quando}: ${draft.showCount} spettacoli su ${draft.days} giorni.\n\n` +
        'Lo riprendo? (Annulla per ricominciare da zero.)'
      );
      if (!ok || cancelled) {
        await planningDropDraft(roomId!).catch(() => null);
        return;
      }

      setStartDate(draft.startDate);
      setDays(draft.days);
      setIntensity(draft.intensity as Intensity);
      if (state.mode) setMode(state.mode);
      if (state.picks) setPicks(new Map(state.picks));
      if (state.shows) setShows(state.shows);
      if (state.warnings) setWarnings(state.warnings);
      if (state.replacements) setReplacements(new Map(state.replacements));
      if (state.rejected) setRejected(new Set(state.rejected));
      // Il passo 4 non si riprende da qui: quella è la creazione, e ha un suo
      // recupero che sa cosa è già stato creato davvero.
      setStep(state.step && state.step < 4 ? state.step : 3);
    }

    offer();
    return () => { cancelled = true; };
  }, [roomId, commitChecked, jobId]);

  const restart = () => {
    if (roomId) planningDropDraft(roomId).catch(() => null);
    setRejected(new Set());
    setJobId(null);
    setResumed(false);
    window.localStorage.removeItem(JOB_STORAGE_KEY);
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

        {mode !== 'palinsesto' && (
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
        )}

        <Link className={styles.exitBtn} href="/admin/programma" title="Torna al tavolo"><X size={19} /></Link>
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

      {mode === 'palinsesto' && (
        <Palinsesto
          rooms={rooms}
          roomId={roomId}
          onRoomChange={(id) => { setRoomId(id); localStorage.setItem('defaultSalaId', String(id)); }}
          startDate={startDate}
          onStartDateChange={setStartDate}
          days={days}
          onDaysChange={setDays}
          occupancy={occupancy}
          loading={loadingOccupancy}
          onReload={() => setOccupancyTick((t) => t + 1)}
        />
      )}

      {step === 2 && mode === 'period' && (
        <>
          <div className={styles.viewToggle}>
            <button
              type="button"
              className={catalogView === 'board' ? styles.viewToggleOn : ''}
              onClick={() => setCatalogView('board')}
            >
              <LayoutGrid size={15} /> Tabellone · 100 film
            </button>
            <button
              type="button"
              className={catalogView === 'rails' ? styles.viewToggleOn : ''}
              onClick={() => setCatalogView('rails')}
            >
              <Rows3 size={15} /> Corsie e filtri
            </button>
          </div>

          {catalogView === 'board' ? (
            <StepBoard picks={picks} onToggle={togglePick} />
          ) : (
            <StepCatalog
              picks={picks}
              onToggle={togglePick}
              onUpdatePick={updatePick}
              gaps={gaps}
              genresInSchedule={genresInSchedule}
            />
          )}
        </>
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
          onSpecsChange={updatePick}
          onRegenerate={regenerate}
          replacements={replacements}
          onSwapRequest={setSwapTarget}
        />
      )}

      {swapTarget && (
        <SwapPanel
          target={swapTarget}
          exclude={[...new Set(shows.map((s) => s.tmdbId))]}
          busy={busy}
          onClose={() => setSwapTarget(null)}
          onSwap={applySwap}
        />
      )}

      {step === 4 && (
        <StepCommit
          running={running}
          progress={progress}
          created={created}
          failures={failures}
          onRetry={retryFailures}
          onRestart={restart}
          resumed={resumed}
        />
      )}

      {step < 4 && mode !== 'palinsesto' && (
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

          {step === 1 && mode === 'period' && (
            <>
              {/*
                Il pulsante principale è questo, non "scegli i film": partire da
                una programmazione già fatta e correggerla è molto più rapido
                che costruirla da zero, e finché il percorso a mano era l'unico
                una settimana costava ore. Scegliere i film resta a fianco, per
                quando hai già in testa cosa vuoi proiettare.
              */}
              <button
                className={styles.ctaBtn}
                onClick={() => autoPlan()}
                disabled={!canAdvance || busy}
                title="Riempio il periodo con i film della tua libreria, poi correggi"
              >
                {busy
                  ? <><Loader2 size={19} className={styles.spin} /> Costruisco la programmazione…</>
                  : <><Zap size={19} /> Programma tu · {days} giorn{days === 1 ? 'o' : 'i'}</>}
              </button>
              <button
                className={styles.ghostBtn}
                onClick={() => setStep(2)}
                disabled={!canAdvance || busy}
              >
                <Clapperboard size={17} /> Scelgo io i film
              </button>
            </>
          )}
          {step === 1 && mode === 'film' && (
            <button className={styles.ctaBtn} onClick={() => setStep(2)} disabled={!canAdvance}>
              <CalendarClock size={19} /> Trova gli orari liberi
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
