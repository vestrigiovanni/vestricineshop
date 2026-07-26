'use client';

/**
 * PASSO 2 — IL CATALOGO.
 *
 * Griglia filtrabile più corsie tematiche. La corsia "Perfetti per questo slot"
 * esiste solo perché il periodo è già stato scelto al passo 1: conosce le
 * durate dei buchi liberi e propone film che ci incastrano.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Check, Clapperboard, Dices, Loader2, Search, Star, X } from 'lucide-react';
import styles from './Programmazione.module.css';
import {
  catalogAddByTmdbId, catalogGetFacets, catalogGetRails, catalogList, catalogSearchTmdb,
} from '@/actions/catalogActions';
import { CATALOG_RAIL_HINTS, RUNTIME_BUCKETS, type RuntimeBucketKey } from '@/constants/catalogRails';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { BAND_CHOICES, runtimeOf, type CatalogItem, type Pick } from './types';
import type { Band } from '@/services/scheduling/times';

interface Props {
  picks: Map<string, Pick>;
  onToggle: (film: CatalogItem) => void;
  onUpdatePick: (tmdbId: string, patch: Partial<Omit<Pick, 'film'>>) => void;
  /** Durate dei buchi liberi trovati al passo 1. */
  gaps: number[];
  genresInSchedule: string[];
}

type Rail = { rail: string; label: string; films: CatalogItem[] };

/** Un risultato grezzo di TMDB, per i film che in catalogo non ci sono ancora. */
interface TmdbHit {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
}

function FilmCard({
  film, selected, onClick, compact = false,
}: { film: CatalogItem; selected: boolean; onClick: () => void; compact?: boolean }) {
  const poster = getTMDBImageUrl(film.posterPath, 'w342');
  const rt = runtimeOf(film);
  return (
    <button
      type="button"
      className={`${styles.filmCard} ${compact ? styles.filmCardCompact : ''} ${selected ? styles.filmCardSelected : ''}`}
      onClick={onClick}
      title={`${film.title}${film.director ? ` — ${film.director}` : ''}`}
    >
      <span className={styles.posterFrame}>
        {poster
          ? <img src={poster} alt="" loading="lazy" />
          : <span className={styles.posterFallback}><Clapperboard size={26} /></span>}
        {selected && <span className={styles.cardCheck}><Check size={26} strokeWidth={3} /></span>}
        {film.scheduledCount > 0 && <span className={styles.cardBadge}>in sala ×{film.scheduledCount}</span>}
        {film.awardLabels.length > 0 && (
          <span className={styles.cardAward} title={film.awardLabels.slice(0, 4).join(' · ')}>
            <Award size={11} /> {film.awardLabels.length}
          </span>
        )}
      </span>
      <span className={styles.cardTitle}>{film.title}</span>
      <span className={styles.cardMeta}>
        {film.year || '—'}{rt ? ` · ${rt}′` : ''}
        {film.voteAverage ? <> · <Star size={9} /> {film.voteAverage.toFixed(1)}</> : null}
      </span>
    </button>
  );
}

export default function StepCatalog({ picks, onToggle, onUpdatePick, gaps, genresInSchedule }: Props) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [genre, setGenre] = useState('');
  const [decade, setDecade] = useState('');
  const [bucket, setBucket] = useState<RuntimeBucketKey | ''>('');
  const [hideScheduled, setHideScheduled] = useState(true);
  const [onlyInPlex, setOnlyInPlex] = useState(false);

  const [facets, setFacets] = useState<{ genres: string[]; decades: number[] }>({ genres: [], decades: [] });
  const [rails, setRails] = useState<Rail[]>([]);
  const [grid, setGrid] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingRails, setLoadingRails] = useState(true);
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [railNonce, setRailNonce] = useState(0);
  const [tmdbResults, setTmdbResults] = useState<TmdbHit[]>([]);
  const [tmdbBusy, setTmdbBusy] = useState(false);

  // La ricerca aspetta che tu abbia finito di scrivere: senza attesa ogni
  // lettera sarebbe una query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    catalogGetFacets()
      .then((f) => setFacets({ genres: f.genres, decades: f.decades }))
      .catch((e) => console.error('[Programmazione] facets', e));
  }, []);

  const params = useMemo(() => ({
    search: debounced || undefined,
    genre: genre || undefined,
    decade: decade ? Number(decade) : undefined,
    minRuntime: bucket ? RUNTIME_BUCKETS.find((b) => b.key === bucket)?.min : undefined,
    maxRuntime: bucket ? RUNTIME_BUCKETS.find((b) => b.key === bucket)?.max : undefined,
    hideScheduled,
    onlyInPlex,
  }), [debounced, genre, decade, bucket, hideScheduled, onlyInPlex]);

  // Le corsie sono cinque query: senza il flag di annullamento, una risposta
  // lenta arrivata in ritardo sovrascriverebbe quella dei filtri più recenti.
  useEffect(() => {
    let cancelled = false;
    async function loadRails() {
      setLoadingRails(true);
      try {
        const r = await catalogGetRails(params, { perRail: 18, gaps, genresInSchedule });
        if (!cancelled) setRails(r as unknown as Rail[]);
      } catch (e) {
        console.error('[Programmazione] corsie', e);
      } finally {
        if (!cancelled) setLoadingRails(false);
      }
    }
    loadRails();
    return () => { cancelled = true; };
  }, [params, gaps, genresInSchedule, railNonce]);

  useEffect(() => {
    let cancelled = false;
    async function loadGrid() {
      setLoadingGrid(true);
      try {
        const r = await catalogList({ ...params, pageSize: 60, sort: 'titleAsc' });
        if (cancelled) return;
        setGrid(r.films as unknown as CatalogItem[]);
        setTotal(r.total);
      } catch (e) {
        console.error('[Programmazione] catalogo', e);
      } finally {
        if (!cancelled) setLoadingGrid(false);
      }
    }
    loadGrid();
    return () => { cancelled = true; };
  }, [params]);

  const isPicked = useCallback((f: CatalogItem) => Boolean(f.tmdbId && picks.has(f.tmdbId)), [picks]);
  const usable = (f: CatalogItem) => Boolean(f.tmdbId) && f.verifyStatus !== 'missing';

  const hasFilters = Boolean(debounced || genre || decade || bucket || onlyInPlex);

  /**
   * La rete di sicurezza per i film che in catalogo non ci sono ancora — una
   * novità appena uscita, un titolo non ancora entrato in libreria. Cercarlo su
   * TMDB, aggiungerlo al catalogo e selezionarlo è la capacità che la vecchia
   * "Cerca Film (TMDB)" copriva; senza, toglierla sarebbe una perdita.
   */
  const searchOnTmdb = async () => {
    if (!debounced) return;
    setTmdbBusy(true);
    setTmdbResults([]);
    try {
      const res = await catalogSearchTmdb(debounced);
      setTmdbResults(res.slice(0, 8) as TmdbHit[]);
    } catch (e) {
      console.error('[Programmazione] ricerca TMDB', e);
    } finally {
      setTmdbBusy(false);
    }
  };

  const addFromTmdb = async (hit: TmdbHit) => {
    setTmdbBusy(true);
    try {
      await catalogAddByTmdbId(String(hit.id));
      // Rileggiamo la riga appena creata: solo il catalogo conosce la durata e
      // i generi normalizzati che servono al motore.
      const fresh = await catalogList({ search: hit.title, pageSize: 10 });
      const added = (fresh.films as unknown as CatalogItem[]).find((f) => f.tmdbId === String(hit.id));
      if (added) {
        onToggle(added);
        setTmdbResults([]);
        setSearch('');
      }
    } catch (e) {
      console.error('[Programmazione] aggiunta da TMDB', e);
      window.alert('Non sono riuscito ad aggiungerlo al catalogo.');
    } finally {
      setTmdbBusy(false);
    }
  };

  return (
    <main className={styles.stepBody}>
      {/* ── Filtri ─────────────────────────────────────────────────────── */}
      <section className={styles.filterBar}>
        <div className={styles.searchBox}>
          <Search size={16} />
          <input
            type="text"
            placeholder="Cerca per titolo o regista…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')} aria-label="Pulisci ricerca"><X size={14} /></button>}
        </div>

        <select value={genre} onChange={(e) => setGenre(e.target.value)} className={styles.filterSelect}>
          <option value="">Tutti i generi</option>
          {facets.genres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>

        <select value={decade} onChange={(e) => setDecade(e.target.value)} className={styles.filterSelect}>
          <option value="">Tutti i decenni</option>
          {facets.decades.map((d) => <option key={d} value={d}>anni {String(d).slice(2)}</option>)}
        </select>

        <select
          value={bucket}
          onChange={(e) => setBucket(e.target.value as RuntimeBucketKey | '')}
          className={styles.filterSelect}
        >
          <option value="">Qualsiasi durata</option>
          {RUNTIME_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>

        <label className={styles.toggle}>
          <input type="checkbox" checked={hideScheduled} onChange={(e) => setHideScheduled(e.target.checked)} />
          Nascondi già programmati
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={onlyInPlex} onChange={(e) => setOnlyInPlex(e.target.checked)} />
          Solo in libreria
        </label>

        {hasFilters && (
          <button
            className={styles.clearFilters}
            onClick={() => { setSearch(''); setGenre(''); setDecade(''); setBucket(''); setOnlyInPlex(false); }}
          >
            <X size={13} /> Azzera filtri
          </button>
        )}
      </section>

      {/* ── Corsie ─────────────────────────────────────────────────────── */}
      <section className={styles.rails}>
        {loadingRails && rails.length === 0 && (
          <div className={styles.emptyState}><Loader2 size={28} className={styles.spin} /><p>Preparo le corsie…</p></div>
        )}
        {rails.map((r) => (
          <div key={r.rail} className={styles.rail}>
            <div className={styles.railHead}>
              <h3>{r.label}</h3>
              <span className={styles.railHint}>{CATALOG_RAIL_HINTS[r.rail as keyof typeof CATALOG_RAIL_HINTS]}</span>
              {r.rail === 'surprise' && (
                <button className={styles.railShuffle} onClick={() => setRailNonce((n) => n + 1)} title="Ripesca">
                  <Dices size={14} /> Ripesca
                </button>
              )}
            </div>
            <div className={styles.railScroll}>
              {r.films.filter(usable).map((f) => (
                <FilmCard key={`${r.rail}-${f.id}`} film={f} selected={isPicked(f)} onClick={() => onToggle(f)} compact />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── Griglia completa ───────────────────────────────────────────── */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          Tutto il catalogo
          <span className={styles.countPill}>{total} film</span>
          {loadingGrid && <Loader2 size={15} className={styles.spin} />}
        </h2>
        <div className={styles.filmGrid}>
          {grid.filter(usable).map((f) => (
            <FilmCard key={f.id} film={f} selected={isPicked(f)} onClick={() => onToggle(f)} />
          ))}
        </div>
        {!loadingGrid && grid.length === 0 && (
          <div className={styles.emptyState}>
            <Clapperboard size={30} />
            <p>Nessun film con questi filtri.</p>
          </div>
        )}

        {/* Il film non è in catalogo? Si pesca da TMDB e ci si aggiunge. */}
        {debounced && !loadingGrid && grid.filter(usable).length < 3 && (
          <div className={styles.tmdbFallback}>
            <p>
              Non trovi <b>{debounced}</b>? Potrebbe non essere ancora in catalogo.
            </p>
            <button className={styles.ghostBtnSmall} onClick={searchOnTmdb} disabled={tmdbBusy}>
              {tmdbBusy ? <Loader2 size={13} className={styles.spin} /> : <Search size={13} />}
              Cercalo su TMDB
            </button>

            {tmdbResults.length > 0 && (
              <div className={styles.tmdbList}>
                {tmdbResults.map((hit) => (
                  <button key={hit.id} className={styles.tmdbHit} onClick={() => addFromTmdb(hit)} disabled={tmdbBusy}>
                    <span className={styles.tmdbPoster}>
                      {hit.poster_path
                        ? <img src={getTMDBImageUrl(hit.poster_path, 'w92') ?? ''} alt="" />
                        : <Clapperboard size={14} />}
                    </span>
                    <span className={styles.tmdbMain}>
                      <b>{hit.title}</b>
                      <span>{hit.release_date?.slice(0, 4) ?? '—'} · aggiungilo al catalogo e scegli</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {total > grid.length && (
          <p className={styles.gridMore}>
            Mostrati i primi {grid.filter(usable).length} di {total}: restringi la ricerca per trovare il resto.
          </p>
        )}
      </section>

      {/* ── Vassoio dei selezionati ────────────────────────────────────── */}
      {picks.size > 0 && (
        <section className={styles.trayPanel}>
          <h3 className={styles.trayTitle}>
            {picks.size} film scelt{picks.size === 1 ? 'o' : 'i'}
            <span className={styles.trayHint}>repliche e fascia sono facoltative: se non decidi, decide il motore</span>
          </h3>
          <div className={styles.trayList}>
            {[...picks.values()].map(({ film, replicas, preferredBand }) => {
              const poster = getTMDBImageUrl(film.posterPath, 'w154');
              return (
                <div key={film.tmdbId} className={styles.trayRow}>
                  <div className={styles.trayPoster}>
                    {poster ? <img src={poster} alt="" /> : <Clapperboard size={18} />}
                  </div>
                  <div className={styles.trayMain}>
                    <b>{film.title}</b>
                    <span>{film.year || '—'}{runtimeOf(film) ? ` · ${runtimeOf(film)}′` : ' · durata ignota'}</span>
                  </div>
                  <label className={styles.trayField}>
                    <span>Repliche</span>
                    <select
                      value={replicas ?? ''}
                      onChange={(e) => onUpdatePick(film.tmdbId!, {
                        replicas: e.target.value ? Number(e.target.value) : undefined,
                      })}
                    >
                      <option value="">auto</option>
                      {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className={styles.trayField}>
                    <span>Fascia</span>
                    <select
                      value={preferredBand ?? ''}
                      onChange={(e) => onUpdatePick(film.tmdbId!, {
                        preferredBand: (e.target.value || undefined) as Band | undefined,
                      })}
                    >
                      {BAND_CHOICES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </label>
                  <button className={styles.trayRemove} onClick={() => onToggle(film)} aria-label={`Togli ${film.title}`}>
                    <X size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
