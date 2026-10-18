'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTrailer } from '@/context/TrailerContext';
import { trailerOf } from './regia';
import { Film, Show, FilmLogo, PrenotaButton, dataLine, dayLabel, gsap, img, prefersMotion, registraGsap, sala, time } from './shared';
import base from './Home.module.css';
import s from './Apertura.module.css';

/**
 * L'apertura: il fondale del film più vicino sale dal nero, poi arrivano il
 * logo (da sfocato a nitido), il giorno, l'ora, la sala, i dati e per ultimo
 * Prenota. Tutto il testo sta nella metà bassa, sul velo: mai sopra i volti.
 * L'animazione parte quando il fondale è pronto, o dopo 2,5 s comunque.
 */
export default function Apertura({ film, show, now }: { film: Film; show: Show; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const [pronto, setPronto] = useState(false);
  const { openTrailer } = useTrailer();
  const trailer = trailerOf(film);

  useEffect(() => {
    const t = setTimeout(() => setPronto(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el || !pronto) return;
    if (!prefersMotion()) { el.classList.add(s.ferma); return; }
    el.classList.add(s.regia);
    registraGsap();
    const q = gsap.utils.selector(el);
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
      tl.fromTo(q(`.${s.fondo}`), { opacity: 0, scale: 1.1 }, { opacity: 1, scale: 1, duration: 3.4, ease: 'power2.out' })
        .fromTo(q(`.${s.velo}`), { opacity: 0 }, { opacity: 1, duration: 2 }, 0.6)
        .fromTo(q(`.${s.logoBox}`), { opacity: 0, y: 26, filter: 'blur(16px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.8 }, 1.4)
        .fromTo(q(`.${s.quando}`), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1.2 }, 2.0)
        .fromTo(q(`.${s.ora}`), { opacity: 0, y: 30, letterSpacing: '0.08em' }, { opacity: 1, y: 0, letterSpacing: '-0.02em', duration: 1.8 }, 2.1)
        .fromTo(q(`.${s.sala}`), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1.2 }, 2.4)
        .fromTo(q(`.${s.righe} > span`), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1, stagger: 0.08 }, 2.5)
        .fromTo(q(`.${s.azioni}`), { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 1.2 }, 3.0)
        .fromTo(q(`.${s.marca}`), { opacity: 0 }, { opacity: 1, duration: 1.5 }, 3.2);
      // Scendendo, il fotogramma si allontana piano.
      gsap.to(q(`.${s.fondo}`), { yPercent: 10, ease: 'none', scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true } });
    }, el);
    return () => ctx.revert();
  }, [pronto]);

  return (
    <section ref={root} className={s.apertura} aria-label={`In sala: ${film.title}`}>
      <span className={`${base.dati} ${s.marca} ${s.entra}`}>Vestri Cinema</span>
      <div className={`${s.fondo} ${s.entra}`}>
        <Image
          src={img(film.backdrop_path || film.poster_path, 'w1280')}
          alt=""
          fill
          priority
          sizes="100vw"
          onLoad={() => setPronto(true)}
          style={{ objectFit: 'cover', objectPosition: '50% 30%' }}
        />
      </div>
      <div className={`${s.velo} ${s.entra}`} />
      <div className={s.info}>
        <div>
          {/* Il filtro dell'animazione sta sul contenitore: sul logo c'è già quello che accende i loghi scuri. */}
          <div className={`${s.logoBox} ${s.entra}`}><FilmLogo film={film} className={s.logo} priority sizes="(max-width: 768px) 80vw, 560px" /></div>
          <div className={`${base.dati} ${s.righe}`}>
            {dataLine(film, show).map(x => <span key={x} className={s.entra}>{x}</span>)}
          </div>
        </div>
        <div className={s.destra}>
          <div className={`${base.dati} ${s.quando} ${s.entra}`}>{dayLabel(show.date, now)}</div>
          <div className={`${base.titoli} ${s.ora} ${s.entra}`}>{time(show.date)}</div>
          {sala(show) && <div className={`${base.dati} ${s.sala} ${s.entra}`}>{sala(show)}</div>}
          <div className={`${s.azioni} ${s.entra}`}>
            <PrenotaButton show={show} film={film} />
            {trailer && <button className={s.trailer} onClick={() => openTrailer(trailer)}>Trailer</button>}
          </div>
        </div>
      </div>
    </section>
  );
}
