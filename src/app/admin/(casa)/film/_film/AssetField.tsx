'use client';

import { Eye, EyeOff, Play } from 'lucide-react';
import Button from '@/components/cabina/Button';
import { tmdbImage, youtubeThumb } from './form';
import type { MediaKind } from './MediaPicker';
import styles from './Film.module.css';

interface Props {
  kind: MediaKind;
  label: string;
  value: string;
  /** Quello che mostrerebbe TMDB se il campo restasse vuoto. */
  fallback?: string | null;
  onChange: (value: string) => void;
  onPick: () => void;
  compact?: boolean;
}

/**
 * Un'immagine o un trailer: anteprima, indirizzo, "Scegli da TMDB". Il logo si
 * può anche nascondere del tutto (`none`), e allora il sito scrive il titolo.
 */
export default function AssetField({ kind, label, value, fallback, onChange, onPick, compact }: Props) {
  const hidden = value === 'none';
  const shown = hidden ? null : value || fallback || null;
  const preview = kind === 'trailer' ? youtubeThumb(shown) : tmdbImage(shown, kind === 'poster' ? 'w185' : 'w300');
  const custom = Boolean(value);

  return (
    <div className={styles.asset} data-kind={kind} data-compact={compact || undefined}>
      <div className={styles.assetHead}>
        <span className={styles.label}>{label}</span>
        <span className={custom ? styles.tagCustom : styles.tagTmdb}>{custom ? 'tuo' : 'da TMDB'}</span>
      </div>
      <button type="button" className={styles.assetPreview} onClick={hidden ? undefined : onPick} disabled={hidden} title="Scegli da TMDB">
        {hidden ? (
          <span className={styles.assetEmpty}>Logo nascosto: il sito scrive il titolo</span>
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" loading="lazy" data-tmdb={!custom || undefined} />
        ) : (
          <span className={styles.assetEmpty}>{kind === 'trailer' ? <Play size={18} /> : 'Nessuna immagine'}</span>
        )}
      </button>
      <div className={styles.assetRow}>
        <input
          value={hidden ? '' : value}
          disabled={hidden}
          onChange={(e) => onChange(e.target.value)}
          placeholder={kind === 'trailer' ? 'https://www.youtube.com/watch?v=…' : '/percorso.jpg oppure indirizzo'}
          aria-label={label}
        />
        {!compact && <Button variant="ghost" onClick={onPick} disabled={hidden}>TMDB</Button>}
        {kind === 'logo' && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => onChange(hidden ? '' : 'none')}
            title={hidden ? 'Mostra il logo' : 'Nascondi il logo e usa il titolo scritto'}
            aria-label={hidden ? 'Mostra il logo' : 'Nascondi il logo'}
          >
            {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}
