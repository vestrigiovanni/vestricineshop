'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { adminGetVisualControlData, upsertMovieOverride } from '@/actions/adminActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import AssetField from './AssetField';
import { nextShowing, type MovieLike, type OverrideLike } from './form';
import MediaPicker, { type MediaKind } from './MediaPicker';
import styles from './Film.module.css';

interface Row {
  tmdbId: string;
  title: string;
  lastDate: string | Date;
  projections?: { dateFrom: string | Date }[];
  next?: string | null;
  tmdbData: (MovieLike & { trailerKey?: string | null }) | null;
  override: OverrideLike & Record<string, unknown>;
}

type Field = 'customPosterPath' | 'customBackdropPath' | 'customLogoPath' | 'customTrailerUrl' | 'customTrailerTitle';

const FIELD_OF: Record<MediaKind, Field> = {
  poster: 'customPosterPath',
  backdrop: 'customBackdropPath',
  logo: 'customLogoPath',
  trailer: 'customTrailerUrl',
};

/**
 * Il colpo d'occhio: immagini e trailer di tutti i film in programma, uno sotto
 * l'altro. Ogni modifica si salva da sola un secondo dopo.
 */
export default function QuickLook({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const [search, setSearch] = useState('');
  const [onlyNoTrailer, setOnlyNoTrailer] = useState(false);
  const [pending, setPending] = useState<Record<string, Partial<Record<Field, string>>>>({});
  const [status, setStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [picker, setPicker] = useState<{ id: string; kind: MediaKind } | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminGetVisualControlData()
      .then((data) => {
        if (cancelled) return;
        const now = Date.now();
        setRows((data as unknown as Row[]).map((r) => ({ ...r, next: nextShowing(r.projections ?? [], now).next })));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  useEffect(() => {
    const ids = Object.keys(pending);
    if (ids.length === 0) return;
    const timer = window.setTimeout(async () => {
      const batch = pending;
      setPending({});
      for (const id of ids) {
        setStatus((s) => ({ ...s, [id]: 'saving' }));
        try {
          const res = await upsertMovieOverride(id, batch[id]);
          setStatus((s) => ({ ...s, [id]: res?.success ? 'saved' : 'error' }));
        } catch {
          setStatus((s) => ({ ...s, [id]: 'error' }));
        }
      }
      onSaved();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [pending, onSaved]);

  const update = useCallback((id: string, field: Field, value: string) => {
    setRows((list) => list?.map((r) => (r.tmdbId === id ? { ...r, override: { ...r.override, [field]: value } } : r)) ?? null);
    setPending((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      if (onlyNoTrailer) return !(r.override.customTrailerUrl || r.tmdbData?.trailerKey);
      return true;
    });
  }, [rows, search, onlyNoTrailer]);

  const value = (r: Row, f: Field) => (typeof r.override[f] === 'string' ? (r.override[f] as string) : '');

  return (
    <Dialog open onClose={onClose} title="Colpo d'occhio" variant="wide">
      <header className={styles.quickHead}>
        <div>
          <p className={styles.kicker}>Tutti i film in programma</p>
          <h2>Colpo d’occhio</h2>
        </div>
        <label className={styles.search}>
          <Search size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca un film…" aria-label="Cerca un film" />
        </label>
        <Button variant={onlyNoTrailer ? 'fill' : 'ghost'} onClick={() => setOnlyNoTrailer((v) => !v)}>Senza trailer</Button>
        <button type="button" className={styles.iconBtn} onClick={() => { setRows(null); setNonce((n) => n + 1); }} aria-label="Rileggi">
          <RefreshCw size={15} />
        </button>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Chiudi">
          <X size={16} />
        </button>
      </header>

      <div className={styles.quickBody}>
        {rows === null && <p className={styles.hint}>Leggo i film e le loro immagini da TMDB…</p>}
        {rows !== null && visible.length === 0 && <p className={styles.hint}>Nessun film con questi filtri.</p>}
        {visible.map((r) => (
          <article key={r.tmdbId} className={styles.quickRow}>
            <div className={styles.quickFilm}>
              <b>{r.title}</b>
              <span className={styles.meta}>
                {r.next ? 'prossima' : 'ultima'} {new Date(r.next ?? r.lastDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })}
              </span>
              <span className={styles.quickStatus} data-status={status[r.tmdbId]}>
                {pending[r.tmdbId] ? 'da salvare…' : status[r.tmdbId] === 'saving' ? 'salvo…' : status[r.tmdbId] === 'saved' ? 'salvato' : status[r.tmdbId] === 'error' ? 'non salvato' : ''}
              </span>
            </div>
            <AssetField compact kind="poster" label="Locandina" value={value(r, 'customPosterPath')} fallback={r.tmdbData?.poster_path} onChange={(v) => update(r.tmdbId, 'customPosterPath', v)} onPick={() => setPicker({ id: r.tmdbId, kind: 'poster' })} />
            <AssetField compact kind="backdrop" label="Sfondo" value={value(r, 'customBackdropPath')} fallback={r.tmdbData?.backdrop_path} onChange={(v) => update(r.tmdbId, 'customBackdropPath', v)} onPick={() => setPicker({ id: r.tmdbId, kind: 'backdrop' })} />
            <AssetField compact kind="logo" label="Logo" value={value(r, 'customLogoPath')} fallback={r.tmdbData?.logo_path} onChange={(v) => update(r.tmdbId, 'customLogoPath', v)} onPick={() => setPicker({ id: r.tmdbId, kind: 'logo' })} />
            <div className={styles.quickTrailer}>
              <AssetField
                compact
                kind="trailer"
                label="Trailer"
                value={value(r, 'customTrailerUrl')}
                fallback={r.tmdbData?.trailerKey ? `https://www.youtube.com/watch?v=${r.tmdbData.trailerKey}` : null}
                onChange={(v) => update(r.tmdbId, 'customTrailerUrl', v)}
                onPick={() => setPicker({ id: r.tmdbId, kind: 'trailer' })}
              />
              <input
                className={styles.quickInput}
                value={value(r, 'customTrailerTitle')}
                onChange={(e) => update(r.tmdbId, 'customTrailerTitle', e.target.value)}
                placeholder="Titolo del trailer"
                aria-label="Titolo del trailer"
              />
            </div>
          </article>
        ))}
      </div>

      {picker && (
        <MediaPicker
          movieId={picker.id}
          kind={picker.kind}
          current={rows?.find((r) => r.tmdbId === picker.id) ? value(rows.find((r) => r.tmdbId === picker.id)!, FIELD_OF[picker.kind]) : undefined}
          onSelect={(v) => update(picker.id, FIELD_OF[picker.kind], v)}
          onClose={() => setPicker(null)}
        />
      )}
    </Dialog>
  );
}
