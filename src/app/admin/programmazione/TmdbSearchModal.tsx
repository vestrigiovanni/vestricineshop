'use client';

/**
 * LA FINESTRELLA DI RICERCA TMDB.
 *
 * Il catalogo copre ciò che il cinema ha già in casa; questa copre tutto il
 * resto — l'uscita di ieri, il titolo che non è mai entrato in libreria, il film
 * di cui conosci solo l'id perché lo stai guardando su TMDB in un'altra scheda.
 * Accetta un titolo, un id numerico o un indirizzo di TMDB incollato di peso.
 *
 * Scegliere un film **non** lo scrive in catalogo. La creazione degli
 * spettacoli legge titolo, durata e locandina da TMDB, quindi la riga in
 * catalogo non serve a programmare: è una decisione di archivio, e la prende
 * l'utente con un bottone separato.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus, Check, Clapperboard, Loader2, Search, X,
} from 'lucide-react';
import styles from './Programmazione.module.css';
import { catalogAddByTmdbId, catalogPreviewTmdb, catalogSearchTmdb, catalogWhichExist } from '@/actions/catalogActions';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { CatalogItem } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Il film scelto, pronto per il wizard. */
  onPick: (film: CatalogItem) => void;
  /** Quali film sono già selezionati, per segnarli nei risultati. */
  pickedIds?: Set<string>;
  title?: string;
  hint?: string;
  /** Con cosa aprire la ricerca: di solito ciò che stavi già cercando altrove. */
  initialQuery?: string;
}

interface TmdbHit {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  release_date?: string;
  poster_path?: string | null;
}

/**
 * L'id TMDB dentro ciò che è stato scritto: un numero puro o un indirizzo di
 * TMDB. Incollare `themoviedb.org/movie/550-fight-club` è il modo più naturale
 * di indicare un film preciso, e chiedere all'utente di estrarne il numero a
 * mano sarebbe un compito inutile.
 */
function tmdbIdFrom(input: string): string | null {
  const q = input.trim();
  if (/^\d+$/.test(q)) return q;
  const url = q.match(/themoviedb\.org\/movie\/(\d+)/i);
  return url ? url[1] : null;
}

export default function TmdbSearchModal({
  open, onClose, onPick, pickedIds, title = 'Cerca su TMDB', hint, initialQuery,
}: Props) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [hits, setHits] = useState<TmdbHit[]>([]);
  const [inCatalog, setInCatalog] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Il film su cui si sta decidendo: scegliere e basta, o anche archiviare. */
  const [chosen, setChosen] = useState<TmdbHit | null>(null);
  const [busy, setBusy] = useState<'pick' | 'save' | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * I bottoni del film scelto. Aprendo l'ultimo risultato dell'elenco nascono
   * sotto il bordo inferiore della lista, e da lì non si vedono: chi ha appena
   * cliccato il film non ha motivo di sospettare che ci sia qualcosa più giù.
   */
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Riaprire la finestra riparte da zero: i risultati della ricerca
    // precedente non c'entrano più niente con quello che stai cercando ora.
    // Il titolo che stavi già cercando fuori, invece, è proprio il punto di
    // partenza giusto — riscriverlo sarebbe solo una seccatura.
    const start = (initialQuery ?? '').trim();
    setQuery(start);
    setDebounced(start);
    setHits([]);
    setChosen(null);
    setError(null);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
    // Volutamente solo su `open`: cambiare la ricerca di fondo mentre la
    // finestra è aperta non deve cancellare quello che stai scrivendo qui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!chosen) return;
    actionsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [chosen]);

  useEffect(() => {
    if (!open || debounced.length < 2) { setHits([]); return; }
    let cancelled = false;

    async function run() {
      setSearching(true);
      setError(null);
      try {
        const res = await catalogSearchTmdb(debounced);
        if (cancelled) return;
        const list = (res as TmdbHit[]).slice(0, 12);
        setHits(list);
        // Sapere cosa c'è già evita di riproporre "aggiungi al catalogo" per un
        // film che in catalogo sta da mesi.
        const known = await catalogWhichExist(list.map((h) => String(h.id)));
        if (!cancelled) setInCatalog(new Set(known));
      } catch (e) {
        console.error('[Programmazione] ricerca TMDB', e);
        if (!cancelled) setError('TMDB non ha risposto. Riprova fra un attimo.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [debounced, open]);

  /** Prende il film da TMDB nella forma del wizard, senza toccare il catalogo. */
  const takeFilm = useCallback(async (hit: TmdbHit, alsoSave: boolean) => {
    setBusy(alsoSave ? 'save' : 'pick');
    setError(null);
    try {
      if (alsoSave) await catalogAddByTmdbId(String(hit.id));
      const film = await catalogPreviewTmdb(String(hit.id));
      if (!film) {
        setError('TMDB non conosce questo film.');
        return;
      }
      if (!film.runtime) {
        setError(`Di «${film.title}» TMDB non conosce la durata: senza, non posso calcolare gli orari.`);
        return;
      }
      onPick(film as CatalogItem);
      onClose();
    } catch (e) {
      console.error('[Programmazione] scelta da TMDB', e);
      setError(alsoSave ? 'Non sono riuscito ad aggiungerlo al catalogo.' : 'Non sono riuscito a prenderlo da TMDB.');
    } finally {
      setBusy(null);
    }
  }, [onPick, onClose]);

  if (!open) return null;

  const directId = tmdbIdFrom(query);

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      role="presentation"
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.modalHead}>
          <h2><Search size={17} /> {title}</h2>
          <button className={styles.modalClose} onClick={onClose} disabled={Boolean(busy)} aria-label="Chiudi">
            <X size={18} />
          </button>
        </header>

        <p className={styles.modalHint}>
          {hint ?? 'Cerca per titolo un film che in catalogo non c\'è, oppure incolla un id TMDB o il link della sua pagina.'}
        </p>

        <div className={styles.modalSearch}>
          <Search size={16} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Titolo, id TMDB o link…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onClose(); }}
          />
          {searching && <Loader2 size={15} className={styles.spin} />}
          {query && !searching && (
            <button onClick={() => setQuery('')} aria-label="Pulisci"><X size={14} /></button>
          )}
        </div>

        {directId && (
          <p className={styles.modalDirect}>
            Cerco l&apos;id TMDB <b>{directId}</b>.
          </p>
        )}
        {error && <p className={styles.modalError}>{error}</p>}

        <div className={styles.modalResults}>
          {debounced.length >= 2 && !searching && hits.length === 0 && !error && (
            <div className={styles.emptyState}>
              <Clapperboard size={26} />
              <p>Nessun film per «{debounced}».</p>
            </div>
          )}
          {debounced.length < 2 && (
            <div className={styles.emptyState}>
              <Search size={26} />
              <p>Scrivi almeno due lettere.</p>
            </div>
          )}

          {hits.map((hit) => {
            const id = String(hit.id);
            const poster = getTMDBImageUrl(hit.poster_path ?? null, 'w154');
            const known = inCatalog.has(id);
            const picked = pickedIds?.has(id);
            const isChosen = chosen?.id === hit.id;

            return (
              <div key={hit.id} className={`${styles.tmdbRow} ${isChosen ? styles.tmdbRowOpen : ''}`}>
                <button
                  className={styles.tmdbRowMain}
                  onClick={() => setChosen(isChosen ? null : hit)}
                  disabled={Boolean(busy)}
                >
                  <span className={styles.tmdbRowPoster}>
                    {poster ? <img src={poster} alt="" loading="lazy" /> : <Clapperboard size={18} />}
                  </span>
                  <span className={styles.tmdbRowText}>
                    <b>
                      {hit.title}
                      {picked && <span className={styles.tmdbFlagPicked}><Check size={11} /> già scelto</span>}
                      {known && !picked && <span className={styles.tmdbFlagKnown}>in catalogo</span>}
                    </b>
                    <span className={styles.tmdbRowMeta}>
                      {hit.release_date?.slice(0, 4) || '—'}
                      {hit.original_title && hit.original_title !== hit.title ? ` · ${hit.original_title}` : ''}
                      {' · id '}{hit.id}
                    </span>
                    {hit.overview && <span className={styles.tmdbRowOverview}>{hit.overview}</span>}
                  </span>
                </button>

                {isChosen && (
                  <div className={styles.tmdbActions} ref={actionsRef}>
                    <button
                      className={styles.ctaBtnSmall}
                      onClick={() => takeFilm(hit, false)}
                      disabled={Boolean(busy)}
                    >
                      {busy === 'pick'
                        ? <><Loader2 size={14} className={styles.spin} /> Un attimo…</>
                        : <><Check size={14} /> Scegli e basta</>}
                    </button>

                    {!known && (
                      <button
                        className={styles.ghostBtnSmall}
                        onClick={() => takeFilm(hit, true)}
                        disabled={Boolean(busy)}
                        title="Lo salva anche in catalogo, così lo ritrovi la prossima volta"
                      >
                        {busy === 'save'
                          ? <><Loader2 size={13} className={styles.spin} /> Aggiungo…</>
                          : <><BookmarkPlus size={13} /> Scegli e aggiungi al catalogo</>}
                      </button>
                    )}

                    <span className={styles.tmdbActionsHint}>
                      {known
                        ? 'Questo film è già in catalogo.'
                        : 'Scegliendo e basta, il catalogo non viene toccato.'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
