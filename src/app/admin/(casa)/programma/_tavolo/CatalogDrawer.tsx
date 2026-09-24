'use client';

import { useEffect, useMemo, useState } from 'react';
import { RotateCw, Search } from 'lucide-react';
import { catalogGetFacets, catalogGetRails, catalogList } from '@/actions/catalogActions';
import { CATALOG_RAIL_HINTS, RUNTIME_BUCKETS, type CatalogRail, type RuntimeBucketKey } from '@/constants/catalogRails';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { CatalogItem } from './types';
import TmdbDialog from './TmdbDialog';
import styles from './CatalogDrawer.module.css';

interface Props {
  /** Durate dei buchi del periodo: alimentano la corsia "Stanno nei buchi". */
  gaps: number[];
  selected: string | null;
  inDraft: Set<string>;
  onSelect: (film: CatalogItem | null) => void;
  /** Il film che si sta trascinando: il tavolo lo deve conoscere al rilascio. */
  onDragFilm: (film: CatalogItem) => void;
}

type Rail = { rail: CatalogRail; label: string; films: CatalogItem[] };

const RAIL_LABEL: Partial<Record<CatalogRail, string>> = { perfect: 'Stanno nei buchi' };

function runtimeOf(f: CatalogItem): number | null {
  return f.runtime ?? f.durationMin ?? null;
}

export default function CatalogDrawer({ gaps, selected, inDraft, onSelect, onDragFilm }: Props) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [genre, setGenre] = useState('');
  const [decade, setDecade] = useState('');
  const [bucket, setBucket] = useState<RuntimeBucketKey | ''>('');
  const [facets, setFacets] = useState<{ genres: string[]; decades: number[] }>({ genres: [], decades: [] });
  const [rails, setRails] = useState<{ key: string; rails: Rail[] } | null>(null);
  const [results, setResults] = useState<{ key: string; films: CatalogItem[]; total: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [tmdbOpen, setTmdbOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    catalogGetFacets()
      .then((f) => setFacets({ genres: f.genres, decades: f.decades }))
      .catch(() => null);
  }, []);

  const filtering = Boolean(debounced || genre || decade || bucket);
  const range = bucket ? RUNTIME_BUCKETS.find((b) => b.key === bucket) : undefined;
  const queryKey = `${debounced}|${genre}|${decade}|${bucket}`;
  const railsKey = `${gaps.join(',')}|${nonce}`;

  useEffect(() => {
    if (filtering) return;
    let cancelled = false;
    catalogGetRails({ hideScheduled: true }, { perRail: 8, gaps })
      .then((r) => {
        if (!cancelled) setRails({ key: railsKey, rails: r as unknown as Rail[] });
      })
      .catch(() => {
        if (!cancelled) setRails({ key: railsKey, rails: [] });
      });
    return () => {
      cancelled = true;
    };
    // `gaps` è un array nuovo a ogni render: conta la sua chiave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtering, railsKey]);

  useEffect(() => {
    if (!filtering) return;
    let cancelled = false;
    catalogList({
      search: debounced || undefined,
      genre: genre || undefined,
      decade: decade ? Number(decade) : undefined,
      minRuntime: range?.min,
      maxRuntime: range?.max,
      pageSize: 40,
    })
      .then((r) => {
        if (!cancelled) setResults({ key: queryKey, films: r.films as unknown as CatalogItem[], total: r.total });
      })
      .catch(() => {
        if (!cancelled) setResults({ key: queryKey, films: [], total: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [filtering, queryKey, debounced, genre, decade, range?.min, range?.max]);

  const loading = filtering ? results?.key !== queryKey : rails?.key !== railsKey;

  const card = (f: CatalogItem) => {
    const runtime = runtimeOf(f);
    const poster = getTMDBImageUrl(f.posterPath ?? null, 'w92');
    const draggable = Boolean(f.tmdbId && runtime);
    return (
      <li key={`${f.id}-${f.tmdbId}`}>
        <button
          type="button"
          className={styles.film}
          data-selected={f.tmdbId !== null && f.tmdbId === selected ? '' : undefined}
          draggable={draggable}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', `film:${f.tmdbId}`);
            e.dataTransfer.effectAllowed = 'copy';
            onDragFilm(f);
          }}
          onClick={() => onSelect(f.tmdbId === selected ? null : f)}
          title={draggable ? 'Trascinalo su un giorno, o cliccalo per vedere dove ci sta' : 'Senza durata: non so dove metterlo'}
        >
          <span className={styles.poster}>
            {/* Miniature da 34px: passarle dall'ottimizzatore costerebbe senza guadagnare niente. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {poster && <img src={poster} alt="" loading="lazy" />}
          </span>
          <span className={styles.filmText}>
            <span className={styles.filmTitle}>{f.title}</span>
            <span className={styles.filmMeta}>
              {[f.year, f.director, runtime ? `${runtime}′` : 'durata ignota'].filter(Boolean).join(' · ')}
            </span>
            <span className={styles.badges}>
              {f.tmdbId && inDraft.has(f.tmdbId) && <em className={styles.badgeDraft}>in bozza</em>}
              {f.awardLabels?.length > 0 && <em>premiato</em>}
              {f.scheduledCount === 0 && <em>mai programmato</em>}
              {f.inCatalog === false && <em>solo bozza</em>}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const visibleRails = useMemo(() => (rails?.rails ?? []).filter((r) => r.films.length > 0), [rails]);

  return (
    <div className={styles.drawer}>
      <header className={styles.head}>
        <p className={styles.kicker}>Catalogo</p>
        <label className={styles.search}>
          <Search size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titolo o regista…" aria-label="Cerca nel catalogo" />
        </label>
        <div className={styles.filters}>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genere">
            <option value="">Genere</option>
            {facets.genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={decade} onChange={(e) => setDecade(e.target.value)} aria-label="Decennio">
            <option value="">Anni</option>
            {facets.decades.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={bucket} onChange={(e) => setBucket(e.target.value as RuntimeBucketKey | '')} aria-label="Durata">
            <option value="">Durata</option>
            {RUNTIME_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </div>
        <p className={styles.hint}>Trascina un film su un giorno, o cliccalo per accendere i posti dove ci sta.</p>
      </header>

      <div className={styles.body}>
        {loading && <p className={styles.hint}>Sfoglio il catalogo…</p>}

        {!loading && filtering && results && (
          <>
            <p className={styles.count}>{results.total} {results.total === 1 ? 'film' : 'film'}</p>
            <ul className={styles.list}>{results.films.map(card)}</ul>
          </>
        )}

        {!loading && !filtering && visibleRails.map((r) => (
          <section key={r.rail} className={styles.rail}>
            <div className={styles.railHead}>
              <h3 title={CATALOG_RAIL_HINTS[r.rail]}>{RAIL_LABEL[r.rail] ?? r.label}</h3>
              {r.rail === 'surprise' && (
                <button type="button" onClick={() => setNonce((n) => n + 1)} aria-label="Altri film a sorpresa">
                  <RotateCw size={13} />
                </button>
              )}
            </div>
            <ul className={styles.list}>{r.films.map(card)}</ul>
          </section>
        ))}

        <button type="button" className={styles.tmdbLink} onClick={() => setTmdbOpen(true)}>
          Non lo trovi? Cercalo su TMDB
        </button>
      </div>

      {tmdbOpen && (
        <TmdbDialog
          onClose={() => setTmdbOpen(false)}
          onPick={(film) => {
            setTmdbOpen(false);
            onSelect(film);
          }}
        />
      )}
    </div>
  );
}
