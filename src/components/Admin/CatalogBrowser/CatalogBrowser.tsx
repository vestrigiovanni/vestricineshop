'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Calendar, Eye, Trash2, Plus, Check } from 'lucide-react';
import styles from './CatalogBrowser.module.css';
import {
  catalogList,
  catalogGetFacets,
  catalogStats,
  catalogRandomMany,
  catalogSeed,
  catalogEnrich,
  catalogDelete,
  catalogAddByTmdbId,
  catalogMarkVerified,
  type CatalogListParams,
} from '@/actions/catalogActions';
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
  lastScheduledFilm?: { tmdbId: string; count: number } | null;
}

export default function CatalogBrowser({ onSelectFilm, onClose, lastScheduledFilm }: Props) {
  const [films, setFilms] = useState<CatalogFilmRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [facets, setFacets] = useState<{ genres: string[]; directors: string[]; decades: number[] }>({ genres: [], directors: [], decades: [] });
  const [stats, setStats] = useState<{ total: number; ok: number; suspect: number; missing: number } | null>(null);
  const [preview, setPreview] = useState<CatalogFilmRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [addId, setAddId] = useState('');
  const [adding, setAdding] = useState(false);
  const [surprise, setSurprise] = useState(false);

  const [filters, setFilters] = useState<CatalogListParams>({ sort: 'listOrder' });

  const reqRef = useRef(0);

  const loadPage = useCallback(async (pageNumber: number) => {
    const id = ++reqRef.current;
    setSurprise(false);
    setLoading(true);
    try {
      const res = await catalogList({ ...filters, page: pageNumber, pageSize: 60 });
      if (reqRef.current !== id) return; // risposta obsoleta: scarta
      setFilms((prev) => (pageNumber === 1 ? res.films : [...prev, ...res.films]) as CatalogFilmRow[]);
      setPage(pageNumber);
      setHasMore(res.hasMore);
      setTotal(res.total);
    } catch (err) {
      if (reqRef.current === id) console.error('[CatalogBrowser] caricamento catalogo fallito', err);
    } finally {
      if (reqRef.current === id) setLoading(false);
    }
  }, [filters]);

  // ricarica da capo quando cambiano i filtri (loadPage cambia identità quando cambia `filters`)
  useEffect(() => { loadPage(1); }, [loadPage]);

  // Incrementa localmente lo scheduledCount del film programmato senza ricaricare la lista intera
  useEffect(() => {
    if (lastScheduledFilm) {
      setFilms((prev) =>
        prev.map((f) =>
          f.tmdbId === lastScheduledFilm.tmdbId
            ? { ...f, scheduledCount: f.scheduledCount + lastScheduledFilm.count }
            : f
        )
      );
    }
  }, [lastScheduledFilm]);

  const refreshFacetsAndStats = useCallback(() => {
    catalogGetFacets().then(setFacets);
    catalogStats().then(setStats);
  }, []);

  useEffect(() => { refreshFacetsAndStats(); }, [refreshFacetsAndStats]);

  const setFilter = (patch: Partial<CatalogListParams>) => setFilters((f) => ({ ...f, ...patch }));

  const handleSurprise = async () => {
    try {
      reqRef.current++; // invalida eventuali caricamenti in corso
      const picks = await catalogRandomMany(filters, 20);
      setFilms(picks as CatalogFilmRow[]);
      setTotal(picks.length);
      setHasMore(false);
      setSurprise(true);
    } catch (err) {
      console.error('[CatalogBrowser] sorprendimi fallito', err);
    }
  };

  const handleSchedule = (tmdbId: string) => { onSelectFilm(tmdbId); };

  const handleConfirm = async (film: CatalogFilmRow) => {
    try {
      await catalogMarkVerified(film.id);
      setFilms((prev) => prev.map((f) => (f.id === film.id ? { ...f, verifyStatus: 'fixed' } : f)));
      refreshFacetsAndStats();
    } catch (err) {
      console.error('[CatalogBrowser] conferma fallita', err);
      window.alert('Errore durante la conferma (vedi console).');
    }
  };

  const handleDelete = async (film: CatalogFilmRow) => {
    if (!window.confirm(`Eliminare «${film.title}» dal catalogo?`)) return;
    try {
      await catalogDelete(film.id);
      setFilms((prev) => prev.filter((f) => f.id !== film.id));
      setTotal((t) => Math.max(0, t - 1));
      refreshFacetsAndStats();
    } catch (err) {
      console.error('[CatalogBrowser] eliminazione fallita', err);
      window.alert('Errore durante l’eliminazione (vedi console).');
    }
  };

  const handleAddById = async () => {
    const id = addId.trim();
    if (!id || adding) return;
    setAdding(true);
    try {
      const res = await catalogAddByTmdbId(id);
      setAddId('');
      window.alert(`Aggiunto al catalogo: «${res.title}».`);
      refreshFacetsAndStats();
      loadPage(1);
    } catch (err) {
      console.error('[CatalogBrowser] aggiunta per id fallita', err);
      window.alert('ID TMDB non valido o film non trovato.');
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    if (importing) return;
    setImporting(true);
    try {
      setImportMsg('Lettura CSV…');
      const seed = await catalogSeed();
      setImportMsg(`CSV letto: ${seed.total} film (${seed.created} nuovi). Abbinamento TMDB…`);

      let ok = 0, suspect = 0, missing = 0, processed = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await catalogEnrich(50);
        ok += res.ok; suspect += res.suspect; missing += res.missing; processed += res.processed;
        setImportMsg(`Abbinamento TMDB: ${processed} fatti · ${ok} ok · ${suspect} da verificare · ${missing} non trovati · ${res.remaining} rimasti…`);
        if (res.remaining === 0 || res.processed === 0) break;
      }

      setImportMsg(`Import completato: ${ok} ok · ${suspect} da verificare · ${missing} non trovati.`);
      refreshFacetsAndStats();
      loadPage(1);
    } catch (err) {
      console.error('[CatalogBrowser] import fallito', err);
      setImportMsg('Errore durante l’import (vedi console).');
    } finally {
      setImporting(false);
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
        {importMsg && <span className={styles.stats}>{importMsg}</span>}
        <button
          className={styles.importBtn}
          onClick={handleImport}
          disabled={importing}
          title="Legge scratch/catalogo.csv e abbina i film a TMDB"
        >
          {importing ? '⏳ Import in corso…' : '⚙️ Importa/aggiorna catalogo'}
        </button>
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
        <button className={styles.surprise} onClick={handleSurprise}>🎲 Sorprendimi (20 a caso)</button>
        <div className={styles.addBox}>
          <input
            type="text"
            placeholder="ID TMDB…"
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddById(); }}
          />
          <button className={styles.addBtn} onClick={handleAddById} disabled={adding}>
            <Plus size={15} /> {adding ? 'Aggiungo…' : 'Aggiungi'}
          </button>
        </div>
      </div>

      <div className={styles.listMeta}>
        {surprise ? `🎲 ${total} film a caso (riclicca "Sorprendimi" per altri)` : `${total} risultati`}{loading ? ' · carico…' : ''}
      </div>

      <div className={styles.list}>
        {films.map((f) => {
          const poster = getTMDBImageUrl(f.posterPath, 'w92');
          const genres = f.genres.slice(0, 3).join(' · ');
          return (
            <div key={f.id} className={styles.row}>
              <div className={styles.rowClickable} onClick={() => setPreview(f)}>
                {poster
                  ? <img className={styles.rowPoster} src={poster} alt={f.title} loading="lazy" />
                  : <div className={styles.rowPosterEmpty}>?</div>}
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>
                    {f.title}{f.year ? <span className={styles.rowYear}> ({f.year})</span> : ''}
                    {f.verifyStatus === 'suspect' && <span className={`${styles.badge} ${styles.badgeWarn}`}>⚠️ da verificare</span>}
                    {f.verifyStatus === 'missing' && <span className={`${styles.badge} ${styles.badgeMissing}`}>⛔ non trovato</span>}
                    {f.scheduledCount > 0 && <span className={`${styles.badge} ${styles.badgeScheduled}`}>✅ già programmato ×{f.scheduledCount}</span>}
                  </div>
                  <div className={styles.rowMeta}>
                    {f.director || 'Regia n/d'}
                    {f.durationMin ? ` · ${f.durationMin} min` : ''}
                    {genres ? ` · ${genres}` : ''}
                  </div>
                  {f.tmdbTitle && f.tmdbTitle !== f.title && (
                    <div className={styles.rowSub}>TMDB: {f.tmdbTitle}</div>
                  )}
                </div>
              </div>
              <div className={styles.rowActions}>
                {f.verifyStatus === 'suspect' && f.tmdbId && (
                  <button className={styles.btnConfirm} onClick={() => handleConfirm(f)} title="Conferma: l'abbinamento è corretto">
                    <Check size={15} /> Conferma
                  </button>
                )}
                {f.tmdbId && (
                  <button className={styles.btnSchedule} onClick={() => handleSchedule(f.tmdbId!)} title="Programma questo film">
                    <Calendar size={15} /> Programma
                  </button>
                )}
                <button className={styles.btnGhost} onClick={() => setPreview(f)} title="Anteprima / correggi">
                  <Eye size={15} /> Anteprima
                </button>
                <button className={styles.btnDanger} onClick={() => handleDelete(f)} title="Elimina dal catalogo">
                  <Trash2 size={15} />
                </button>
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
          onSchedule={(tmdbId: string) => { onSelectFilm(tmdbId); setPreview(null); }}
          onFixed={() => { setPreview(null); refreshFacetsAndStats(); loadPage(1); }}
        />
      )}
    </div>
  );
}
