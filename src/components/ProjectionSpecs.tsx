import React from 'react';
import styles from './ProjectionSpecs.module.css';
import { normalizeProjectionSpecs, projectionSpec } from '@/constants/projectionSpecs';

interface ProjectionSpecsProps {
  /** Codici da `constants/projectionSpecs`. Ciò che non è riconosciuto sparisce. */
  specs?: unknown;
  /** La riga libera: compare in coda, così com'è stata scritta. */
  note?: string | null;
  /**
   * `badges` — bollini compatti, accanto a lingua e sottotitoli.
   * `line` — la riga estesa della scheda film, con le spiegazioni nei tooltip.
   */
  variant?: 'badges' | 'line';
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Come si vede e si sente lo spettacolo: 4K, Dolby Vision, Atmos, versione IMAX.
 *
 * Le parole non si scrivono qui: arrivano da `constants/projectionSpecs`, che è
 * l'unico posto in cui esistono. Cambiare lì l'etichetta di IMAX la cambia in
 * tutta la home, biglietti e calendario compresi.
 *
 * Senza specifiche il componente non rende **niente** — nemmeno un contenitore
 * vuoto: la maggior parte degli spettacoli non ha bollini, e una riga vuota che
 * occupa spazio si vedrebbe.
 */
export default function ProjectionSpecs({
  specs,
  note,
  variant = 'badges',
  size = 'sm',
}: ProjectionSpecsProps) {
  const codes = normalizeProjectionSpecs(specs);
  const extra = typeof note === 'string' ? note.trim() : '';
  if (codes.length === 0 && !extra) return null;

  if (variant === 'line') {
    return (
      <div className={styles.line}>
        <span className={styles.lineLabel}>IN SALA:</span>
        {codes.map((code, i) => {
          const spec = projectionSpec(code)!;
          return (
            <React.Fragment key={code}>
              {i > 0 && <span className={styles.lineSep}>·</span>}
              <span className={styles.lineItem} title={spec.description}>
                {spec.publicLabel}
              </span>
            </React.Fragment>
          );
        })}
        {extra && (
          <>
            {codes.length > 0 && <span className={styles.lineSep}>·</span>}
            <span className={styles.lineItem}>{extra.toUpperCase()}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.badges} ${styles[size]}`}>
      {codes.map((code) => {
        const spec = projectionSpec(code)!;
        return (
          <span key={code} className={styles.badge} title={spec.description}>
            {spec.publicLabel}
          </span>
        );
      })}
      {extra && <span className={styles.badge}>{extra.toUpperCase()}</span>}
    </div>
  );
}
