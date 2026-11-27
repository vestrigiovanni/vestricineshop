'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { entra } from '@/gestionale/accesso';

/** Si torna solo dentro il sito: un `?redirect=` verso un altro dominio viene ignorato. */
function dove(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/admin';
}

export default function Accesso() {
  const router = useRouter();
  const params = useSearchParams();
  const [chiave, setChiave] = useState('');
  const [vedi, setVedi] = useState(false);
  const [errore, setErrore] = useState('');
  const [attendo, setAttendo] = useState(false);

  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore('');
    setAttendo(true);
    try {
      const r = await entra(chiave);
      if (r.ok) {
        router.replace(dove(params.get('redirect')));
        router.refresh();
        return;
      }
      setErrore(r.errore);
    } catch {
      setErrore('Il sito non risponde. Riprova fra un attimo.');
    }
    setAttendo(false);
  };

  return (
    <form className="g-login__modulo" onSubmit={invia}>
      <label className="g-campo">
        <span>Chiave</span>
        <span className="g-campo__riga">
          <input
            type={vedi ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            required
            autoFocus
            disabled={attendo}
            value={chiave}
            onChange={e => setChiave(e.target.value)}
            aria-invalid={errore ? true : undefined}
            aria-describedby={errore ? 'errore-chiave' : undefined}
          />
          <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => setVedi(v => !v)} aria-pressed={vedi}>
            {vedi ? 'Nascondi' : 'Mostra'}
          </button>
        </span>
      </label>
      {errore && <p id="errore-chiave" className="g-errore" role="alert">{errore}</p>}
      <button type="submit" className="g-tasto g-tasto--pieno" disabled={attendo || !chiave}>
        {attendo ? 'Controllo…' : 'Entra'}
      </button>
    </form>
  );
}
