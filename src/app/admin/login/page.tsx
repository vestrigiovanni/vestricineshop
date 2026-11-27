import type { Metadata } from 'next';
import { Suspense } from 'react';
import { chiavi } from '@/gestionale/sessione';
import Accesso from './Accesso';
import '@/gestionale/gestionale.css';

export const metadata: Metadata = { title: 'Gestionale — Vestri Cinema', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function Login() {
  const pronto = chiavi() !== null;
  return (
    <main className="g-login">
      <section className="g-login__foglio">
        <span className="marchio">Vestri Cinema</span>
        <h1 className="g-login__titolo">Il gestionale</h1>
        <p className="g-login__testo">Schede dei film, catalogo e programma. Serve la chiave.</p>
        {pronto ? (
          <Suspense fallback={null}>
            <Accesso />
          </Suspense>
        ) : (
          <p className="g-avviso" role="alert">
            Il gestionale non è ancora configurato: mancano <code>ADMIN_PASSWORD</code> e <code>ADMIN_SESSION_SECRET</code> (almeno 32 caratteri) fra le variabili del sito.
          </p>
        )}
        <a className="g-login__torna" href="/">← Torna al sito</a>
      </section>
    </main>
  );
}
