'use client';

import { useEffect, useState } from 'react';
import { planningAlternatives } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import type { ScheduledShow } from '@/services/scheduling/engine';
import type { CatalogItem } from '../wizard/types';
import styles from './CatalogDrawer.module.css';

interface Props {
  show: ScheduledShow;
  occurrences: number;
  /** Quanto ci sta al massimo: nel suo orario, o in tutti gli orari del film. */
  maxOne: number;
  maxAll: number;
  exclude: string[];
  onClose: () => void;
  onSwap: (film: CatalogItem, scope: 'one' | 'all') => void;
}

/**
 * Non è il catalogo: qui si guarda cosa ci sta **lì**. Un film più lungo dello
 * spazio andrebbe a sbattere contro lo spettacolo dopo, quindi non compare.
 */
export default function SwapDialog({ show, occurrences, maxOne, maxAll, exclude, onClose, onSwap }: Props) {
  const [scope, setScope] = useState<'one' | 'all'>(occurrences > 1 ? 'all' : 'one');
  const [seed, setSeed] = useState(0);
  const [result, setResult] = useState<{ key: string; films: CatalogItem[] } | null>(null);
  const maxRuntime = scope === 'all' ? maxAll : maxOne;
  const key = `${scope}|${seed}|${maxRuntime}`;

  useEffect(() => {
    let cancelled = false;
    planningAlternatives({ band: show.band, maxRuntime, exclude, count: 12, seed })
      .then((rows) => {
        if (!cancelled) setResult({ key, films: rows as unknown as CatalogItem[] });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, films: [] });
      });
    return () => {
      cancelled = true;
    };
    // `exclude` cambia identità a ogni render del genitore: conta la chiave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, show.band]);

  const loading = result?.key !== key;

  return (
    <Dialog open onClose={onClose} title={`Al posto di «${show.title}»`} showTitle>
      <p className={styles.tmdbHint}>Ci sta un film fino a {maxRuntime}′.</p>
      {occurrences > 1 && (
        <div className={styles.filters} style={{ gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
          <Button variant={scope === 'all' ? 'fill' : 'ghost'} onClick={() => setScope('all')}>
            Tutti e {occurrences}
          </Button>
          <Button variant={scope === 'one' ? 'fill' : 'ghost'} onClick={() => setScope('one')}>
            Solo le {show.time}
          </Button>
        </div>
      )}
      {loading ? (
        <p className={styles.tmdbHint}>Cerco cosa ci sta…</p>
      ) : result && result.films.length === 0 ? (
        <p className={styles.tmdbHint}>Nessun altro film in libreria sta in {maxRuntime}′ senza essere già in bozza.</p>
      ) : (
        <ul className={styles.tmdbList}>
          {result?.films.map((f) => (
            <li key={f.id}>
              <span>
                {f.title} <em>{[f.year, `${f.runtime ?? f.durationMin}′`].filter(Boolean).join(' · ')}</em>
              </span>
              <Button variant="ghost" onClick={() => onSwap(f, scope)}>Metti</Button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <Button variant="ghost" onClick={() => setSeed((s) => s + 1)} disabled={loading}>Fammene vedere altri</Button>
        <Button variant="ghost" onClick={onClose}>Chiudi</Button>
      </div>
    </Dialog>
  );
}
