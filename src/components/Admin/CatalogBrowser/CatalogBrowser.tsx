'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import styles from './CatalogBrowser.module.css';
import { catalogList, catalogGetFacets, catalogStats, catalogRandom, type CatalogListParams } from '@/actions/catalogActions';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import CatalogPreview from './CatalogPreview';

export type CatalogFilmRow = {
  id: number;
  title: string;
  year: number | null;
  durationMin: number | null;
  director: string | null;
  tmdbId: string | null;
  tmdbTitle: string | null;
  posterPath: string | null;
  genres: string[];
  verifyStatus: string;
  scheduledCount: number;
};

interface Props {
  onSelectFilm: (tmdbId: string) => void;
  onClose: () => void;
}

export default function CatalogBrowser({ onSelectFilm, onClose }: Props) {
  const [films, setFilms] = useState<CatalogFilmRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [facets, setFacets] = useState<{ genres: string[]; directors: string[]; decades: number[] }>({ genres: [], directors: [], decades: [] });
  const [stats, setStats] = useState<{ total: number; ok: number; suspect: number; missing: number } | null>(null);
  const [preview, setPreview] = useState<CatalogFilmRow | null>(null);

  const [filters, setFilters] = useState<CatalogListParams>({ sort: 'listOrder' });

  const reqRef = useRef(0);

  const loadPage = useCallback(async (pageNumber: number) => {
    const id = ++reqRef.current;
    setLoading(true);
    try {
      const res = await catalogList({ ...filters, page: pageNumber, pageSize: 60 });
      if (reqRef.current !== id) return; // risposta obsoleta: scarta
      setFilms((prev) => (pageNumber === 1 ? res.films : [...prev, ...res.films]) as CatalogFilmRow[]);
      setPage(pageNumber);
      setHasMore(res.hasMore);
    } catch (err) {
      if (reqRef.current === id) console.error('[CatalogBrowser] caricamento catalogo fallito', err);
    } finally {
      if (reqRef.current === id) setLoading(false);
    }
  }, [filters]);

  // ricarica da capo quando cambiano i filtri (loadPage cambia identità quando cambia `filters`)
  useEffect(() => { loadPage(1); }, [loadPage]);

  useEffect(() => {
    catalogGetFacets().then(setFacets);
    catalogStats().then(setStats);
  }, []);

  const setFilter = (patch: Partial<CatalogListParams>) => setFilters((f) => ({ ...f, ...patch }));

  const handleSurprise = async () => {
    try {
      const film = await catalogRandom(filters);
      if (film) setPreview({ ...film, scheduledCount: 0 });
    } catch (err) {
      console.error('[CatalogBrowser] sorprendimi fallito', err);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <h2>📚 Programma dal catalogo</h2>
        {stats && (
          <span className={styles.stats}>
            {stats.total} film · {stats.ok} ok · {stats.suspect} da verificare · {stats.missing} non trovati
          </span>
        )}
        <button className={styles.closeBtn} onClick={onClose} aria-label="Chiudi"><X size={22} /></button>
      </div>

      <div className={styles.toolbar}>
        <input
          type="text"
          placeholder="Cerca titolo o regista…"
          onChange={(e) => setFilter({ search: e.target.value || undefined })}
        />
        <select onChange={(e) => setFilter({ genre: e.target.value || undefined })} defaultValue="">
          <option value="">Tutti i generi</option>
          {facets.genres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select onChange={(e) => setFilter({ decade: e.target.value ? parseInt(e.target.value) : undefined })} defaultValue="">
          <option value="">Tutti i decenni</option>
          {facets.decades.map((d) => <option key={d} value={d}>{d}s</option>)}
        </select>
        <select onChange={(e) => setFilter({ director: e.target.value || undefined })} defaultValue="">
          <option value="">Tutti i registi</option>
          {facets.directors.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select onChange={(e) => setFilter({ sort: e.target.value as CatalogListParams['sort'] })} defaultValue="listOrder">
          <option value="listOrder">Ordine classifica</option>
          <option value="titleAsc">Titolo A→Z</option>
          <option value="yearDesc">Anno ↓</option>
        </select>
        <label className={styles.toggle}>
          <input type="checkbox" onChange={(e) => setFilter({ hideScheduled: e.target.checked || undefined })} />
          Nascondi già programmati
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" onChange={(e) => setFilter({ onlyUnverified: e.target.checked || undefined })} />
          Solo da verificare
        </label>
        <button className={styles.surprise} onClick={handleSurprise}>🎲 Sorprendimi</button>
      </div>

      <div className={styles.grid}>
        {films.map((f) => {
          const poster = getTMDBImageUrl(f.posterPath, 'w342');
          const suspect = f.verifyStatus === 'suspect' || f.verifyStatus === 'missing';
          return (
            <div key={f.id} className={styles.card} onClick={() => setPreview(f)}>
              <div className={styles.badges}>
                {suspect && <span className={`${styles.badge} ${styles.badgeWarn}`}>⚠️ verifica</span>}
                {f.scheduledCount > 0 && <span className={`${styles.badge} ${styles.badgeScheduled}`}>✅ ×{f.scheduledCount}</span>}
              </div>
              {poster
                ? <img className={styles.poster} src={poster} alt={f.title} loading="lazy" />
                : <div className={styles.noPoster}>{f.title}</div>}
              <div className={styles.cardBody}>
                <div className={styles.cardTitle}>{f.title}</div>
                <div className={styles.cardMeta}>{f.year ?? '—'}{f.director ? ` · ${f.director}` : ''}</div>
              </div>
            </div>
          );
        })}

        {!loading && films.length === 0 && <div className={styles.empty}>Nessun film con questi filtri.</div>}

        {hasMore && (
          <div className={styles.loadMore}>
            <button onClick={() => loadPage(page + 1)} disabled={loading}>
              {loading ? 'Carico…' : 'Carica altri'}
            </button>
          </div>
        )}
      </div>

      {preview && (
        <CatalogPreview
          film={preview}
          onClose={() => setPreview(null)}
          onSchedule={(tmdbId: string) => { onSelectFilm(tmdbId); onClose(); }}
          onFixed={() => { setPreview(null); loadPage(1); }}
        />
      )}
    </div>
  );
}
