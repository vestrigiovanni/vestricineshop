'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Info, Plus, Search, Shuffle, X } from 'lucide-react';
import { CATALOG_SORTS, isCatalogSort, type CatalogSort } from '@/services/scheduling/catalogSort';
import { planningCatalogBoard, planningCatalogShelves, type PlanningShelvesResult } from '@/actions/planningActions';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { type BrowserFilm, is4K, metaLine, useFilmCard } from './filmCard';
import FilmInfo from './FilmInfo';
import FilmShelf, { PosterCard } from './FilmShelf';
import styles from './FilmBrowser.module.css';

interface Props {
  /** I film già scelti: restano accesi in ogni riga. */
  selected: Set<string>;
  onToggle: (film: BrowserFilm) => void;
  /** Film da non mostrare (gli scartati della bozza). */
  exclude?: string[];
  /** Il periodo che si sta riempiendo, per l'intestazione. */
  period: string;
}

const HERO_EVERY_MS = 9000;
/** Quanti poster arrivano per volta nella griglia di tutta la libreria. */
const PAGE_SIZE = 96;
const VIEW_KEY = 'vestri-scelta-vista';

type View = 'shelves' | 'all';

/** La vista e l'ordine restano quelli dell'ultima volta, su questo computer. */
function remembered(): { view: View; sort: CatalogSort } {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
    return { view: raw.view === 'all' ? 'all' : 'shelves', sort: isCatalogSort(raw.sort) ? raw.sort : 'mix' };
  } catch {
    return { view: 'shelves', sort: 'mix' };
  }
}

/**
 * La libreria come una videoteca: una vetrina in cima, poi righe con un nome
 * da scorrere di lato. Un clic sul poster lo sceglie; la "i" apre la scheda
 * con trama, cast e trailer. La ricerca, quando c'è, prende il posto delle righe.
 */
export default function FilmBrowser({ selected, onToggle, exclude, period }: Props) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const excludeKey = (exclude ?? []).join(',');
  const key = `${seed}|${excludeKey}`;
  const [result, setResult] = useState<{ key: string; data?: PlanningShelvesResult; failed?: boolean } | null>(null);
  const [info, setInfo] = useState<BrowserFilm | null>(null);

  useEffect(() => {
    let cancelled = false;
    planningCatalogShelves({ seed, exclude: excludeKey ? excludeKey.split(',') : [] })
      .then((data) => { if (!cancelled) setResult({ key, data }); })
      .catch(() => { if (!cancelled) setResult({ key, failed: true }); });
    return () => { cancelled = true; };
  }, [key, seed, excludeKey]);

  const loading = result?.key !== key;
  const data = result?.data;
  const films = data?.films as Record<string, BrowserFilm> | undefined;

  // ── Tutta la libreria ───────────────────────────────────────────────────────

interface AllFilmsProps {
  sort: CatalogSort;
  onSort: (sort: CatalogSort) => void;
  onlyNever: boolean;
  onOnlyNever: (on: boolean) => void;
  seed: number;
  exclude: string;
  selected: Set<string>;
  onToggle: (film: BrowserFilm) => void;
  onInfo: (film: BrowserFilm) => void;
}

/**
 * Tutta la libreria in una griglia, nell'ordine scelto. I poster sono piccoli
 * e arrivano a pagine mentre si scorre: aprirla non scarica mille immagini.
 */
function AllFilms({ sort, onSort, onlyNever, onOnlyNever, seed, exclude, selected, onToggle, onInfo }: AllFilmsProps) {
  const key = `${sort}|${seed}|${onlyNever}|${exclude}`;
  const [state, setState] = useState<{ key: string; films: BrowserFilm[]; total: number; pages: number; next: number; failed?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  // Cambiando ordine in fretta, una risposta vecchia non deve coprire la nuova.
  const latest = useRef(key);

  const load = useCallback(
    (page: number) => {
      setBusy(true);
      planningCatalogBoard({ sort, seed, onlyNever, page, count: PAGE_SIZE, exclude: exclude ? exclude.split(',') : [] })
        .then((r) => {
          if (latest.current !== key) return;
          const films = r.films as unknown as BrowserFilm[];
          setState((prev) => {
            const kept = prev?.key === key && page > 0 ? prev.films : [];
            return { key, films: [...kept, ...films], total: r.total, pages: r.pages, next: page + 1 };
          });
        })
        .catch(() => latest.current === key && setState((prev) => (prev?.key === key && page > 0 ? prev : { key, films: [], total: 0, pages: 0, next: 0, failed: true })))
        .finally(() => setBusy(false));
    },
    [key, sort, seed, onlyNever, exclude],
  );

  useEffect(() => {
    latest.current = key;
    load(0);
  }, [load, key]);

  const current = state?.key === key ? state : null;
  const more = Boolean(current && !current.failed && current.next < current.pages);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || busy) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && current) load(current.next);
    }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, busy, current, load]);

  return (
    <section className={styles.results}>
      <div className={styles.allBar}>
        <h3 className={styles.resultsHead}>
          {current ? `${current.total} film${onlyNever ? ' mai programmati' : ' in libreria'}` : 'Apro la libreria…'}
        </h3>
        <select className={styles.sortSelect} value={sort} onChange={(e) => onSort(e.target.value as CatalogSort)} aria-label="Ordine">
          {CATALOG_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button type="button" className={styles.chip} aria-pressed={onlyNever} onClick={() => onOnlyNever(!onlyNever)}>
          Mai programmati
        </button>
      </div>
      {current?.failed ? (
        <p className={styles.empty}>Non sono riuscito ad aprire la libreria. Riprova.</p>
      ) : current && current.films.length === 0 ? (
        <p className={styles.empty}>Nessun film da mostrare.</p>
      ) : (
        <div className={styles.grid}>
          {(current?.films ?? []).map((f) => (
            <PosterCard key={f.tmdbId ?? f.id} film={f} size="w185" on={Boolean(f.tmdbId && selected.has(f.tmdbId))} onToggle={onToggle} onInfo={onInfo} />
          ))}
          {(!current || more) && Array.from({ length: current ? 6 : 18 }, (_, i) => <span key={`g${i}`} className={styles.ghostCard} />)}
        </div>
      )}
      <div ref={sentinel} aria-hidden="true" />
    </section>
  );
}

// ── La ricerca ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; films: BrowserFilm[]; total: number } | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    planningCatalogBoard({ search: query, count: 120, seed: 1, exclude: excludeKey ? excludeKey.split(',') : [] })
      .then((r) => { if (!cancelled) setFound({ query, films: r.films as unknown as BrowserFilm[], total: r.total }); })
      .catch(() => { if (!cancelled) setFound({ query, films: [], total: 0 }); });
    return () => { cancelled = true; };
  }, [query, excludeKey]);
  const searching = query.length > 0;

  // ── Tutta la libreria ──────────────────────────────────────────────────────
  const [view, setView] = useState<View>(() => remembered().view);
  const [sort, setSort] = useState<CatalogSort>(() => remembered().sort);
  const [onlyNever, setOnlyNever] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ view, sort }));
    } catch {
      // Senza memoria del browser si riparte dagli scaffali: niente di grave.
    }
  }, [view, sort]);

  const shuffle = () => {
    setSeed(Math.floor(Math.random() * 1_000_000));
    // In un ordine fisso, rimescolare vuol dire passare al caso.
    if (view === 'all' && sort !== 'mix' && sort !== 'random') setSort('random');
  };
  const openInfo = useCallback((f: BrowserFilm) => setInfo(f), []);

  return (
    <div className={styles.browser}>
      <div className={styles.bar}>
        <div className={styles.barTitle}>
          <h2>Scegli i film</h2>
          <p>{period} · un clic sul poster lo sceglie, la <Info size={11} /> apre la scheda. Gli orari li penso io.</p>
        </div>
        <label className={styles.search}>
          <Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titolo o regista…" aria-label="Cerca nella libreria" />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Cancella la ricerca">
              <X size={14} />
            </button>
          )}
        </label>
        <div className={styles.views} role="group" aria-label="Come sfogliare la libreria">
          <button type="button" aria-pressed={view === 'shelves'} onClick={() => setView('shelves')}>Scaffali</button>
          <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>Tutto</button>
        </div>
        <button type="button" className={styles.shuffle} onClick={shuffle} disabled={view === 'shelves' && loading} title="Rimetti la libreria in un ordine a caso">
          <Shuffle size={14} /> Rimescola
        </button>
      </div>

      <div className={styles.scroll} data-loading={(view === 'shelves' && !searching && loading && Boolean(data)) || undefined}>
        {searching ? (
          <SearchResults
            query={query}
            found={found?.query === query ? found : null}
            selected={selected}
            onToggle={onToggle}
            onInfo={openInfo}
          />
        ) : view === 'all' ? (
          <AllFilms
            sort={sort}
            onSort={setSort}
            onlyNever={onlyNever}
            onOnlyNever={setOnlyNever}
            seed={seed}
            exclude={excludeKey}
            selected={selected}
            onToggle={onToggle}
            onInfo={openInfo}
          />
        ) : result?.failed ? (
          <p className={styles.empty}>Non sono riuscito ad aprire la libreria. Riprova.</p>
        ) : !data || !films ? (
          <Skeleton />
        ) : data.shelves.length === 0 ? (
          <p className={styles.empty}>In libreria non c’è niente da programmare.</p>
        ) : (
          <>
            <Hero key={result?.key} hero={data.hero} films={films} selected={selected} onToggle={onToggle} onInfo={openInfo} paused={Boolean(info)} />
            <p className={styles.count}>{data.total} film in libreria, in {data.shelves.length} scaffali</p>
            {data.shelves.map((s) => (
              <FilmShelf
                key={s.key}
                title={s.title}
                hint={s.hint}
                films={s.ids.map((id) => films[id]).filter(Boolean)}
                selected={selected}
                onToggle={onToggle}
                onInfo={openInfo}
                action={s.key === 'random' ? (
                  <button type="button" className={styles.shelfAction} onClick={shuffle}><Shuffle size={12} /> Altri</button>
                ) : undefined}
              />
            ))}
          </>
        )}
      </div>

      {info && (
        <FilmInfo
          film={info}
          selected={selected}
          onToggle={onToggle}
          onOpen={setInfo}
          onClose={() => setInfo(null)}
        />
      )}
    </div>
  );
}

// ── La vetrina ──────────────────────────────────────────────────────────────

interface HeroProps {
  hero: PlanningShelvesResult['hero'];
  films: Record<string, BrowserFilm>;
  selected: Set<string>;
  onToggle: (film: BrowserFilm) => void;
  onInfo: (film: BrowserFilm) => void;
  paused: boolean;
}

function Hero({ hero, films, selected, onToggle, onInfo, paused }: HeroProps) {
  const slides = useMemo(() => hero.filter((h) => films[h.tmdbId]), [hero, films]);
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const current = slides[Math.min(index, slides.length - 1)];
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (slides.length < 2 || paused || hover) return;
    timer.current = window.setTimeout(() => setIndex((i) => (i + 1) % slides.length), HERO_EVERY_MS);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [index, slides.length, paused, hover]);

  const card = useFilmCard(current?.tmdbId ?? null);
  if (!current) return null;
  const film = films[current.tmdbId];
  const on = selected.has(current.tmdbId);
  const logo = card?.logoPath ? getTMDBImageUrl(card.logoPath, 'w500') : null;
  const overview = current.overview || card?.overview;
  const genres = (card?.genres ?? film.genres).slice(0, 3).join(' · ');

  return (
    <section className={styles.hero} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-label="In vetrina">
      {slides.map((s, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={s.tmdbId}
          className={styles.heroImg}
          data-on={i === index || undefined}
          src={getTMDBImageUrl(s.backdropPath, 'w1280')}
          alt=""
          loading={i === 0 ? 'eager' : 'lazy'}
        />
      ))}
      <div className={styles.heroShade} />
      <div className={styles.heroBody} key={current.tmdbId}>
        {film.tasteNote && <p className={styles.heroKicker}>{film.tasteNote}</p>}
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.heroLogo} src={logo} alt={film.title} />
        ) : (
          <h3 className={styles.heroTitle}>{film.title}</h3>
        )}
        <p className={styles.heroMeta}>
          {metaLine(film)}
          {genres && <> · {genres}</>}
          {is4K(film) && <span className={styles.badge}>4K</span>}
        </p>
        {film.director && <p className={styles.heroDirector}>di {film.director}</p>}
        {overview && <p className={styles.heroOverview}>{overview}</p>}
        <div className={styles.heroActions}>
          <button type="button" className={styles.heroPrimary} data-on={on || undefined} onClick={() => onToggle(film)}>
            {on ? <><Check size={18} strokeWidth={3} /> Scelto</> : <><Plus size={18} strokeWidth={3} /> Scegli</>}
          </button>
          <button type="button" className={styles.heroSecondary} onClick={() => onInfo(film)}>
            <Info size={18} /> Altre info
          </button>
        </div>
      </div>
      {slides.length > 1 && (
        <div className={styles.heroDots}>
          {slides.map((s, i) => (
            <button
              key={s.tmdbId}
              type="button"
              data-on={i === index || undefined}
              onClick={() => setIndex(i)}
              aria-label={`Vetrina: ${films[s.tmdbId]?.title}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── La ricerca ──────────────────────────────────────────────────────────────

function SearchResults({ query, found, selected, onToggle, onInfo }: {
  query: string;
  found: { films: BrowserFilm[]; total: number } | null;
  selected: Set<string>;
  onToggle: (film: BrowserFilm) => void;
  onInfo: (film: BrowserFilm) => void;
}) {
  if (!found) return <p className={styles.empty}>Cerco «{query}»…</p>;
  if (found.films.length === 0) return <p className={styles.empty}>In libreria non c’è niente per «{query}».</p>;
  return (
    <section className={styles.results}>
      <h3 className={styles.resultsHead}>
        {found.total} film per «{query}»
      </h3>
      <div className={styles.grid}>
        {found.films.map((f) => (
          <PosterCard key={f.tmdbId ?? f.id} film={f} on={Boolean(f.tmdbId && selected.has(f.tmdbId))} onToggle={onToggle} onInfo={onInfo} />
        ))}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Apro la libreria">
      <div className={`${styles.hero} ${styles.ghost}`} />
      {[0, 1, 2].map((r) => (
        <div key={r} className={styles.shelf}>
          <div className={styles.shelfHead}><span className={styles.ghostLine} /></div>
          <div className={styles.track}>
            {Array.from({ length: 8 }, (_, i) => <span key={i} className={`${styles.card} ${styles.ghostCard}`} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
