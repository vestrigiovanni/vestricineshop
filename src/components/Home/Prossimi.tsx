'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { Slot } from './programma';
import { useLuce, varDi } from './Luce';
import { Film, Scheda, giornoDi, img } from './shared';
import s from './Prossimi.module.css';

/**
 * Atto 3, nei prossimi giorni. Abbondanza: lo scorrimento in giù porta le
 * locandine di lato, come una sala di museo. Ogni locandina ha la stessa
 * scheda e il suo colore (il Prenota è nella tinta del suo film).
 */
export default function Prossimi({ slots, lontani, now }: { slots: Slot<Film>[]; lontani: number; now: Date }) {
  const { stanze } = useLuce();
  const n = slots.length;
  const span = Math.min(3.3, Math.round((1 + 0.42 * (n + 1)) * 100) / 100);
  const primo = giornoDi(slots[0].show.date, now), ultimo = giornoDi(slots[n - 1].show.date, now);
  return (
    <section className={s.prossimi} data-sc-act="pan" data-sc-span={span} style={{ height: `${span * 100}vh` }} aria-labelledby="prossimi-titolo">
      <div className={`sc-stage ${s.palco}`} data-sc-stage>
        <div className={s.binario} data-sc-pan="0.04" style={{ '--n': n } as CSSProperties}>
          <header className={s.capo}>
            {/* Tutti lo stesso giorno: l'atto si chiama come quel giorno ("Domani."). */}
            <h2 id="prossimi-titolo" className={s.titolo}>{primo === ultimo ? `${primo}.` : 'Nei prossimi giorni.'}</h2>
            <p className={s.sotto}>{n} film{primo === ultimo ? '' : `, da ${primo.toLowerCase()} a ${ultimo.toLowerCase()}`}.</p>
          </header>
          {slots.map((x, i) => (
            <article key={x.movie.id} className={s.opera} style={{ '--i': i, ...varDi(stanze[x.movie.id]) } as CSSProperties} data-luce={x.movie.id} data-film-ancora={x.movie.id}>
              <div className={s.locandina} data-sc-tilt="5">
                {/* Niente Vicina qui: le locandine stanno di lato, fuori dallo schermo in orizzontale,
                    e il caricamento pigro del browser guarda anche quella distanza. */}
                <Image src={img(x.movie.poster_path, 'w500')} alt={`Locandina di ${x.movie.title}`} fill sizes="(max-width: 860px) 62vw, 24vw" />
              </div>
              <Scheda film={x.movie} show={x.show} now={now} conLogo={false} className={s.scheda} />
            </article>
          ))}
          {lontani > 0 && <p className={s.coda}>E ancora {lontani === 1 ? 'un film' : `${lontani} film`}, più avanti.</p>}
        </div>
      </div>
    </section>
  );
}
