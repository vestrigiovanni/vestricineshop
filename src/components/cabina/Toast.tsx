'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import styles from './Toast.module.css';

export type ToastTone = 'info' | 'ok' | 'alarm';
type Push = (message: string, tone?: ToastTone) => void;

interface Item {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<Push>(() => {});

/** Gli avvisi della cabina: prendono il posto di alert(). Gli errori restano più a lungo. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(0);

  const push = useCallback<Push>((message, tone = 'info') => {
    const id = ++nextId.current;
    setItems((list) => [...list, { id, message, tone }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === 'alarm' ? 7000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.tone]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Push {
  return useContext(ToastContext);
}
