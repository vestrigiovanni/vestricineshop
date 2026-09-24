'use client';

import { useEffect, useRef } from 'react';
import styles from './Dialog.module.css';

type Variant = 'center' | 'palette' | 'sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Nome per i lettori di schermo; visibile solo se `showTitle`. */
  title: string;
  showTitle?: boolean;
  variant?: Variant;
  children: React.ReactNode;
}

const FOCUSABLE = 'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])';

export default function Dialog({ open, onClose, title, showTitle = false, variant = 'center', children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  // onClose arriva spesso come funzione nuova a ogni render: tenerla in un ref
  // evita che l'effetto riparta e rubi il fuoco mentre si scrive.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`${styles.backdrop} ${styles[`${variant}Backdrop`] ?? ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className={`${styles.panel} ${styles[variant]}`}>
        {showTitle && <h2 className={styles.title}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
