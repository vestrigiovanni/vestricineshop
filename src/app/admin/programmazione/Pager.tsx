'use client';

/**
 * SFOGLIARE IL CATALOGO.
 *
 * Novecento film non stanno in una schermata, e restringere la ricerca non è
 * sempre quello che si vuole fare: a volte si sfoglia per vedere cosa c'è.
 * Da qui le pagine.
 *
 * I numeri mostrati sono una finestra attorno alla pagina corrente, con la
 * prima e l'ultima sempre visibili: con quindici pagine la fila intera
 * starebbe pure, con cinquanta no, e la regola vale in entrambi i casi.
 */

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './Programmazione.module.css';

interface Props {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** Testo a lato: quanti film in tutto, quanti se ne vedono qui. */
  info?: string;
}

/** Numeri di pagina da mostrare; `null` è un salto (…). */
function windowOf(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const around = new Set<number>([1, pageCount, page]);
  if (page - 1 > 1) around.add(page - 1);
  if (page + 1 < pageCount) around.add(page + 1);
  // Agli estremi la finestra è sbilanciata: senza questo, stando in pagina 1
  // si vedrebbero solo due numeri e poi subito il salto.
  if (page <= 3) for (const n of [2, 3, 4]) if (n < pageCount) around.add(n);
  if (page >= pageCount - 2) for (const d of [1, 2, 3]) if (pageCount - d > 1) around.add(pageCount - d);

  const sorted = [...around].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}

export default function Pager({ page, pageCount, onChange, info }: Props) {
  if (pageCount <= 1) return info ? <p className={styles.gridMore}>{info}</p> : null;

  const go = (n: number) => onChange(Math.min(pageCount, Math.max(1, n)));

  return (
    <nav className={styles.pager} aria-label="Pagine del catalogo">
      <button
        className={styles.pagerBtn}
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        aria-label="Pagina precedente"
      >
        <ChevronLeft size={15} />
      </button>

      <div className={styles.pagerNums}>
        {windowOf(page, pageCount).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className={styles.pagerGap}>…</span>
          ) : (
            <button
              key={n}
              className={n === page ? styles.pagerNumOn : styles.pagerNum}
              onClick={() => go(n)}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </button>
          )
        )}
      </div>

      <button
        className={styles.pagerBtn}
        onClick={() => go(page + 1)}
        disabled={page >= pageCount}
        aria-label="Pagina successiva"
      >
        <ChevronRight size={15} />
      </button>

      {info && <span className={styles.pagerInfo}>{info}</span>}
    </nav>
  );
}
