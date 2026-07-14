'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Wand2, Dices, Check, Trash2, ArrowLeft, RefreshCw, Loader2,
  CalendarCheck, TriangleAlert, Search, Sparkles, Clapperboard, ChevronRight,
} from 'lucide-react';
import styles from './Planner.module.css';
import { catalogRandomMany } from '@/actions/catalogActions';
import {
  adminGetSeatingPlans,
  adminGenerateAutoPlan,
  adminPrepareMetadata,
  adminScheduleMovie,
  adminSyncNewlyCreatedEvents,
  type AutoPlanShow,
  type AutoPlanIntensity,
} from '@/actions/adminActions';
import { getTMDBImageUrl } from '@/services/tmdb.utils';

type BatchFilm = {
  id: number;
  title: string;
  year: number | null;
  durationMin: number | null;
  director: string | null;
  tmdbId: string | null;
  posterPath: string | null;
  genres: string[];
  verifyStatus: string;
  scheduledCount: number;
};

type Phase = 'select' | 'plan' | 'running' | 'done';

const INTENSITIES: { key: AutoPlanIntensity; label: string; hint: string }[] = [
  { key: 'soft', label: '🌙 Rilassata', hint: '2 spettacoli nei feriali · 3 nel weekend' },
  { key: 'normal', label: '🎬 Normale', hint: '3 spettacoli nei feriali · 4 nel weekend' },
  { key: 'festival', label: '🎪 Festival', hint: '4 spettacoli nei feriali · 5 nel weekend' },
];

const BAND_CLASS: Record<AutoPlanShow['band'], string> = {
  'Matinée': 'bandMatinee',
  'Pomeriggio': 'bandPomeriggio',
  'Prima serata': 'bandSera',
  'Seconda serata': 'bandNotte',
};

function tomorrowISO(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PlannerPage() {
  const [phase, setPhase] = useState<Phase>('select');

  // ── Catalogo: vetrina di 100 film ────────────────────────────────────────
  const [films, setFilms] = useState<BatchFilm[]>([]);
  const [loadingBatch, setLoadingBatch] = useState(true);
  const [includeScheduled, setIncludeScheduled] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, BatchFilm>>(new Map());

  // ── Opzioni piano ────────────────────────────────────────────────────────
  const [seatingPlans, setSeatingPlans] = useState<any[]>([]);
  const [roomId, setRoomId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(tomorrowISO());
  const [days, setDays] = useState(7);
  const [intensity, setIntensity] = useState<AutoPlanIntensity>('normal');

  // ── Piano generato ───────────────────────────────────────────────────────
  const [plan, setPlan] = useState<AutoPlanShow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  // ── Esecuzione ───────────────────────────────────────────────────────────
  const [progress, setProgress] = useState<{ step: string; done: number; total: number }>({ step: '', done: 0, total: 1 });
  const [runErrors, setRunErrors] = useState<string[]>([]);
  const [createdCount, setCreatedCount] = useState(0);

  useEffect(() => {
    adminGetSeatingPlans()
      .then((plans) => {
        setSeatingPlans(plans);
        const saved = localStorage.getItem('defaultSalaId');
        const fallback = plans.length > 0 ? plans[0].id.toString() : '';
        setRoomId(saved && plans.some((p: any) => p.id.toString() === saved) ? saved : fallback);
      })
      .catch((err) => console.error('[Planner] caricamento sale fallito', err));
  }, []);

  const loadBatch = async (withScheduled: boolean) => {
    setLoadingBatch(true);
    try {
      const picks = await catalogRandomMany({ hideScheduled: !withScheduled }, 100);
      setFilms(picks as unknown as BatchFilm[]);
    } catch (err) {
      console.error('[Planner] caricamento batch fallito', err);
    } finally {
      setLoadingBatch(false);
    }
  };

  useEffect(() => { loadBatch(includeScheduled); }, [includeScheduled]);

  const visibleFilms = useMemo(() => {
    const usable = films.filter((f) => f.tmdbId && f.verifyStatus !== 'missing');
    const q = search.trim().toLowerCase();
    if (!q) return usable;
    return usable.filter((f) =>
      f.title.toLowerCase().includes(q) || (f.director || '').toLowerCase().includes(q)
    );
  }, [films, search]);

  const toggleFilm = (f: BatchFilm) => {
    if (!f.tmdbId) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(f.tmdbId!)) next.delete(f.tmdbId!);
      else next.set(f.tmdbId!, f);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selected.size === 0 || !roomId || generating) return;
    setGenerating(true);
    try {
      const res = await adminGenerateAutoPlan([...selected.keys()], {
        seatingPlanId: parseInt(roomId),
        startDate,
        days,
        intensity,
      });
      if (!res.success) {
        window.alert('Errore nella generazione del piano: ' + res.error);
        return;
      }
      setPlan(res.plan);
      setWarnings(res.warnings);
      setPhase('plan');
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error('[Planner] generazione fallita', err);
      window.alert('Errore nella generazione del piano (vedi console).');
    } finally {
      setGenerating(false);
    }
  };

  const removeShow = (startMs: number, tmdbId: string) => {
    setPlan((prev) => prev.filter((p) => !(p.startMs === startMs && p.tmdbId === tmdbId)));
  };

  const planByDay = useMemo(() => {
    const groups = new Map<string, AutoPlanShow[]>();
    for (const item of plan) {
      const key = item.date.slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return [...groups.entries()];
  }, [plan]);

  const planSummary = useMemo(() => {
    const counts = new Map<string, { title: string; posterPath: string; count: number }>();
    for (const item of plan) {
      const cur = counts.get(item.tmdbId);
      if (cur) cur.count++;
      else counts.set(item.tmdbId, { title: item.title, posterPath: item.posterPath, count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [plan]);

  const dayLabel = (isoDay: string) => {
    const label = new Date(`${isoDay}T12:00:00`).toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const handleConfirm = async () => {
    if (plan.length === 0 || !roomId) return;
    setPhase('running');
    setRunErrors([]);
    window.scrollTo({ top: 0 });

    const items = [...plan].sort((a, b) => a.startMs - b.startMs);
    const uniqueIds = [...new Set(items.map((i) => i.tmdbId))];
    const total = uniqueIds.length + items.length + 1;
    let done = 0;

    // 1. Metadati arricchiti (premi MUBI, loghi…) una volta sola per film
    const metaCache: Record<string, any> = {};
    for (const id of uniqueIds) {
      const title = items.find((i) => i.tmdbId === id)?.title || id;
      setProgress({ step: `Metadati e premi: ${title}…`, done, total });
      try {
        metaCache[id] = await adminPrepareMetadata(id);
      } catch (err) {
        console.error('[Planner] prepareMetadata fallita per', id, err);
        metaCache[id] = null;
      }
      done++;
    }

    // 2. Creazione sequenziale degli spettacoli su Pretix
    const created: number[] = [];
    const errors: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const [datePart, timePart] = it.date.split('T');
      const cleanTime = timePart.substring(0, 5);
      setProgress({ step: `Spettacolo ${i + 1}/${items.length}: ${it.title} · ${datePart} ${cleanTime}`, done, total });

      const res = await adminScheduleMovie(
        {
          id: it.tmdbId,
          title: it.title,
          overview: it.overview,
          posterPath: it.posterPath,
          language: it.language,
          subtitles: it.subtitles,
          versionLanguage: it.versionLanguage,
        },
        datePart,
        cleanTime,
        parseInt(roomId),
        false,
        0,
        true,
        metaCache[it.tmdbId] ?? undefined
      );

      if (res.success && res.subeventId) created.push(res.subeventId);
      else errors.push(`${it.title} · ${datePart} ${cleanTime}: ${res.error || 'errore sconosciuto'}`);
      done++;
    }

    // 3. Sync chirurgico del database
    if (created.length > 0) {
      setProgress({ step: 'Sincronizzazione database…', done, total });
      const sync = await adminSyncNewlyCreatedEvents(created);
      if (!sync.success) errors.push(`Sync database: ${sync.error}`);
    }

    setCreatedCount(created.length);
    setRunErrors(errors);
    setProgress({ step: 'Completato!', done: total, total });
    setPhase('done');
  };

  const handleRestart = () => {
    setSelected(new Map());
    setPlan([]);
    setWarnings([]);
    setRunErrors([]);
    setCreatedCount(0);
    setPhase('select');
    loadBatch(includeScheduled);
  };

  const progressPct = Math.round((progress.done / progress.total) * 100);
  const stepIndex = phase === 'select' ? 0 : phase === 'plan' ? 1 : 2;

  return (
    <div className={styles.page}>
      {/* ── HEADER ── */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}><Wand2 size={22} /></span>
          <div>
            <h1>Planner Automatico</h1>
            <p>Scegli i film, al resto pensa il cinema</p>
          </div>
        </div>

        <nav className={styles.steps}>
          {['Scegli i film', 'Rivedi il piano', 'In sala!'].map((label, i) => (
            <React.Fragment key={label}>
              {i > 0 && <ChevronRight size={14} className={styles.stepArrow} />}
              <span className={`${styles.step} ${i === stepIndex ? styles.stepActive : ''} ${i < stepIndex ? styles.stepDone : ''}`}>
                <b>{i < stepIndex ? '✓' : i + 1}</b> {label}
              </span>
            </React.Fragment>
          ))}
        </nav>

        <a className={styles.exitBtn} href="/" title="Torna all'admin">
          <X size={20} />
        </a>
      </header>

      {/* ══════════ FASE 1: SELEZIONE ══════════ */}
      {phase === 'select' && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Filtra i 100 film per titolo o regista…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && <button onClick={() => setSearch('')} aria-label="Pulisci"><X size={14} /></button>}
            </div>
            <button className={styles.refreshBtn} onClick={() => loadBatch(includeScheduled)} disabled={loadingBatch}>
              {loadingBatch ? <Loader2 size={16} className={styles.spin} /> : <Dices size={16} />}
              {loadingBatch ? 'Pesco dal catalogo…' : 'Nuovi 100 film'}
            </button>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={includeScheduled}
                onChange={(e) => setIncludeScheduled(e.target.checked)}
              />
              Includi già programmati
            </label>
            <span className={styles.counter}>
              {visibleFilms.length} in vetrina
            </span>
          </div>

          <main className={styles.gridWrap}>
            {loadingBatch && films.length === 0 ? (
              <div className={styles.emptyState}>
                <Loader2 size={34} className={styles.spin} />
                <p>Sto pescando 100 film dal tuo catalogo…</p>
              </div>
            ) : (
              <div className={styles.grid}>
                {visibleFilms.map((f) => {
                  const poster = getTMDBImageUrl(f.posterPath, 'w342');
                  const isSel = f.tmdbId ? selected.has(f.tmdbId) : false;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`${styles.card} ${isSel ? styles.cardSelected : ''}`}
                      onClick={() => toggleFilm(f)}
                      title={`${f.title}${f.director ? ` — ${f.director}` : ''}`}
                    >
                      <div className={styles.posterFrame}>
                        {poster
                          ? <img src={poster} alt={f.title} loading="lazy" />
                          : <span className={styles.posterFallback}><Clapperboard size={30} /></span>}
                        {isSel && (
                          <span className={styles.cardCheck}><Check size={30} strokeWidth={3} /></span>
                        )}
                        {f.scheduledCount > 0 && (
                          <span className={styles.cardBadge}>già in sala ×{f.scheduledCount}</span>
                        )}
                      </div>
                      <span className={styles.cardTitle}>{f.title}</span>
                      <span className={styles.cardMeta}>
                        {f.year || '—'}{f.durationMin ? ` · ${f.durationMin}′` : ''}
                      </span>
                    </button>
                  );
                })}
                {!loadingBatch && visibleFilms.length === 0 && (
                  <div className={styles.emptyState}>
                    <Clapperboard size={34} />
                    <p>Nessun film trovato: prova «Nuovi 100 film» o svuota il filtro.</p>
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Vassoio selezione */}
          {selected.size > 0 && (
            <div className={styles.tray}>
              <span className={styles.trayLabel}>{selected.size} scelt{selected.size === 1 ? 'o' : 'i'}</span>
              <div className={styles.trayScroll}>
                {[...selected.values()].map((f) => {
                  const poster = getTMDBImageUrl(f.posterPath, 'w92');
                  return (
                    <div key={f.tmdbId} className={styles.trayItem} title={f.title}>
                      {poster
                        ? <img src={poster} alt={f.title} />
                        : <span className={styles.trayFallback}>🎞️</span>}
                      <button onClick={() => toggleFilm(f)} aria-label={`Rimuovi ${f.title}`}><X size={12} strokeWidth={3} /></button>
                    </div>
                  );
                })}
              </div>
              <button className={styles.trayClear} onClick={() => setSelected(new Map())}>Svuota</button>
            </div>
          )}

          {/* Barra opzioni + CTA */}
          <footer className={styles.footer}>
            <div className={styles.options}>
              <label>
                <span>Sala</span>
                <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                  {seatingPlans.map((room: any) => (
                    <option key={room.id} value={room.id}>
                      {room.isFavorite ? '⭐ ' : ''}{room.internalName || room.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Dal giorno</span>
                <input type="date" value={startDate} min={tomorrowISO()} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label>
                <span>Per quanti giorni</span>
                <select value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
                  <option value={3}>3 giorni</option>
                  <option value={7}>1 settimana</option>
                  <option value={10}>10 giorni</option>
                  <option value={14}>2 settimane</option>
                </select>
              </label>
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
            </div>

            <button
              className={styles.ctaBtn}
              onClick={handleGenerate}
              disabled={selected.size === 0 || !roomId || generating}
            >
              {generating
                ? <><Loader2 size={20} className={styles.spin} /> Penso come un cinema…</>
                : <><Sparkles size={20} /> Genera programmazione{selected.size > 0 ? ` · ${selected.size} film` : ''}</>}
            </button>
          </footer>
        </>
      )}

      {/* ══════════ FASE 2: ANTEPRIMA PIANO ══════════ */}
      {phase === 'plan' && (
        <>
          <main className={styles.planWrap}>
            {warnings.length > 0 && (
              <div className={styles.warnings}>
                {warnings.map((w, i) => <div key={i}><TriangleAlert size={15} /> {w}</div>)}
              </div>
            )}

            <div className={styles.summaryChips}>
              {planSummary.map((s) => (
                <span key={s.title} className={styles.chip}>{s.title} <b>×{s.count}</b></span>
              ))}
            </div>

            <div className={styles.planList}>
              {planByDay.map(([day, shows]) => (
                <section key={day} className={styles.dayCard}>
                  <div className={styles.dayHeader}>
                    <span>{dayLabel(day)}</span>
                    <span className={styles.dayCount}>{shows.length} spettacol{shows.length === 1 ? 'o' : 'i'}</span>
                  </div>
                  {shows.map((s) => {
                    const poster = getTMDBImageUrl(s.posterPath, 'w154');
                    return (
                      <div key={`${s.tmdbId}-${s.startMs}`} className={styles.showRow}>
                        <div className={styles.showTime}>
                          <b>{s.date.slice(11, 16)}</b>
                          <span>fine {s.endLabel}</span>
                        </div>
                        <span className={`${styles.band} ${styles[BAND_CLASS[s.band]]}`}>{s.band}</span>
                        <div className={styles.showPosterFrame}>
                          {poster
                            ? <img src={poster} alt={s.title} loading="lazy" />
                            : <span className={styles.posterFallback}>?</span>}
                        </div>
                        <div className={styles.showMain}>
                          <div className={styles.showTitle}>{s.title}</div>
                          <div className={styles.showMeta}>{s.runtime}′ · {s.versionLanguage}</div>
                        </div>
                        <button
                          className={styles.btnDanger}
                          onClick={() => removeShow(s.startMs, s.tmdbId)}
                          title="Togli questo spettacolo dal piano"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </section>
              ))}
              {plan.length === 0 && (
                <div className={styles.emptyState}>
                  <Clapperboard size={34} />
                  <p>Piano vuoto: torna alla selezione e rigenera.</p>
                </div>
              )}
            </div>
          </main>

          <footer className={styles.footer}>
            <button className={styles.ghostBtn} onClick={() => setPhase('select')}>
              <ArrowLeft size={17} /> Cambia film
            </button>
            <button className={styles.ghostBtn} onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 size={17} className={styles.spin} /> : <RefreshCw size={17} />} Rigenera con orari nuovi
            </button>
            <button className={styles.ctaBtn} onClick={handleConfirm} disabled={plan.length === 0}>
              <CalendarCheck size={20} /> Conferma · crea {plan.length} spettacoli
            </button>
          </footer>
        </>
      )}

      {/* ══════════ FASE 3: ESECUZIONE / FINE ══════════ */}
      {(phase === 'running' || phase === 'done') && (
        <main className={styles.runPanel}>
          <div className={styles.runCard}>
            <h2>{phase === 'running' ? '🎬 Sto creando gli spettacoli…' : '🍿 Programmazione in sala!'}</h2>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </div>
            <div className={styles.progressStep}>{progress.step} ({progressPct}%)</div>

            {phase === 'done' && (
              <>
                <div className={styles.doneSummary}>
                  Creati <b>{createdCount}</b> spettacoli{runErrors.length > 0 ? ` · ${runErrors.length} errori` : ' senza errori'}.
                </div>
                {runErrors.length > 0 && (
                  <div className={styles.errorList}>
                    {runErrors.map((e, i) => <div key={i}><TriangleAlert size={13} /> {e}</div>)}
                  </div>
                )}
                <div className={styles.doneActions}>
                  <button className={styles.ghostBtn} onClick={handleRestart}>
                    <Wand2 size={17} /> Fai un altro piano
                  </button>
                  <a className={styles.ctaBtn} href="/">
                    <Check size={20} /> Torna all&apos;admin
                  </a>
                </div>
              </>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
