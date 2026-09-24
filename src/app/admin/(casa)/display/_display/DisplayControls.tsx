'use client';

import { useSyncExternalStore } from 'react';
import Button from '@/components/cabina/Button';
import styles from '../../_stanza.module.css';

const KEY = 'displayPreroll';
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function readSeconds(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeSeconds(n: number) {
  try {
    localStorage.setItem(KEY, String(n));
  } catch {
    /* pazienza: vale per questa visita */
  }
  listeners.forEach((l) => l());
}

/**
 * Il preroll è il tempo di trailer e pubblicità prima del film: il display
 * aspetta tanto così prima di dire "in sala". Si ricorda su questo computer.
 */
export default function DisplayControls() {
  const seconds = useSyncExternalStore(subscribe, readSeconds, () => 0);
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  const clamp = (v: string) => Math.max(0, Math.min(59, Number(v) || 0));

  return (
    <div className={styles.form}>
      <div className={styles.two}>
        <label className={styles.field}>
          <span>Preroll · minuti</span>
          <input type="number" min={0} max={59} value={min} onChange={(e) => writeSeconds(clamp(e.target.value) * 60 + sec)} />
        </label>
        <label className={styles.field}>
          <span>Secondi</span>
          <input type="number" min={0} max={59} value={sec} onChange={(e) => writeSeconds(min * 60 + clamp(e.target.value))} />
        </label>
      </div>
      <Button variant="fill" onClick={() => window.open(`/display-esterno?preroll=${seconds}`, '_blank', 'noopener')}>
        Lancia il display
      </Button>
      <p className={styles.hint}>
        Si apre in una scheda nuova: portala a tutto schermo sul monitor dell’ingresso.{' '}
        {seconds ? `Preroll di ${min}′${String(sec).padStart(2, '0')}″.` : 'Senza preroll.'}
      </p>
    </div>
  );
}
