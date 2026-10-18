'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTrailer } from '@/context/TrailerContext';
import { trailerOf, type Slot } from './regia';
import { Film, Show, FilmLogo, PrenotaButton, ScrollTrigger, dataLine, dayLabel, dayShort, gsap, img, prefersMotion, registraGsap, sala, time, vaiA } from './shared';
import base from './Home.module.css';
import s from './Apertura.module.css';

/** Quanto resta in scena ogni film del giro. */
const DURATA = 7;

/**
 * L'apertura: il fondale del film più vicino sale dal nero, poi arrivano il
 * logo (da sfocato a nitido), il giorno, l'ora, la sala, i dati e per ultimo
 * Prenota. Poi la sala gira: ogni sette secondi entra il prossimo film, e la
 * fila di orari in basso dice quanti ce ne sono e quale viene dopo.
 * Tutto il testo sta nella metà bassa, sul velo: mai sopra i volti.
 */
export default function Apertura({ giro, now }: { giro: Slot<Film>[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const [pronto, setPronto] = useState(false);
  const [attivo, setAttivo] = useState(0);
  // I fondali dopo il primo si chiedono solo quando l'apertura ha finito di entrare.
  const [tutti, setTutti] = useState(false);
  const [gira, setGira] = useState(false);
  const precedente = useRef(0);
  const avanzamento = useRef<gsap.core.Tween | null>(null);
  const fermi = useRef(new Set<string>());
  const { openTrailer } = useTrailer();
  const n = giro.length;

  useEffect(() => {
    const t = setTimeout(() => setPronto(true), 2500);
    return () => clearTimeout(t);
  }, []);

  // L'ingresso, una volta sola.
  useEffect(() => {
    const el = root.current;
    if (!el || !pronto) return;
    // Senza movimento il giro non parte da solo: gli altri fondali arrivano quando si sceglie un orario.
    if (!prefersMotion()) { el.classList.add(s.ferma); return; }
    el.classList.add(s.regia);
    registraGsap();
    const q = gsap.utils.selector(el);
    const ctx = gsap.context(() => {
      const primo = (sel: string) => q(`[data-slide="0"] ${sel}`);
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: () => { setTutti(true); setGira(true); } });
      tl.fromTo(q('[data-fondo="0"]'), { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 3.6, ease: 'power2.out' })
        .fromTo(q(`.${s.velo}`), { opacity: 0 }, { opacity: 1, duration: 2 }, 0.6)
        .fromTo(primo(`.${s.logoBox}`), { opacity: 0, y: 26, filter: 'blur(16px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.8 }, 1.4)
        .fromTo(primo(`.${s.quando}`), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1.2 }, 2.0)
        .fromTo(primo(`.${s.ora}`), { opacity: 0, y: 30, letterSpacing: '0.08em' }, { opacity: 1, y: 0, letterSpacing: '-0.02em', duration: 1.8 }, 2.1)
        .fromTo(primo(`.${s.sala}`), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1.2 }, 2.4)
        .fromTo(primo(`.${s.righe} > span`), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1, stagger: 0.08 }, 2.5)
        .fromTo(primo(`.${s.azioni}`), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.2 }, 3.0)
        .fromTo(q(`.${s.testa}`), { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 1.5 }, 3.0)
        .fromTo(q(`.${s.giro}`), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1.4 }, 3.2);

      // Scendendo, il fotogramma si allontana e il testo si ritira.
      gsap.to(q(`.${s.fondi}`), { yPercent: 12, scale: 1.04, ease: 'none', scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to(q(`.${s.palco}`), { yPercent: -18, opacity: 0, ease: 'none', scrollTrigger: { trigger: el, start: 'top top', end: '70% top', scrub: true } });
    }, el);
    return () => ctx.revert();
  }, [pronto]);

  // Il passaggio da un film all'altro.
  useEffect(() => {
    const el = root.current;
    const da = precedente.current;
    precedente.current = attivo;
    if (!el || da === attivo) return;
    const q = gsap.utils.selector(el);
    const fuori = q(`[data-slide="${da}"]`), dentro = q(`[data-slide="${attivo}"]`);
    const fondoFuori = q(`[data-fondo="${da}"]`), fondoDentro = q(`[data-fondo="${attivo}"]`);
    if (!prefersMotion()) {
      gsap.set([fuori, fondoFuori], { autoAlpha: 0 });
      gsap.set([dentro, fondoDentro], { autoAlpha: 1 });
      return;
    }
    gsap.killTweensOf([fuori, dentro, fondoFuori, fondoDentro]);
    gsap.set(fondoDentro, { zIndex: 1 });
    gsap.set(fondoFuori, { zIndex: 0 });
    gsap.fromTo(fondoDentro, { autoAlpha: 0, scale: 1.1 }, { autoAlpha: 1, duration: 1.6, ease: 'power2.inOut' });
    gsap.to(fondoDentro, { scale: 1, duration: DURATA + 2, ease: 'power1.out' });
    gsap.to(fondoFuori, { autoAlpha: 0, duration: 1.2, delay: 0.5, ease: 'power1.in' });
    gsap.to(fuori, { autoAlpha: 0, y: -18, duration: 0.6, ease: 'power2.in' });
    gsap.set(dentro, { autoAlpha: 1, y: 0 });
    const parti = dentro[0]?.querySelectorAll(`.${s.logoBox}, .${s.quando}, .${s.ora}, .${s.sala}, .${s.righe} > span, .${s.azioni}`);
    if (parti) gsap.fromTo(parti, { opacity: 0, y: 26, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.2, stagger: 0.06, delay: 0.45, ease: 'expo.out', clearProps: 'filter' });
  }, [attivo]);

  // L'orologio del giro: la linea sotto l'orario si riempie, poi tocca al prossimo.
  useEffect(() => {
    const el = root.current;
    if (!el || !gira || n < 2 || !prefersMotion()) return;
    const barra = el.querySelector<HTMLElement>(`[data-barra="${attivo}"]`);
    if (!barra) return;
    el.querySelectorAll<HTMLElement>('[data-barra]').forEach(b => { if (b !== barra) gsap.set(b, { scaleX: 0 }); });
    const tw = gsap.fromTo(barra, { scaleX: 0 }, { scaleX: 1, duration: DURATA, ease: 'none', onComplete: () => setAttivo(i => (i + 1) % n) });
    if (fermi.current.size) tw.pause();
    avanzamento.current = tw;
    return () => { tw.kill(); };
  }, [attivo, gira, n]);

  const ferma = useCallback((perche: string, si: boolean) => {
    if (si) fermi.current.add(perche); else fermi.current.delete(perche);
    const tw = avanzamento.current;
    if (!tw) return;
    if (fermi.current.size) tw.pause(); else tw.resume();
  }, []);

  // Fuori dallo schermo, o con la scheda nascosta, il giro si ferma.
  useEffect(() => {
    const el = root.current;
    if (!el || !gira) return;
    registraGsap();
    const st = ScrollTrigger.create({ trigger: el, start: 'top top', end: 'bottom top', onLeave: () => ferma('fuori', true), onEnterBack: () => ferma('fuori', false) });
    const vis = () => ferma('nascosta', document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => { st.kill(); document.removeEventListener('visibilitychange', vis); };
  }, [gira, ferma]);

  const scegli = (i: number) => {
    if (i === attivo) return;
    setGira(true);
    setTutti(true);
    setAttivo(i);
  };

  return (
    <section ref={root} className={s.apertura} aria-roledescription="carosello" aria-label="In sala nei prossimi giorni">
      <div className={s.fondi}>
        {giro.map(({ movie: f }, i) => (
          <div key={`${f.id}-${i}`} className={`${s.fondo} ${i === 0 ? s.entra : s.dorme}`} data-fondo={i}>
            {(i === 0 || tutti) && (
              <Image
                src={img(f.backdrop_path || f.poster_path, 'w1280')}
                alt=""
                fill
                priority={i === 0}
                sizes="100vw"
                onLoad={i === 0 ? () => setPronto(true) : undefined}
                style={{ objectFit: 'cover', objectPosition: '50% 30%' }}
              />
            )}
          </div>
        ))}
      </div>
      <div className={`${s.velo} ${s.entra}`} />

      <div className={`${s.testa} ${s.entra}`}>
        <span className={`${base.titoli} ${s.marca}`}>Vestri Cinema</span>
        <a href="#settimana" className={`${base.dati} ${s.programma}`} onClick={e => { e.preventDefault(); vaiA('#settimana'); }}>Il programma</a>
      </div>

      <div className={s.palco}>
        <div className={s.slides}>
          {giro.map(({ movie: film, show }, i) => (
            <SlideInfo key={`${film.id}-${i}`} i={i} film={film} show={show as Show} now={now} attivo={i === attivo} onTrailer={openTrailer}
              onPointerEnter={() => ferma('mano', true)} onPointerLeave={() => ferma('mano', false)} />
          ))}
        </div>

        {n > 1 && (
          <div className={`${s.giro} ${s.entra}`} role="tablist" aria-label="I prossimi film">
            {giro.map(({ movie: f, show }, i) => (
              <button key={`${f.id}-${i}`} role="tab" aria-selected={i === attivo} aria-label={`${f.title}, ${dayLabel(show.date, now)} alle ${time(show.date)}`}
                className={`${s.tacca} ${i === attivo ? s.taccaAttiva : ''}`} onClick={() => scegli(i)}>
                <span className={`${base.dati} ${s.taccaOra}`}>
                  {dayLabel(show.date, now) !== 'Oggi' && <span className={s.taccaGiorno}>{dayShort(show.date).split(' ')[0]} </span>}
                  {time(show.date)}
                </span>
                <span className={s.taccaTitolo}>{f.title}</span>
                <span className={s.taccaLinea}><span className={s.taccaPieno} data-barra={i} style={{ transform: 'scaleX(0)' }} /></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SlideInfo({ i, film, show, now, attivo, onTrailer, onPointerEnter, onPointerLeave }: {
  i: number; film: Film; show: Show; now: Date; attivo: boolean;
  onTrailer: (key: string) => void; onPointerEnter: () => void; onPointerLeave: () => void;
}) {
  const trailer = trailerOf(film);
  return (
    <div className={`${s.info} ${i === 0 ? '' : s.dorme}`} data-slide={i} aria-hidden={!attivo} inert={!attivo || undefined}
      onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <div>
        {/* Il filtro dell'animazione sta sul contenitore: sul logo c'è già quello che accende i loghi scuri. */}
        <div className={`${s.logoBox} ${i === 0 ? s.entra : ''}`}><FilmLogo film={film} className={s.logo} priority={i === 0} sizes="(max-width: 768px) 80vw, 560px" /></div>
        <div className={`${base.dati} ${s.righe}`}>
          {dataLine(film, show).map(x => <span key={x} className={i === 0 ? s.entra : ''}>{x}</span>)}
        </div>
      </div>
      <div className={s.destra}>
        <div className={`${base.dati} ${s.quando} ${i === 0 ? s.entra : ''}`}>{dayLabel(show.date, now)}</div>
        <div className={`${base.titoli} ${s.ora} ${i === 0 ? s.entra : ''}`}>{time(show.date)}</div>
        {sala(show) && <div className={`${base.dati} ${s.sala} ${i === 0 ? s.entra : ''}`}>{sala(show)}</div>}
        <div className={`${s.azioni} ${i === 0 ? s.entra : ''}`}>
          <PrenotaButton show={show} film={film} />
          {trailer && <button className={s.trailer} onClick={() => onTrailer(trailer)}><span aria-hidden>▶</span> Trailer</button>}
        </div>
      </div>
    </div>
  );
}
