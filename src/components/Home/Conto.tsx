'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Film, Show, Coda, gsap, img, prefersMotion, Vicina } from './shared';
import base from './Home.module.css';
import s from './Conto.module.css';

/** Quanto manca al prossimo spettacolo, con le cifre a palette del tabellone. */
export default function Conto({ film, show }: { film: Film; show: Show }) {
  const [resto, setResto] = useState<number | null>(null);
  const cifre = useRef<HTMLDivElement>(null);
  const prima = useRef('');

  useEffect(() => {
    const inizio = new Date(show.date).getTime();
    const tic = () => setResto(Math.max(0, Math.floor((inizio - Date.now()) / 1000)));
    tic();
    const id = setInterval(tic, 1000);
    return () => clearInterval(id);
  }, [show.date]);

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

  if (resto === 0) return null;
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
      </div>
    </section>
  );
}
