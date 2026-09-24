'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { tmdbImage } from './form';
import styles from './Film.module.css';

export type MediaKind = 'poster' | 'backdrop' | 'logo' | 'trailer';

interface TmdbImage {
  file_path: string;
  iso_639_1?: string | null;
}

interface TmdbVideo {
  key: string;
  name?: string;
}

const TITLES: Record<MediaKind, string> = {
  poster: 'Scegli la locandina',
  backdrop: 'Scegli lo sfondo',
  logo: 'Scegli il logo',
  trailer: 'Scegli il trailer',
};

interface Props {
  movieId: string;
  kind: MediaKind;
  current?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

/**
 * Immagini e trailer di TMDB per un film. Uno solo, per le quattro cose che
 * prima avevano due finestre diverse (una per le immagini, una per i trailer).
 */
export default function MediaPicker({ movieId, kind, current, onSelect, onClose }: Props) {
  const [state, setState] = useState<{ key: string; images: TmdbImage[]; videos: { it: TmdbVideo[]; en: TmdbVideo[] }; error?: string } | null>(null);
  const [lang, setLang] = useState<'it' | 'en'>('it');
  const key = `${movieId}|${kind}`;

  useEffect(() => {
    let cancelled = false;
    const url = kind === 'trailer' ? `/api/tmdb/videos/${movieId}` : `/api/tmdb/images/${movieId}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (kind === 'trailer') {
          const videos = { it: data.it ?? [], en: data.en ?? [] };
          if (videos.it.length === 0) setLang('en');
          setState({ key, images: [], videos });
        } else {
          const images = kind === 'poster' ? data.posters : kind === 'backdrop' ? data.backdrops : data.logos;
          setState({ key, images: images ?? [], videos: { it: [], en: [] } });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ key, images: [], videos: { it: [], en: [] }, error: 'TMDB non ha risposto. Riprova fra poco.' });
      });
    return () => {
      cancelled = true;
    };
  }, [movieId, kind, key]);

  const loading = state?.key !== key;
  const pick = (value: string) => {
    onSelect(value);
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title={TITLES[kind]} showTitle variant="large">
      <div className={styles.picker}>
        {loading && <p className={styles.hint}>Sfoglio TMDB…</p>}
        {state?.error && <p className={styles.alarmText}>{state.error}</p>}

        {!loading && kind === 'trailer' && (
          <>
            <div className={styles.segmented}>
              {(['it', 'en'] as const).map((l) => (
                <Button key={l} variant={lang === l ? 'fill' : 'ghost'} onClick={() => setLang(l)}>
                  {l === 'it' ? `Italiano (${state?.videos.it.length ?? 0})` : `Originale (${state?.videos.en.length ?? 0})`}
                </Button>
              ))}
            </div>
            {state?.videos[lang].length === 0 ? (
              <p className={styles.hint}>Nessun trailer in questa lingua.</p>
            ) : (
              <div className={styles.pickGrid} data-kind="backdrop">
                {state?.videos[lang].map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className={styles.pickItem}
                    data-current={current?.includes(v.key) || undefined}
                    onClick={() => pick(`https://www.youtube.com/watch?v=${v.key}`)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://img.youtube.com/vi/${v.key}/mqdefault.jpg`} alt="" loading="lazy" />
                    <span>{v.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {!loading && kind !== 'trailer' && !state?.error && (
          state && state.images.length === 0 ? (
            <p className={styles.hint}>TMDB non ha immagini di questo tipo per questo film.</p>
          ) : (
            <div className={styles.pickGrid} data-kind={kind}>
              {state?.images.map((img) => (
                <button
                  key={img.file_path}
                  type="button"
                  className={styles.pickItem}
                  data-current={current === img.file_path || undefined}
                  onClick={() => pick(img.file_path)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tmdbImage(img.file_path, kind === 'poster' ? 'w342' : 'w500') ?? ''} alt="" loading="lazy" />
                  {img.iso_639_1 && <span>{img.iso_639_1.toUpperCase()}</span>}
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </Dialog>
  );
}
