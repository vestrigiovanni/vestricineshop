'use client';

import { useEffect, useRef } from 'react';

/**
 * Una finestra sopra la stanza: il `<dialog>` del browser, che tiene da sé il
 * fuoco dentro, chiude con Esc e rende inerte il resto della pagina.
 */
export default function Finestra({ titolo, onChiudi, larga, children }: {
  titolo: string;
  onChiudi: () => void;
  larga?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="g-finestra"
      data-larga={larga || undefined}
      aria-labelledby="g-finestra-titolo"
      onCancel={e => { e.preventDefault(); onChiudi(); }}
      onClick={e => { if (e.target === e.currentTarget) onChiudi(); }}
    >
      <div className="g-finestra__dentro">
        <header className="g-finestra__testa">
          <h2 id="g-finestra-titolo" className="g-finestra__titolo">{titolo}</h2>
          <button type="button" className="g-tasto g-tasto--piccolo g-tasto--tondo" onClick={onChiudi} aria-label="Chiudi">×</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
