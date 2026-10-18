'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Slot } from './regia';
import Image from 'next/image';
import { Film, Show, Coda, FilmLogo, dayLabel, gsap, img, prefersMotion, time, useBook, Vicina } from './shared';
import base from './Home.module.css';
import s from './Conto.module.css';

/**
 * Quanto manca al prossimo spettacolo, con le cifre a palette del tabellone.
 * Quando uno spettacolo comincia il conto non sparisce: passa da solo al
 * successivo della settimana.
 */
export default function Conto({ film: primoFilm, show: primoShow, seguenti = [], now }: { film: Film; show: Show; seguenti?: Slot<Film>[]; now: Date }) {
  const coda = useMemo(() => [{ movie: primoFilm, show: primoShow }, ...seguenti.filter(x => x.show.date > primoShow.date)], [primoFilm, primoShow, seguenti]);
  const [indice, setIndice] = useState(0);
  const [resto, setResto] = useState<number | null>(null);
  const cifre = useRef<HTMLDivElement>(null);
  const prima = useRef('');
  const { movie: film, show } = coda[Math.min(indice, coda.length - 1)];
  const poi = coda.slice(indice + 1).filter((x, i, a) => a.findIndex(y => y.movie.id === x.movie.id) === i && x.movie.id !== film.id).slice(0, 3);
  const book = useBook();

  useEffect(() => {
    const tic = () => {
      const ora = Date.now();
      let i = indice;
      while (i < coda.length - 1 && new Date(coda[i].show.date).getTime() <= ora) i++;
      if (i !== indice) { setIndice(i); return; }
      setResto(Math.max(0, Math.floor((new Date(coda[i].show.date).getTime() - ora) / 1000)));
    };
    tic();
    const id = setInterval(tic, 1000);
    return () => clearInterval(id);
  }, [coda, indice]);

  const giorni = resto == null ? 0 : Math.floor(resto / 86400);
  const ore = resto == null ? '--' : String(Math.floor((resto % 86400) / 3600)).padStart(2, '0');
  const min = resto == null ? '--' : String(Math.floor((resto % 3600) / 60)).padStart(2, '0');
  const sec = resto == null ? '--' : String(resto % 60).padStart(2, '0');
  const testo = ore + min + sec;

  // La palette che gira: solo sulle cifre cambiate.
  useEffect(() => {
    if (!cifre.current || !prefersMotion() || resto == null) return;
    const el = cifre.current.querySelectorAll('[data-cifra]');
    [...testo].forEach((ch, i) => { if (prima.current && ch !== prima.current[i]) gsap.fromTo(el[i], { rotateX: -90, opacity: 0.2 }, { rotateX: 0, opacity: 1, duration: 0.45, ease: 'power2.out' }); });
    prima.current = testo;
  }, [testo, resto]);

  // Si nasconde solo quando è cominciato anche l'ultimo spettacolo della settimana.
  if (resto === 0 && indice >= coda.length - 1) return null;
  const gruppi = [ore, min, sec];

  return (
    <section className={s.conto} aria-label="Il prossimo spettacolo">
      <div className={s.fondo}><Vicina><Image src={img(film.backdrop_path, 'w780')} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} /></Vicina></div>
      <div className={s.corpo}>
        <span className={`${base.dati} ${s.etichetta}`}>Il prossimo spettacolo inizia tra{giorni > 0 ? ` ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'} e` : ''}</span>
        <div ref={cifre} className={s.cifre} role="timer" aria-live="off" aria-label={`${ore} ore, ${min} minuti`}>
          {gruppi.map((g, gi) => (
            <span key={gi} className={s.gruppo}>
              {[...g].map((c, ci) => <span key={ci} data-cifra className={s.cifra}>{c}</span>)}
              {gi < 2 && <span className={s.sep}>:</span>}
            </span>
          ))}
        </div>
        <Coda film={film} show={show} className={s.coda} />
        {poi.length > 0 && (
          <div className={s.poi}>
            <span className={`${base.dati} ${s.poiEtichetta}`}>E poi</span>
            <ol className={s.poiLista}>
              {poi.map(x => (
                <li key={x.show.id}>
                  <button type="button" className={s.poiVoce} onClick={() => book(x.show as Show, x.movie)} aria-label={`${x.movie.title}, ${dayLabel(x.show.date, now)} alle ${time(x.show.date)}: prenota`}>
                    <span className={`${base.dati} ${s.poiQuando}`}>{dayLabel(x.show.date, now)} · {time(x.show.date)}</span>
                    <FilmLogo film={x.movie} className={s.poiLogo} sizes="200px" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
