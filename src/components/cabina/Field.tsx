'use client';

import { useId } from 'react';
import styles from './Field.module.css';

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Un elemento dentro il campo, a destra (es. mostra/nascondi password). */
  trailing?: React.ReactNode;
}

export default function Field({ label, hint, error, trailing, id, className, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-nota`;
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          id={inputId}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          {...rest}
        />
        {trailing && <span className={styles.trailing}>{trailing}</span>}
      </div>
      {error ? (
        <p id={noteId} className={styles.error}>{error}</p>
      ) : hint ? (
        <p id={noteId} className={styles.hint}>{hint}</p>
      ) : null}
    </div>
  );
}
