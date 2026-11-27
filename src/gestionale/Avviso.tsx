'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

type Tono = 'ok' | 'errore';
const Contesto = createContext<(testo: string, tono?: Tono) => void>(() => {});

/** Una riga in basso che dice com'è andata, e se ne va da sola. */
export function Avvisi({ children }: { children: React.ReactNode }) {
  const [avviso, setAvviso] = useState<{ testo: string; tono: Tono; n: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const di = useCallback((testo: string, tono: Tono = 'ok') => {
    window.clearTimeout(timer.current);
    setAvviso(a => ({ testo, tono, n: (a?.n ?? 0) + 1 }));
    timer.current = window.setTimeout(() => setAvviso(null), tono === 'errore' ? 7000 : 4000);
  }, []);
  return (
    <Contesto.Provider value={di}>
      {children}
      <div className="g-avvisi" role="status" aria-live="polite">
        {avviso && <p key={avviso.n} className="g-avvisi__riga" data-tono={avviso.tono}>{avviso.testo}</p>}
      </div>
    </Contesto.Provider>
  );
}

export const useAvviso = () => useContext(Contesto);
