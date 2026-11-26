'use client';

import { useEffect, useRef } from 'react';
import Image from '@/components/Immagine';
import type { Slot } from './programma';
import { useStanze, varDi } from './Luce';
import { Cartellino, Posti, Quando } from './Dati';
import { Film, Prenota, giornoDi, img, prefersMotion } from './shared';
import base from './Home.module.css';
import s from './Prossimi.module.css';

/**
 * Atto 3, nei prossimi giorni. Abbondanza: lo scorrimento in giù porta le
 * locandine di lato, come una sala di museo. Ogni locandina ha lo stesso
 * cartellino e il suo colore (quando, Prenota e premio sono nella tinta del
 * suo film).
 *
 * Il binario è uno scorrimento vero del browser, messo in orizzontale: lo
 * scorrimento in giù ne sposta la posizione (`scrollLeft`). Fino al 10
 * novembre 2026 lo spostava il motore con un `transform`: col processore
 * (il Firefox di Giovanni) voleva dire ridisegnare tutte le locandine a ogni
 * passo, un fotogramma ogni 50 ms. Uno scorrimento invece sposta quello che
 * è già disegnato. Per questo l'atto si fissa da sé (`sc-stage`) e non passa
 * dal dispositivo `pan` del motore.
 */
export default function Prossimi({ slots, lontani, now }: { slots: Slot<Film>[]; lontani: number; now: Date }) {
  const { stanze } = useStanze();
  const atto = useRef<HTMLElement>(null);
  const binario = useRef<HTMLDivElement>(null);
  const n = slots.length;
  const span = Math.min(3.3, Math.round((1 + 0.42 * (n + 1)) * 100) / 100);
  const primo = giornoDi(slots[0].show.date, now), ultimo = giornoDi(slots[n - 1].show.date, now);

  useEffect(() => {
    const el = atto.current, b = binario.current;
    // Senza movimento il binario si scorre a mano, di lato (vedi il foglio di stile).
    if (!el || !b || !prefersMotion()) return;
    let raf = 0, cima = 0, corsa = 1, largo = 0;
    // Le misure si prendono quando l'atto entra in vista e quando cambia la finestra,
    // non a ogni passo: chiederle a metà scorrimento obbliga il browser a ridisporre la pagina.
    const misura = () => {
      cima = el.getBoundingClientRect().top + scrollY;
      corsa = Math.max(el.offsetHeight - innerHeight, 1);
      largo = b.scrollWidth - b.clientWidth;
    };
    const leggi = () => {
      raf = 0;
      const p = Math.min(1, Math.max(0, (scrollY - cima) / corsa));
      b.scrollLeft = Math.round(p * largo);
    };
    const chiedi = () => { if (!raf) raf = requestAnimationFrame(leggi); };
    const rimisura = () => { misura(); chiedi(); };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { misura(); addEventListener('scroll', chiedi, { passive: true }); chiedi(); }
      else removeEventListener('scroll', chiedi);
    });
    io.observe(el);
    addEventListener('resize', rimisura);
    addEventListener('load', rimisura);
    return () => { io.disconnect(); removeEventListener('scroll', chiedi); removeEventListener('resize', rimisura); removeEventListener('load', rimisura); cancelAnimationFrame(raf); };
  }, [n]);

  return (
    <section ref={atto} className={s.prossimi} data-atto="prossimi" style={{ height: `${span * 100}vh` }} aria-labelledby="prossimi-titolo">
      <div className={`sc-stage ${s.palco}`}>
        <div ref={binario} className={s.binario} data-binario>
          <div className={s.fila}>
            <header className={s.capo}>
              {/* Tutti lo stesso giorno: l'atto si chiama come quel giorno ("Domani."). */}
              <h2 id="prossimi-titolo" className={base.attoTitolo}>{primo === ultimo ? `${primo}.` : 'Nei prossimi giorni.'}</h2>
              <p className={base.attoSotto}>{n} film{primo === ultimo ? '' : `, da ${primo.toLowerCase()} a ${ultimo.toLowerCase()}`}.</p>
            </header>
            {slots.map(x => (
              <article key={x.movie.id} className={s.opera} style={varDi(stanze[x.movie.id])} data-luce={x.movie.id} data-film-ancora={x.movie.id}>
                <div className={s.locandina}>
                  {/* Niente Vicina qui: le locandine stanno di lato, fuori dallo schermo in orizzontale,
                      e il caricamento pigro del browser guarda anche quella distanza. */}
                  <Image src={img(x.movie.poster_path, 'w500')} alt={`Locandina di ${x.movie.title}`} fill sizes="(max-width: 860px) 62vw, 22vw" />
                </div>
                {/* Il cartellino entra una volta, quando il binario porta la locandina in vista. */}
                <div className={s.scheda} data-sc-in>
                  <Quando show={x.show} now={now} className={s.quando} />
                  <h3 className={s.nome}>{x.movie.title}</h3>
                  <Cartellino film={x.movie} show={x.show} now={now} />
                  <div className={s.azione}>
                    <Prenota show={x.show} film={x.movie} now={now} variante="link" />
                    {!x.show.isSoldOut && <Posti show={x.show} />}
                  </div>
                </div>
              </article>
            ))}
            {lontani > 0 && <p className={s.coda}>E ancora {lontani === 1 ? 'un film' : `${lontani} film`}, più avanti.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
