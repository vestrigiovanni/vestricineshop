'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Search, Shuffle } from 'lucide-react';
import { planningCatalogBoard } from '@/actions/planningActions';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { CatalogItem } from './types';
import styles from './PosterBoard.module.css';

type BoardFilm = CatalogItem & { tasteNote?: string | null };

interface Props {
  /** I film già scelti: restano evidenziati in qualunque pagina. */
  selected: Set<string>;
  onToggle: (film: CatalogItem) => void;
  /** Film da non mostrare (gli scartati della bozza). */
  exclude?: string[];
}

const PAGE = 100;

/**
 * Cento poster della libreria, da sfogliare e scegliere con un clic.
 *
 * Le pagine scorrono un ordine fisso: "avanti" e "indietro" ritrovano gli
 * stessi film. "Rimescola" cambia ordine e riparte dalla prima pagina, e
 * i film già scelti restano scelti.
 */
export default function PosterBoard({ selected, onToggle, exclude }: Props) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [onlyNever, setOnlyNever] = useState(false);
  // L'ultima risposta arrivata, con la richiesta a cui risponde: se non è quella
  // di adesso, si sta caricando. Così si evita di accendere e spegnere un
  // "caricamento" a mano dentro l'effetto.
  const [result, setResult] = useState<{
    key: string;
    data?: { films: BoardFilm[]; total: number; pages: number };
    failed?: boolean;
  } | null>(null);

  // La ricerca parte dopo una pausa nella scrittura, e riporta alla prima pagina.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const excludeKey = (exclude ?? []).join(',');
  const key = JSON.stringify([page, seed, query, onlyNever, excludeKey]);
  useEffect(() => {
    let cancelled = false;
    planningCatalogBoard({ count: PAGE, page, seed, search: query || undefined, onlyNever, exclude: excludeKey ? excludeKey.split(',') : [] })
      .then((r) => {
        if (cancelled) return;
        setResult({ key, data: { films: r.films as unknown as BoardFilm[], total: r.total, pages: r.pages } });
        if (r.page !== page) setPage(r.page);
      })
      .catch(() => { if (!cancelled) setResult({ key, failed: true }); });
    return () => { cancelled = true; };
  }, [key, page, seed, query, onlyNever, excludeKey]);

  const loading = result?.key !== key;
  const failed = !loading && Boolean(result?.failed);
  // Mentre arriva la pagina nuova resta a vista la vecchia, sbiadita.
  const data = result?.data;
  const pages = data?.pages ?? 1;
  const shuffle = () => {
    setSeed(Math.floor(Math.random() * 1_000_000));
    setPage(0);
  };

  return (
    <div className={styles.board}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca titolo o regista…" aria-label="Cerca nel catalogo" />
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={onlyNever} onChange={(e) => { setOnlyNever(e.target.checked); setPage(0); }} />
          Mai programmati
        </label>
        <div className={styles.pager}>
          <button type="button" onClick={() => setPage((p) => Math.max(p - 1, 0))} disabled={page === 0 || loading} aria-label="Pagina precedente">
            <ChevronLeft size={16} />
          </button>
          <span>
            {page + 1} / {pages}
            {data && <em> · {data.total} film</em>}
          </span>
          <button type="button" onClick={() => setPage((p) => Math.min(p + 1, pages - 1))} disabled={page >= pages - 1 || loading} aria-label="Pagina successiva">
            <ChevronRight size={16} />
          </button>
          <button type="button" onClick={shuffle} disabled={loading} className={styles.shuffle}>
            <Shuffle size={14} /> Rimescola
          </button>
        </div>
      </div>

      <div className={styles.scroll} data-loading={loading || undefined}>
        {failed ? (
          <p className={styles.empty}>Non sono riuscito a caricare il catalogo. Riprova.</p>
        ) : data && data.films.length === 0 ? (
          <p className={styles.empty}>Nessun film{query ? ` per «${query}»` : ''}.</p>
        ) : (
          <ul className={styles.grid}>
            {(data?.films ?? []).map((f) => {
              const on = Boolean(f.tmdbId && selected.has(f.tmdbId));
              const poster = getTMDBImageUrl(f.posterPath, 'w185');
              const runtime = f.runtime ?? f.durationMin;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className={styles.card}
                    data-on={on || undefined}
                    aria-pressed={on}
                    onClick={() => onToggle(f)}
                    title={[f.title, f.director, f.tasteNote].filter(Boolean).join(' · ')}
                  >
                    <span className={styles.poster}>
                      {poster ? <img src={poster} alt="" loading="lazy" /> : <span className={styles.noPoster}>{f.title}</span>}
                      {on && <span className={styles.check}><Check size={14} /></span>}
                      {f.scheduledCount > 0 && <span className={styles.seen}>{f.scheduledCount}×</span>}
                    </span>
                    <span className={styles.title}>{f.title}</span>
                    <span className={styles.meta}>{[f.year, runtime ? `${runtime}′` : null].filter(Boolean).join(' · ')}</span>
                    {f.tasteNote && <span className={styles.note}>{f.tasteNote}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
