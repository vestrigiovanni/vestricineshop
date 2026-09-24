'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { adminGetMovieById } from '@/actions/adminActions';
import { catalogDelete, catalogFixTmdbId, catalogMarkVerified, catalogSearchTmdb } from '@/actions/catalogActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import { getTMDBImageUrl } from '@/services/tmdb.utils';
import type { CatalogRow } from './CatalogRoom';
import styles from './Catalogo.module.css';

interface Details {
  title?: string;
  release_date?: string;
  runtime?: number | null;
  overview?: string;
  poster_path?: string | null;
  director?: string | string[] | null;
  cast?: string[] | string | null;
}

interface Hit {
  id: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
}

interface Props {
  film: CatalogRow;
  onClose: () => void;
  /** Il catalogo è cambiato: la lista va riletta. */
  onChanged: (opts?: { removed?: number; verified?: number }) => void;
}

/**
 * La scheda di un film del catalogo: è quello giusto? Se sì si conferma, se no
 * si corregge l'abbinamento con TMDB. Da qui si va anche a programmarlo o a
 * personalizzarne la scheda.
 */
export default function CatalogPreview({ film, onClose, onChanged }: Props) {
  const toast = useToast();
  const [details, setDetails] = useState<{ id: string; data: Details | null } | null>(null);
  const [fixOpen, setFixOpen] = useState(!film.tmdbId);
  const [query, setQuery] = useState(film.title);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [working, setWorking] = useState<'verify' | 'fix' | 'search' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!film.tmdbId) return;
    let cancelled = false;
    const id = film.tmdbId;
    adminGetMovieById(id)
      .then((d) => {
        if (!cancelled) setDetails({ id, data: d as Details | null });
      })
      .catch(() => {
        if (!cancelled) setDetails({ id, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [film.tmdbId]);

  const d = details?.id === film.tmdbId ? details.data : null;
  const loading = Boolean(film.tmdbId) && details?.id !== film.tmdbId;
  const needsVerify = film.verifyStatus === 'suspect' || film.verifyStatus === 'missing';
  const poster = getTMDBImageUrl(d?.poster_path ?? film.posterPath, 'w342');
  const director = Array.isArray(d?.director) ? d?.director.join(', ') : d?.director;
  const cast = Array.isArray(d?.cast) ? d?.cast.slice(0, 5).join(', ') : d?.cast;

  const verify = async () => {
    setWorking('verify');
    try {
      await catalogMarkVerified(film.id);
      toast(`«${film.title}»: abbinamento confermato.`, 'ok');
      onChanged({ verified: film.id });
    } catch {
      toast('Non sono riuscito a confermarlo.', 'alarm');
    } finally {
      setWorking(null);
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorking('search');
    try {
      setHits(((await catalogSearchTmdb(query || film.title)) as Hit[]).slice(0, 12));
    } catch {
      toast('TMDB non ha risposto.', 'alarm');
    } finally {
      setWorking(null);
    }
  };

  const fix = async (hit: Hit) => {
    setWorking('fix');
    try {
      await catalogFixTmdbId(film.id, String(hit.id));
      toast(`«${film.title}» ora è collegato a «${hit.title}».`, 'ok');
      onChanged();
      onClose();
    } catch {
      toast('Non sono riuscito a correggere l’abbinamento.', 'alarm');
    } finally {
      setWorking(null);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    setWorking('delete');
    try {
      await catalogDelete(film.id);
      toast(`«${film.title}» tolto dal catalogo.`, 'ok');
      onChanged({ removed: film.id });
      onClose();
    } catch {
      toast('Non sono riuscito a toglierlo.', 'alarm');
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className={styles.preview}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Chiudi">
        <X size={16} />
      </button>
      <div className={styles.previewTop}>
        <span className={styles.previewPoster}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {poster && <img src={poster} alt="" />}
        </span>
        <div>
          <p className={styles.kicker}>
            {film.verifyStatus === 'suspect' ? 'Da verificare' : film.verifyStatus === 'missing' ? 'Non trovato su TMDB' : 'In catalogo'}
          </p>
          <h2 className={styles.previewTitle}>{film.title}</h2>
          <p className={styles.meta}>
            {[film.year, film.durationMin ? `${film.durationMin}′` : null, film.scheduledCount ? `programmato ${film.scheduledCount} volte` : 'mai programmato']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      {loading && <p className={styles.hint}>Leggo la scheda da TMDB…</p>}
      {d && (
        <div className={styles.previewText}>
          <p className={styles.meta}>
            TMDB: <b>{d.title}</b>
            {d.release_date ? ` · ${d.release_date.slice(0, 4)}` : ''}
            {d.runtime ? ` · ${d.runtime}′` : ''}
          </p>
          {director && <p className={styles.meta}>Regia: {director}</p>}
          {cast && <p className={styles.meta}>Cast: {cast}</p>}
          <p>{d.overview || 'Trama non disponibile.'}</p>
        </div>
      )}

      {needsVerify && (
        <p className={styles.warn}>
          {film.tmdbId
            ? 'L’abbinamento con TMDB è stato indovinato: controlla che locandina e dati siano del film giusto, poi conferma o correggi.'
            : 'Nessun abbinamento con TMDB: cerca qui sotto il film giusto per collegarlo.'}
        </p>
      )}

      <div className={styles.previewActions}>
        {needsVerify && film.tmdbId && (
          <Button variant="fill" onClick={verify} disabled={working !== null}>
            {working === 'verify' ? 'Confermo…' : 'Sì, è lui'}
          </Button>
        )}
        {film.tmdbId && <Button href={`/admin/programma?tmdb=${encodeURIComponent(film.tmdbId)}`} variant="outline">Programma</Button>}
        {film.tmdbId && <Button href={`/admin/film?tmdb=${encodeURIComponent(film.tmdbId)}`} variant="ghost">Scheda film</Button>}
        <Button variant="ghost" onClick={() => setFixOpen((v) => !v)}>{fixOpen ? 'Chiudi la correzione' : 'Film sbagliato? Correggi'}</Button>
      </div>

      {fixOpen && (
        <div className={styles.fix}>
          <form onSubmit={search} className={styles.fixForm}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titolo, oppure id TMDB" aria-label="Cerca il film giusto" />
            <Button type="submit" variant="outline" disabled={working !== null}>{working === 'search' ? 'Cerco…' : 'Cerca'}</Button>
          </form>
          {hits && hits.length === 0 && <p className={styles.hint}>Nessun film con questo nome.</p>}
          {hits && hits.length > 0 && (
            <div className={styles.hits}>
              {hits.map((h) => {
                const p = getTMDBImageUrl(h.poster_path ?? null, 'w185');
                return (
                  <button key={h.id} type="button" className={styles.hit} onClick={() => fix(h)} disabled={working !== null} title="Collega a questo film">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p ? <img src={p} alt="" loading="lazy" /> : <span className={styles.hitEmpty} />}
                    <span>{h.title} {h.release_date ? `(${h.release_date.slice(0, 4)})` : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={styles.previewFoot}>
        <Button variant="alarm" onClick={() => setConfirmDelete(true)} disabled={working !== null}>Togli dal catalogo</Button>
      </div>

      {confirmDelete && (
        <Dialog open onClose={() => setConfirmDelete(false)} title={`Togliere «${film.title}» dal catalogo?`} showTitle>
          <p className={styles.text}>Sparisce dal catalogo e dal cassetto del tavolo. Gli spettacoli già in sala non si toccano.</p>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Annulla</Button>
            <Button variant="alarm" onClick={remove}>Togli</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
