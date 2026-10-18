'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Info, Plus, Search, Shuffle, X } from 'lucide-react';
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

  const shuffle = () => setSeed(Math.floor(Math.random() * 1_000_000));
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
        <button type="button" className={styles.shuffle} onClick={shuffle} disabled={loading} title="Cambia vetrina, registi e film a caso">
          <Shuffle size={14} /> Rimescola
        </button>
      </div>

      <div className={styles.scroll} data-loading={(loading && Boolean(data)) || undefined}>
        {searching ? (
          <SearchResults
            query={query}
            found={found?.query === query ? found : null}
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
