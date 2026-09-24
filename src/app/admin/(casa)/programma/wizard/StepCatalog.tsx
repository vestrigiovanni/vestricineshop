'use client';

/**
 * PASSO 2 — IL CATALOGO.
 *
 * Griglia filtrabile più corsie tematiche. La corsia "Perfetti per questo slot"
 * esiste solo perché il periodo è già stato scelto al passo 1: conosce le
 * durate dei buchi liberi e propone film che ci incastrano.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Dices, Globe, Loader2, Search, X } from 'lucide-react';
import styles from './Programmazione.module.css';
import { catalogGetFacets, catalogGetRails, catalogList } from '@/actions/catalogActions';
import { CATALOG_RAIL_HINTS, RUNTIME_BUCKETS, type RuntimeBucketKey } from '@/constants/catalogRails';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import FilmCard from './FilmCard';
import Pager from './Pager';
import TmdbSearchModal from './TmdbSearchModal';
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

const GRID_PAGE_SIZE = 60;

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
  const [page, setPage] = useState(1);
  const [loadingRails, setLoadingRails] = useState(true);
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [railNonce, setRailNonce] = useState(0);
  const [tmdbOpen, setTmdbOpen] = useState(false);

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

  // Cambiare filtro riporta a pagina 1: restare alla nona pagina di un elenco
  // che ora ne ha due significherebbe guardare il vuoto. Si azzera durante il
  // render e non in un effetto, così la griglia non fa prima una richiesta con
  // la pagina vecchia e poi subito un'altra con quella giusta.
  const [paramsSeen, setParamsSeen] = useState(params);
  if (paramsSeen !== params) {
    setParamsSeen(params);
    setPage(1);
  }

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
        const r = await catalogList({ ...params, page, pageSize: GRID_PAGE_SIZE, sort: 'titleAsc' });
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
  }, [params, page]);

  const isPicked = useCallback((f: CatalogItem) => Boolean(f.tmdbId && picks.has(f.tmdbId)), [picks]);
  const usable = (f: CatalogItem) => Boolean(f.tmdbId) && f.verifyStatus !== 'missing';

  const hasFilters = Boolean(debounced || genre || decade || bucket || onlyInPlex);

  const pageCount = Math.max(1, Math.ceil(total / GRID_PAGE_SIZE));
  const gridRef = useRef<HTMLElement>(null);
  // Cambiando pagina si resta dove si era, cioè in fondo alla griglia: senza
  // questo salto si guarderebbe la coda della pagina nuova invece della testa.
  const goToPage = (n: number) => {
    setPage(n);
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

        {/* Il catalogo copre ciò che il cinema ha in casa; questa copre il resto. */}
        <button className={styles.ghostBtnSmall} onClick={() => setTmdbOpen(true)}>
          <Globe size={14} /> Cerca su TMDB
        </button>

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
      <section className={styles.panel} ref={gridRef}>
        <h2 className={styles.panelTitle}>
          Tutto il catalogo
          <span className={styles.countPill}>{total} film</span>
          {pageCount > 1 && <span className={styles.countPill}>pagina {page} di {pageCount}</span>}
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

        {/* Il film non è in catalogo? Si pesca da TMDB. */}
        {debounced && !loadingGrid && grid.filter(usable).length < 3 && (
          <div className={styles.tmdbFallback}>
            <p>
              Non trovi <b>{debounced}</b>? Potrebbe non essere ancora in catalogo.
            </p>
            <button className={styles.ghostBtnSmall} onClick={() => setTmdbOpen(true)}>
              <Search size={13} /> Cercalo su TMDB
            </button>
          </div>
        )}
        <Pager
          page={page}
          pageCount={pageCount}
          onChange={goToPage}
          info={`${total} film in tutto — puoi sfogliarli tutti, o restringere con i filtri`}
        />
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

      <TmdbSearchModal
        open={tmdbOpen}
        onClose={() => setTmdbOpen(false)}
        onPick={onToggle}
        pickedIds={new Set(picks.keys())}
        initialQuery={debounced}
      />
    </main>
  );
}
