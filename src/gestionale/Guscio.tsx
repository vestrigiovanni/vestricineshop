'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { esci } from './accesso';
import { Avvisi } from './Avviso';

/**
 * Il guscio del gestionale: il marchio, le stanze come pillole, l'uscita.
 * Le stanze arrivano a fette: Film e Catalogo ora, Oggi e Programma con la
 * fetta 7, Speciale con la fetta 8.
 */
const STANZE = [
  { href: '/admin/film', nome: 'Film' },
  { href: '/admin/catalogo', nome: 'Catalogo' },
];

export default function Guscio({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '';
  const router = useRouter();

  const fuori = async () => {
    await esci();
    router.replace('/admin/login');
    router.refresh();
  };

  return (
    <div className="g">
      <header className="g-barra">
        <Link href="/admin" className="marchio g-barra__marchio">
          Vestri Cinema <span className="g-barra__tag">gestionale</span>
        </Link>
        <nav className="g-stanze" aria-label="Stanze">
          {STANZE.map(s => (
            <Link key={s.href} href={s.href} className="g-stanza" aria-current={path === s.href || path.startsWith(s.href + '/') ? 'page' : undefined}>
              {s.nome}
            </Link>
          ))}
        </nav>
        <span className="g-barra__fondo">
          <a className="g-tasto g-tasto--piccolo" href="/" target="_blank" rel="noreferrer">Il sito</a>
          <button type="button" className="g-tasto g-tasto--piccolo" onClick={fuori}>Esci</button>
        </span>
      </header>
      <Avvisi>
        <div className="g-corpo">{children}</div>
      </Avvisi>
    </div>
  );
}
