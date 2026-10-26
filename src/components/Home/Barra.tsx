'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import type { Slot } from './programma';
import { useLuce } from './Luce';
import { Film, Prenota, img, quando, vaiA } from './shared';
import s from './Barra.module.css';

/**
 * La barra in alto, come quella di una pagina prodotto Apple: il nome della
 * sala, il film che hai davanti e il suo Prenota. Il titolo apre l'indice di
 * tutti i film, che porta dove si vuole. Sull'apertura è trasparente.
 */
export default function Barra({ film, now }: { film: Slot<Film>[]; now: Date }) {
  const { filmVisto } = useLuce();
  const [solida, setSolida] = useState(false);
  const [aperto, setAperto] = useState(false);
  const pannello = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const leggi = () => setSolida(scrollY > innerHeight * 0.6);
    leggi();
    addEventListener('scroll', leggi, { passive: true });
    return () => removeEventListener('scroll', leggi);
  }, []);

  useEffect(() => {
    if (!aperto) return;
    const chiudi = (e: KeyboardEvent) => { if (e.key === 'Escape') setAperto(false); };
    const fuori = (e: PointerEvent) => { if (!pannello.current?.parentElement?.contains(e.target as Node)) setAperto(false); };
    addEventListener('keydown', chiudi);
    addEventListener('pointerdown', fuori);
    return () => { removeEventListener('keydown', chiudi); removeEventListener('pointerdown', fuori); };
  }, [aperto]);

  // Il film in vista (a luci spente, l'ultimo visto); prima che la luce ne scelga uno, il primo.
  const attuale = film.find(x => x.movie.id === filmVisto) || film[0];

  return (
    <header className={s.barra} data-solida={solida || aperto}>
      <div className={s.riga}>
        <button type="button" className={s.sala} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Vestri Cinema</button>
        <button type="button" className={s.titolo} aria-expanded={aperto} aria-controls="indice-film" onClick={() => setAperto(a => !a)}>
          <span className={s.titoloTesto} key={attuale.movie.id}>{attuale.movie.title}</span>
          <ChevronDown className={s.freccia} size={16} strokeWidth={2.2} aria-hidden />
        </button>
        <nav className={s.voci} aria-label="Sezioni">
          <a href="#programma" className={s.voce} onClick={e => { e.preventDefault(); setAperto(false); vaiA('#programma'); }}>Programma</a>
          <Prenota show={attuale.show} film={attuale.movie} now={now} className={s.prenota} />
        </nav>
      </div>
      <div id="indice-film" ref={pannello} className={s.indice} data-aperto={aperto} hidden={!aperto}>
        <ul className={s.lista}>
          {film.map(x => (
            <li key={x.movie.id}>
              <button type="button" className={s.voceIndice} aria-current={x === attuale ? 'true' : undefined}
                onClick={() => { setAperto(false); vaiA(`[data-film-ancora="${x.movie.id}"]`); }}>
                <span className={s.miniatura}>{x.movie.poster_path && <Image src={img(x.movie.poster_path, 'w185')} alt="" fill sizes="44px" />}</span>
                <span className={s.voceTesto}>
                  <span className={s.voceTitolo}>{x.movie.title}</span>
                  <span className={s.voceQuando}>{quando(x.show, now)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
