'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Film, Flip, ScrollTrigger, Testata, dayLabel, gsap, img, inLettere, lingua, maiuscola, nextShow, prefersMotion, registraGsap, runtime, time, useBook, useRegia, Vicina } from './shared';
import base from './Home.module.css';
import s from './Cartellone.module.css';

/** "Anni '90", "Anni 2000". */
export const decennio = (anno?: string) => {
  const n = Number(anno);
  return Number.isFinite(n) && n > 1800 ? Math.floor(n / 10) * 10 : null;
};
const nomeDecennio = (d: number) => (d < 2000 ? `Anni '${String(d).slice(2)}` : `Anni ${d}`);
const ORIGINALE = /^originale$/i;
const nomeLingua = (l: string) => (ORIGINALE.test(l) ? 'Originale' : l);

function Chip({ attivo, onClick, children, n }: { attivo: boolean; onClick: () => void; children: React.ReactNode; n: number }) {
  return (
    <button type="button" className={`${base.dati} ${s.chip} ${attivo ? s.chipAttivo : ''}`} onClick={onClick} aria-pressed={attivo} disabled={!n && !attivo}>
      {children}<sup className={s.conta}>{n}</sup>
    </button>
  );
}

/**
 * Il cartellone: tutti i film in sala, uno accanto all'altro. Il titolo li
 * conta ("Trentadue film"), la riga sotto dice quanti registi e quali anni
 * attraversano; i filtri per decennio e per lingua li rimescolano. Ogni
 * locandina prenota il prossimo spettacolo del suo film.
 */
export default function Cartellone({ films, now }: { films: Film[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const griglia = useRef<HTMLDivElement>(null);
  const stato = useRef<Flip.FlipState | null>(null);
  const entrata = useRef<ScrollTrigger[]>([]);
  const [filtro, setFiltro] = useState<{ decennio: number | null; lingua: string | null }>({ decennio: null, lingua: null });
  const book = useBook();

  const schede = useMemo(() => films.map(f => {
    const futuri = f.subevents.filter(x => new Date(x.date) >= now);
    return {
      film: f,
      show: nextShow(f, now),
      decennio: decennio(f.release_year),
      lingue: [...new Set(futuri.map(x => x.language).filter((l): l is string => !!l))],
      spettacoli: futuri.length,
    };
  }), [films, now]);

  const registi = new Set(films.map(f => f.director).filter(Boolean)).size;
  const anni = films.map(f => Number(f.release_year)).filter(n => n > 1800);
  const [dal, al] = anni.length ? [Math.min(...anni), Math.max(...anni)] : [0, 0];

  const passa = (x: (typeof schede)[number], f = filtro) =>
    (f.decennio == null || x.decennio === f.decennio) && (f.lingua == null || x.lingue.includes(f.lingua));
  const decenni = [...new Set(schede.map(x => x.decennio).filter((d): d is number => d != null))].sort((a, b) => a - b);
  const lingue = [...new Set(schede.flatMap(x => x.lingue))].sort((a, b) => (ORIGINALE.test(a) ? 1 : ORIGINALE.test(b) ? -1 : a.localeCompare(b, 'it')));
  const visibili = schede.filter(x => passa(x)).length;

  const scegli = (prossimo: typeof filtro) => {
    if (griglia.current && prefersMotion()) {
      registraGsap();
      // Chi usa i filtri ha già davanti il cartellone: l'ingresso a gruppi finisce qui.
      entrata.current.forEach(t => t.kill());
      entrata.current = [];
      gsap.set(griglia.current.querySelectorAll('[data-scheda]'), { opacity: 1, y: 0 });
      stato.current = Flip.getState(griglia.current.querySelectorAll('[data-scheda]'));
    }
    setFiltro(prossimo);
  };

  // Dopo il filtro, le locandine scivolano al loro posto nuovo.
  useLayoutEffect(() => {
    const st = stato.current;
    if (!st) return;
    stato.current = null;
    Flip.from(st, {
      duration: 0.9,
      ease: 'expo.out',
      scale: true,
      absolute: true,
      stagger: 0.012,
      onEnter: els => gsap.fromTo(els, { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'expo.out', delay: 0.15 }),
      onLeave: els => gsap.to(els, { opacity: 0, scale: 0.86, duration: 0.35, ease: 'power2.in' }),
      onComplete: () => ScrollTrigger.refresh(),
    });
  }, [filtro]);

  // Le locandine entrano a gruppi, man mano che arrivano sullo schermo.
  useRegia(root, () => {
    const carte = gsap.utils.toArray<HTMLElement>('[data-scheda]');
    gsap.set(carte, { opacity: 0, y: 48 });
    entrata.current = ScrollTrigger.batch(carte, {
      start: 'top 94%',
      once: true,
      onEnter: gruppo => gsap.to(gruppo, { opacity: 1, y: 0, duration: 1.1, stagger: 0.06, ease: 'expo.out', overwrite: true }),
    });
  });

  return (
    <section ref={root} id="film" className={s.cartellone} aria-labelledby="cartellone-titolo">
      <Testata
        id="cartellone-titolo"
        occhiello="Il cartellone"
        sotto={<>{registi ? `${maiuscola(inLettere(registi))} registi` : ''}{dal && al > dal ? `, dal ${dal} al ${al}` : ''}.</>}
        destra={<span className={base.dati} aria-live="polite">{visibili === films.length ? `${films.length} film · tutti` : `${visibili} di ${films.length} film`}</span>}
      >
        {maiuscola(inLettere(films.length))} film
      </Testata>

      <div className={s.filtri}>
        <div className={s.gruppo} role="group" aria-labelledby="filtro-epoca">
          <span id="filtro-epoca" className={`${base.dati} ${s.etichetta}`}>Epoca</span>
          <div className={s.chips}>
            <Chip attivo={filtro.decennio == null} onClick={() => scegli({ ...filtro, decennio: null })} n={schede.filter(x => passa(x, { ...filtro, decennio: null })).length}>Tutte</Chip>
            {decenni.map(d => (
              <Chip key={d} attivo={filtro.decennio === d} n={schede.filter(x => passa(x, { ...filtro, decennio: d })).length}
                onClick={() => scegli({ ...filtro, decennio: filtro.decennio === d ? null : d })}>{nomeDecennio(d)}</Chip>
            ))}
          </div>
        </div>
        {lingue.length > 1 && (
          <div className={s.gruppo} role="group" aria-labelledby="filtro-lingua">
            <span id="filtro-lingua" className={`${base.dati} ${s.etichetta}`}>Lingua</span>
            <div className={s.chips}>
              <Chip attivo={filtro.lingua == null} onClick={() => scegli({ ...filtro, lingua: null })} n={schede.filter(x => passa(x, { ...filtro, lingua: null })).length}>Tutte</Chip>
              {lingue.map(l => (
                <Chip key={l} attivo={filtro.lingua === l} n={schede.filter(x => passa(x, { ...filtro, lingua: l })).length}
                  onClick={() => scegli({ ...filtro, lingua: filtro.lingua === l ? null : l })}>{nomeLingua(l)}</Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      <div ref={griglia} className={s.griglia}>
        {schede.map(x => {
          const { film: f, show: sh } = x;
          const fuori = !passa(x);
          return (
            <button key={f.id} type="button" className={s.scheda} data-scheda data-flip-id={f.id} data-fuori={fuori || undefined}
              tabIndex={fuori ? -1 : undefined} aria-hidden={fuori || undefined}
              onClick={() => book(sh, f)} aria-label={`${f.title}${f.director ? `, di ${f.director}` : ''}: ${dayLabel(sh.date, now)} alle ${time(sh.date)}, prenota`}>
              <span className={s.locandina}>
                <Vicina><Image src={img(f.poster_path || f.backdrop_path, 'w342')} alt="" fill sizes="(max-width: 767px) 46vw, (max-width: 1199px) 22vw, 190px" style={{ objectFit: 'cover' }} /></Vicina>
                <span className={s.sopra}>
                  <span className={`${base.dati} ${s.sopraDati}`}>{[runtime(f.runtime), lingua(sh)].filter(Boolean).join(' · ')}</span>
                  <span className={`${base.dati} ${s.sopraPrenota}`}>{sh.isSoldOut ? 'Esaurito' : 'Prenota'}</span>
                </span>
              </span>
              <span className={s.didascalia}>
                <span className={`${base.dati} ${s.quando}`}>{dayLabel(sh.date, now)} · {time(sh.date)}</span>
                <span className={`${base.titoli} ${s.titolo}`}>{f.title}</span>
                <span className={`${base.dati} ${s.chi}`}>{[f.director, f.release_year].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
