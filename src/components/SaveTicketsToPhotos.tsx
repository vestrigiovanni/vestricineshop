'use client';

import { useEffect, useState } from 'react';
import { renderTicketImages } from './TicketPDF';

/**
 * "Salva nelle foto": su telefono il biglietto finisce nel rullino come
 * immagine, da mostrare all'ingresso anche senza rete.
 *
 * Su iPhone e Android si passa dal foglio di condivisione (Web Share con
 * file): lì c'è "Salva immagine". Safari però vuole che la condivisione parta
 * subito dopo il tocco, e disegnare i biglietti richiede qualche secondo. Se
 * il tocco è "scaduto" teniamo le immagini già pronte e chiediamo un secondo
 * tocco, che condivide all'istante. Dove la condivisione di file non c'è, le
 * immagini si scaricano.
 *
 * Su computer non compare: lì basta il PDF.
 */
export default function SaveTicketsToPhotos({
  ticketIds,
  fileName,
  className,
}: {
  ticketIds: string[];
  fileName: string;
  className?: string;
}) {
  const [isPhone, setIsPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<File[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setIsPhone(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  if (!isPhone || !ticketIds.length) return null;

  const deliver = async (files: File[]) => {
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files });
        setReady(null);
      } catch (err) {
        // NotAllowedError: il tocco è scaduto mentre disegnavamo. Immagini pronte, serve un altro tocco.
        if ((err as DOMException)?.name === 'NotAllowedError') setReady(files);
        // AbortError: la persona ha chiuso il foglio. Teniamo le immagini per riprovare al volo.
        else if ((err as DOMException)?.name === 'AbortError') setReady(files);
        else throw err;
      }
      return;
    }
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    setReady(null);
  };

  const handleClick = async () => {
    setError(false);
    if (ready) {
      try { await deliver(ready); } catch { setError(true); }
      return;
    }
    setBusy(true);
    try {
      const files = await renderTicketImages(ticketIds, fileName);
      if (!files.length) throw new Error('Nessun biglietto da salvare');
      await deliver(files);
    } catch (err) {
      console.error('Salvataggio nelle foto non riuscito', err);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const label = busy
    ? 'Preparo l’immagine…'
    : ready
      ? 'Pronto · tocca per salvare'
      : error
        ? 'Non riuscito · riprova'
        : 'Salva nelle foto';

  return (
    <button type="button" className={className} onClick={handleClick} disabled={busy}>
      {label}
    </button>
  );
}
