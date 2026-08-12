'use client';

/**
 * PASSO 1 AL CONTRARIO — IL FILM.
 *
 * Il percorso normale chiede prima il periodo, perché conoscere i buchi liberi
 * è ciò che permette di proporre film della durata giusta. Qui la domanda è
 * l'opposta: hai già il film in testa, e vuoi sapere quando puoi darlo. Quindi
 * si sceglie il titolo — dal catalogo o da TMDB — e la sala, e basta: il resto
 * lo dicono gli orari liberi al passo dopo.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Clapperboard, Globe, Loader2, Search, X } from 'lucide-react';
import styles from './Programmazione.module.css';
import FilmCard from './FilmCard';
import Pager from './Pager';
import TmdbSearchModal from './TmdbSearchModal';
import { catalogList } from '@/actions/catalogActions';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import { runtimeOf, type CatalogItem } from './types';

const PAGE_SIZE = 24;

interface Props {
  rooms: { id: number; name: string; isFavorite: boolean }[];
  roomId: number | null;
  onRoomChange: (id: number) => void;
  fromDate: string;
  onFromDateChange: (d: string) => void;
  minDate: string;
  film: CatalogItem | null;
  onFilmChange: (film: CatalogItem | null) => void;
}

export default function StepFilm({
  rooms, roomId, onRoomChange,
  fromDate, onFromDateChange, minDate,
  film, onFilmChange,
}: Props) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tmdbOpen, setTmdbOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Una ricerca nuova è un elenco nuovo: si riparte dalla prima pagina. Si
  // azzera durante il render, così non parte prima una richiesta con la pagina
  // vecchia e subito dopo un'altra con quella giusta.
  const [querySeen, setQuerySeen] = useState(debounced);
  if (querySeen !== debounced) {
    setQuerySeen(debounced);
    setPage(1);
  }

  // Senza ricerca si mostrano i film mai programmati: è il caso più frequente,
  // e una griglia vuota in attesa che tu scriva sarebbe solo una schermata morta.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const r = await catalogList({
          search: debounced || undefined,
          hideScheduled: !debounced,
          page,
          pageSize: PAGE_SIZE,
          sort: debounced ? 'titleAsc' : 'yearDesc',
        });
        if (cancelled) return;
        setResults(r.films as unknown as CatalogItem[]);
        setTotal(r.total);
      } catch (e) {
        console.error('[Programmazione] ricerca catalogo', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [debounced, page]);

  const usable = (f: CatalogItem) => Boolean(f.tmdbId) && f.verifyStatus !== 'missing';
  const shown = useMemo(() => results.filter(usable), [results]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const gridRef = useRef<HTMLDivElement>(null);
  const goToPage = (n: number) => {
    setPage(n);
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const pickedIds = useMemo(
    () => new Set(film?.tmdbId ? [film.tmdbId] : []),
    [film]
  );

  const poster = film ? getTMDBImageUrl(film.posterPath, 'w154') : null;

  return (
    <main className={styles.stepBody}>
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}><Clapperboard size={18} /> Quale film</h2>

        {film ? (
          <div className={styles.chosenFilm}>
            <div className={styles.chosenPoster}>
              {poster ? <img src={poster} alt="" /> : <Clapperboard size={22} />}
            </div>
            <div className={styles.chosenMain}>
              <b>{film.title}</b>
              <span>
                {film.year || '—'}
                {runtimeOf(film) ? ` · ${runtimeOf(film)}′` : ' · durata ignota'}
                {film.director ? ` · ${film.director}` : ''}
              </span>
              {film.inCatalog === false && (
                <span className={styles.chosenFlag}>
                  preso da TMDB, non è in catalogo — si programma lo stesso
                </span>
              )}
            </div>
            <button className={styles.trayRemove} onClick={() => onFilmChange(null)} aria-label="Cambia film">
              <X size={15} />
            </button>
          </div>
        ) : (
          <p className={styles.sideHint}>
            Scegli un titolo dal catalogo, oppure cercalo su TMDB se in catalogo non c&apos;è.
          </p>
        )}

        <div className={styles.filterBar}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Cerca nel catalogo per titolo o regista…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && <button onClick={() => setSearch('')} aria-label="Pulisci ricerca"><X size={14} /></button>}
          </div>

          <button className={styles.ghostBtnSmall} onClick={() => setTmdbOpen(true)}>
            <Globe size={14} /> Non è in catalogo? Cercalo su TMDB
          </button>

          {loading && <Loader2 size={15} className={styles.spin} />}
        </div>

        <div className={styles.filmGrid} ref={gridRef}>
          {shown.map((f) => (
            <FilmCard
              key={f.id}
              film={f}
              selected={Boolean(f.tmdbId && f.tmdbId === film?.tmdbId)}
              onClick={() => onFilmChange(f.tmdbId === film?.tmdbId ? null : f)}
            />
          ))}
        </div>

        {!loading && shown.length === 0 && (
          <div className={styles.emptyState}>
            <Clapperboard size={30} />
            <p>
              {debounced
                ? <>Nessun film in catalogo per «{debounced}». Prova su TMDB.</>
                : <>Il catalogo è vuoto.</>}
            </p>
          </div>
        )}
        <Pager
          page={page}
          pageCount={pageCount}
          onChange={goToPage}
          info={debounced
            ? `${total} film per «${debounced}»`
            : `${total} film mai programmati`}
        />
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}><CalendarRange size={18} /> Dove, e da quando cercare</h2>

        <div className={styles.slotControls}>
          <label className={styles.field}>
            <span>Sala</span>
            <select value={roomId ?? ''} onChange={(e) => onRoomChange(Number(e.target.value))}>
              {rooms.length === 0 && <option value="">Nessuna sala disponibile</option>}
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.isFavorite ? '⭐ ' : ''}{r.name}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>A partire dal</span>
            <input
              type="date"
              value={fromDate}
              min={minDate}
              onChange={(e) => onFromDateChange(e.target.value)}
            />
          </label>
        </div>

        <p className={styles.sideHint}>
          Cerco gli orari liberi da qui in avanti, giorno per giorno, e ti mostro
          solo le giornate che hanno davvero spazio.
        </p>
      </section>

      <TmdbSearchModal
        open={tmdbOpen}
        onClose={() => setTmdbOpen(false)}
        onPick={(f) => onFilmChange(f)}
        pickedIds={pickedIds}
        hint="Cerca per titolo, oppure incolla un id TMDB o il link della pagina del film. Sceglierlo non lo aggiunge al catalogo."
      />
    </main>
  );
}
