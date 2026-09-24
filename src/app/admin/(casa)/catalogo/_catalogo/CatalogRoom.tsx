'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import {
  catalogAddByTmdbId,
  catalogGetFacets,
  catalogList,
  catalogRandomMany,
  catalogStats,
  type CatalogListParams,
} from '@/actions/catalogActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import CatalogPreview from './CatalogPreview';
import ImportDialog from './ImportDialog';
import styles from './Catalogo.module.css';

export interface CatalogRow {
  id: number;
  title: string;
  year: number | null;
  durationMin: number | null;
  director: string | null;
  tmdbId: string | null;
  tmdbTitle?: string | null;
  posterPath: string | null;
  genres: string[];
  verifyStatus: string;
  scheduledCount: number;
}

const MOBILE = '(max-width: 767px)';
function subscribeMobile(onChange: () => void) {
  const m = window.matchMedia(MOBILE);
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
}

export default function CatalogRoom() {
  const toast = useToast();
  const isMobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE).matches, () => false);
  const [filters, setFilters] = useState<CatalogListParams>({ sort: 'listOrder' });
  const [searchInput, setSearchInput] = useState('');
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [surprise, setSurprise] = useState(false);
  const [facets, setFacets] = useState<{ genres: string[]; directors: string[]; decades: number[] }>({ genres: [], directors: [], decades: [] });
  const [stats, setStats] = useState<{ total: number; ok: number; suspect: number; missing: number } | null>(null);
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  const [addId, setAddId] = useState('');
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const request = useRef(0);

  const loadPage = useCallback(
    async (pageNumber: number) => {
      const id = ++request.current;
      setSurprise(false);
      setLoading(true);
      try {
        const res = await catalogList({ ...filters, page: pageNumber, pageSize: 60 });
        if (request.current !== id) return;
        setRows((prev) => (pageNumber === 1 ? (res.films as CatalogRow[]) : [...prev, ...(res.films as CatalogRow[])]));
        setPage(pageNumber);
        setHasMore(res.hasMore);
        setTotal(res.total);
      } catch {
        if (request.current === id) toast('Non riesco a leggere il catalogo.', 'alarm');
      } finally {
        if (request.current === id) setLoading(false);
      }
    },
    [filters, toast],
  );

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const refreshCounts = useCallback(() => {
    catalogGetFacets().then(setFacets).catch(() => null);
    catalogStats().then(setStats).catch(() => null);
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchInput.trim() || undefined;
      setFilters((f) => (f.search === next ? f : { ...f, search: next }));
    }, 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const setFilter = (patch: Partial<CatalogListParams>) => setFilters((f) => ({ ...f, ...patch }));

  const surpriseMe = async () => {
    request.current++;
    setLoading(true);
    try {
      const picks = await catalogRandomMany(filters, 20);
      setRows(picks as CatalogRow[]);
      setTotal(picks.length);
      setHasMore(false);
      setSurprise(true);
    } catch {
      toast('Non sono riuscito a pescare a caso.', 'alarm');
    } finally {
      setLoading(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = addId.trim();
    if (!id || adding) return;
    setAdding(true);
    try {
      const res = await catalogAddByTmdbId(id);
      setAddId('');
      toast(`Aggiunto al catalogo: «${res.title}».`, 'ok');
      refreshCounts();
      void loadPage(1);
    } catch {
      toast('Id TMDB non valido, o film non trovato.', 'alarm');
    } finally {
      setAdding(false);
    }
  };

  const changed = (opts?: { removed?: number; verified?: number }) => {
    if (opts?.removed) {
      setRows((r) => r.filter((f) => f.id !== opts.removed));
      setTotal((t) => Math.max(0, t - 1));
    } else if (opts?.verified) {
      setRows((r) => r.map((f) => (f.id === opts.verified ? { ...f, verifyStatus: 'fixed' } : f)));
      setSelected((s) => (s && s.id === opts.verified ? { ...s, verifyStatus: 'fixed' } : s));
    } else {
      void loadPage(1);
    }
    refreshCounts();
  };

  const preview = selected && <CatalogPreview key={selected.id} film={selected} onClose={() => setSelected(null)} onChanged={changed} />;

  return (
    <div className={styles.room}>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>
            {stats ? `${stats.total} film · ${stats.ok} abbinati · ${stats.suspect} da verificare · ${stats.missing} non trovati` : 'Leggo il catalogo…'}
          </p>
          <h1 className={styles.title}>Catalogo</h1>
        </div>
        <div className={styles.headActions}>
          <form onSubmit={add} className={styles.addForm}>
            <input value={addId} onChange={(e) => setAddId(e.target.value)} placeholder="Id TMDB" aria-label="Aggiungi per id TMDB" inputMode="numeric" />
            <Button type="submit" variant="outline" disabled={adding || !addId.trim()}>{adding ? 'Aggiungo…' : 'Aggiungi'}</Button>
          </form>
          <Button variant="ghost" onClick={() => setImportOpen(true)}>Importa e aggiorna</Button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={14} />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Titolo o regista…" aria-label="Cerca nel catalogo" />
        </label>
        <select onChange={(e) => setFilter({ genre: e.target.value || undefined })} defaultValue="" aria-label="Genere">
          <option value="">Tutti i generi</option>
          {facets.genres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select onChange={(e) => setFilter({ decade: e.target.value ? Number(e.target.value) : undefined })} defaultValue="" aria-label="Decennio">
          <option value="">Tutti gli anni</option>
          {facets.decades.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select onChange={(e) => setFilter({ director: e.target.value || undefined })} defaultValue="" aria-label="Regista">
          <option value="">Tutti i registi</option>
          {facets.directors.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select onChange={(e) => setFilter({ sort: e.target.value as CatalogListParams['sort'] })} defaultValue="listOrder" aria-label="Ordine">
          <option value="listOrder">Ordine della lista</option>
          <option value="titleAsc">Titolo A→Z</option>
          <option value="yearDesc">Più recenti</option>
        </select>
        <label className={styles.toggle}>
          <input type="checkbox" onChange={(e) => setFilter({ hideScheduled: e.target.checked || undefined })} />
          Mai programmati
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" onChange={(e) => setFilter({ onlyUnverified: e.target.checked || undefined })} />
          Da verificare
        </label>
        <Button variant="ghost" onClick={surpriseMe}>Sorprendimi</Button>
      </div>

      <div className={styles.layout} data-open={selected ? '' : undefined}>
        <div className={styles.listWrap}>
          <p className={styles.count}>
            {surprise ? `${total} film a caso: “Sorprendimi” per altri` : `${total} film`}
            {loading ? ' · carico…' : ''}
          </p>
          <ul className={styles.list}>
            {rows.map((f) => {
              const poster = getTMDBImageUrl(f.posterPath, 'w92');
              return (
                <li key={f.id}>
                  <button type="button" className={styles.row} data-selected={selected?.id === f.id || undefined} onClick={() => setSelected(f)}>
                    <span className={styles.poster}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {poster && <img src={poster} alt="" loading="lazy" />}
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>
                        {f.title}
                        {f.year ? <em> {f.year}</em> : null}
                      </span>
                      <span className={styles.rowMeta}>
                        {[f.director || 'regia n/d', f.durationMin ? `${f.durationMin}′` : null, f.genres.slice(0, 3).join(' · ') || null].filter(Boolean).join(' · ')}
                      </span>
                      {f.tmdbTitle && f.tmdbTitle !== f.title && <span className={styles.rowMeta}>TMDB: {f.tmdbTitle}</span>}
                    </span>
                    <span className={styles.badges}>
                      {f.verifyStatus === 'suspect' && <em className={styles.badgeWarn}>da verificare</em>}
                      {f.verifyStatus === 'missing' && <em className={styles.badgeAlarm}>non trovato</em>}
                      {f.scheduledCount > 0 && <em>×{f.scheduledCount}</em>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!loading && rows.length === 0 && <p className={styles.hint}>Nessun film con questi filtri.</p>}
          {hasMore && (
            <div className={styles.more}>
              <Button variant="ghost" onClick={() => void loadPage(page + 1)} disabled={loading}>{loading ? 'Carico…' : 'Altri 60'}</Button>
            </div>
          )}
        </div>

        {!isMobile && <aside className={styles.side}>{preview ?? <p className={styles.sideHint}>Scegli un film per vederne la scheda, confermarlo o correggerlo.</p>}</aside>}
      </div>

      {isMobile && selected && (
        <Dialog open onClose={() => setSelected(null)} title={selected.title} variant="sheet">
          {preview}
        </Dialog>
      )}

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onDone={() => {
            refreshCounts();
            void loadPage(1);
          }}
        />
      )}
    </div>
  );
}
