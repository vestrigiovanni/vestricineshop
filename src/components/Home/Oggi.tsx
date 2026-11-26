'use client';

import { useEffect, useRef } from 'react';
import Image from '@/components/Immagine';
import { nextShow, type Slot } from './programma';
import { Cartellino, Posti } from './Dati';
import { sala } from './metadati';
import { Film, FilmLogo, Prenota, Show, Vicina, giornoDi, img, ora, prefersMotion, useBook } from './shared';
import base from './Home.module.css';
import s from './Oggi.module.css';

/** Quanto scorrimento per ogni film che sfuma nel successivo. */
const PER_FILM = 0.9;

/**
 * Atto 2, tutti i film del giorno. Scoperta: la cornice resta ferma e i film
 * si sciolgono uno nell'altro, ciascuno col suo orario grande, il logo, il
 * cartellino e Prenota. Sotto la cornice c'è la scaletta del giorno, con
 * l'ora e il titolo di tutti: si vede subito che cosa danno, e toccando una
 * voce si va a quel film. Quando ci si ferma su un film la stanza prende la
 * sua luce (`data-luce-da/a`).
 *
 * Lo scorrimento sceglie quale film è acceso; la dissolvenza va poi da sola,
 * a tempo suo. Si dissolve solo l'immagine (un elemento solo, senza
 * ingrandirla) e le righe del testo entrano una dopo l'altra: col processore
 * dissolvere un gruppo intero, o ingrandire un fotogramma per due secondi e
 * mezzo, teneva lento un fotogramma su tre.
 */
export default function Oggi({ slots, now }: { slots: Slot<Film>[]; now: Date }) {
  const atto = useRef<HTMLElement>(null);
  const n = slots.length;
  const span = Math.round((0.6 + n * PER_FILM) * 100) / 100;
  // Tutti dello stesso giorno? Allora l'atto ha un nome: "Oggi", "Domani".
  const giorni = new Set(slots.map(x => giornoDi(x.show.date, now)));
  const nome = giorni.size === 1 ? [...giorni][0] : 'Subito dopo';

  useEffect(() => {
    const el = atto.current;
    if (!el) return;
    let acceso = -1, raf = 0;
    const leggi = () => {
      raf = 0;
      // Il progresso si misura qui e non si chiede al motore: nello stesso fotogramma
      // il motore può aggiornarlo dopo, e l'ultimo passo di uno scorrimento resterebbe indietro.
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(r.height - innerHeight, 1)));
      const i = Math.min(n - 1, Math.floor(p * n));
      if (i === acceso) return;
      acceso = i;
      el.querySelectorAll<HTMLElement>('[data-voce]').forEach(v => {
        const mio = Number(v.dataset.voce) === i;
        v.toggleAttribute('data-acceso', mio);
        if (v.tagName === 'BUTTON') v.setAttribute('aria-current', mio ? 'true' : 'false');
      });
    };
    const chiedi = () => { if (!raf) raf = requestAnimationFrame(leggi); };
    // Si ascolta lo scorrimento solo mentre l'atto è in vista.
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { addEventListener('scroll', chiedi, { passive: true }); chiedi(); }
      else removeEventListener('scroll', chiedi);
    });
    io.observe(el);
    return () => { io.disconnect(); removeEventListener('scroll', chiedi); cancelAnimationFrame(raf); };
  }, [n]);

  /** Dalla scaletta: porta lo scorrimento al tratto dell'atto in cui quel film è acceso. */
  const vaiAl = (i: number) => {
    const el = atto.current;
    if (!el) return;
    const corsa = el.offsetHeight - innerHeight;
    const top = el.getBoundingClientRect().top + scrollY + corsa * ((i + 0.5) / n);
    window.scrollTo({ top, behavior: prefersMotion() ? 'smooth' : 'auto' });
  };

  return (
    <section ref={atto} className={s.oggi} data-atto="oggi" data-sc-act="pin" data-sc-span={span} style={{ height: `${span * 100}vh` }} aria-labelledby="oggi-titolo">
      <div className={`sc-stage ${s.palco}`} data-sc-stage>
        <header className={s.capo}>
          <h2 id="oggi-titolo" className={s.nome}>{nome}</h2>
          <p className={s.conto}>{n === 1 ? 'Un film' : `${n} film`}</p>
        </header>
        <div className={s.cornice}>
          {slots.map((x, i) => (
            <div key={x.movie.id} className={s.quadro} data-voce={i} data-acceso={i === 0 ? '' : undefined}>
              <Vicina><Image src={img(x.movie.backdrop_path, 'w1280')} alt="" fill sizes="(max-width: 860px) 100vw, 60vw" /></Vicina>
            </div>
          ))}
        </div>
        <div className={s.testi}>
          {slots.map((x, i) => (
            <div key={x.movie.id} className={s.testo} data-voce={i} data-acceso={i === 0 ? '' : undefined}
              data-luce={x.movie.id} data-luce-da={tondo(i / n)} data-luce-a={i === n - 1 ? 1.01 : tondo((i + 1) / n)} data-film-ancora={x.movie.id}>
              <Voce film={x.movie} show={x.show} now={now} giorno={giorni.size > 1 ? giornoDi(x.show.date, now) : nome} />
            </div>
          ))}
        </div>
        {/* La scaletta: tutti i film del giorno, in ordine d'orario. */}
        {n > 1 && (
          <ol className={s.scaletta} aria-label={`La scaletta: ${nome.toLowerCase()}`}>
            {slots.map((x, i) => (
              <li key={x.movie.id}>
                <button type="button" className={s.tappa} data-voce={i} data-acceso={i === 0 ? '' : undefined} aria-current={i === 0 ? 'true' : 'false'} onClick={() => vaiAl(i)}>
                  <span className={s.tappaOra}>{ora(x.show)}</span>
                  <span className={s.tappaNome}>{x.movie.title}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

const tondo = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000;

function Voce({ film, show, now, giorno }: { film: Film; show: Show; now: Date; giorno: string }) {
  const book = useBook();
  // Esaurito oggi, ma con un'altra data: "Altre date" apre la sua scheda.
  const altra = show.isSoldOut ? nextShow(film, now) : null;
  const dove = sala(show);
  return (
    <>
      <p className={s.ora}><time dateTime={show.date}>{ora(show)}</time></p>
      <p className={`${base.quando} ${s.giorno}`}>{giorno}{dove && <span className={base.sala}>{dove}</span>}</p>
      <h3 className={s.titolo}><FilmLogo film={film} className={s.logo} verso="centro" sizes="(max-width: 860px) 70vw, 380px" /></h3>
      <Cartellino film={film} show={show} now={now} />
      <div className={s.azione}>
        <Prenota show={show} film={film} now={now} />
        {!show.isSoldOut && <Posti show={show} sempre />}
        {altra && !altra.isSoldOut && <button type="button" className={base.prenotaLink} onClick={() => book(altra as Show, film)}>Altre date</button>}
      </div>
    </>
  );
}
