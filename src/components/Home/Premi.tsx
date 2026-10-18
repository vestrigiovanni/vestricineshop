'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { resolveFestival } from './festivals';
import { backdropsOf, WeighedAward } from './regia';
import { Film, Coda, dayLong, gsap, img, nextShow, time, useBook, useRegia, Vicina } from './shared';
import base from './Home.module.css';
import s from './Premi.module.css';

const festivalName = (a: WeighedAward) => resolveFestival(a.type).name;

/** La pagina d'onore: il premio più alto della settimana, a tutto schermo. */
export function Onore({ film, award, now }: { film: Film; award: WeighedAward; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const fest = resolveFestival(award.type);
  const sfondo = backdropsOf(film)[1] || film.backdrop_path;
  useRegia(root, () => {
    gsap.from('[data-festival]', { scale: 0.35, opacity: 0, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top 85%', end: 'top 15%', scrub: true } });
    gsap.from('[data-premio]', { letterSpacing: '0.3em', opacity: 0, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top 60%', end: 'top 5%', scrub: true } });
    gsap.to('[data-sfondo]', { scale: 1.15, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  return (
    <section ref={root} className={s.onore} aria-label={`${award.prize}, ${fest.name}`}>
      <div className={s.sfondo} data-sfondo><Vicina><Image src={img(sfondo, 'w1280')} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} /></Vicina></div>
      <div className={s.corpo}>
        <Image src={fest.logo} alt={fest.name} width={380} height={380} className={s.festival} data-festival sizes="(max-width: 768px) 50vw, 380px" />
        <span className={`${base.dati} ${s.chi}`}>{fest.name}{award.year ? ` · ${award.year}` : ''}</span>
        <h2 className={`${base.titoli} ${s.premio}`} data-premio>{award.prize}</h2>
        <Coda film={film} show={nextShow(film, now)} className={s.coda} />
      </div>
    </section>
  );
}

/** La parete dei premi: un riquadro per premio vinto, il film vincitore che sale dietro il logo. */
export function Parete({ items, now }: { items: { movie: Film; award: WeighedAward }[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const book = useBook();
  useRegia(root, () => {
    gsap.utils.toArray<HTMLElement>('[data-tessera]').forEach(el =>
      gsap.to(el.querySelector('[data-dietro]'), { clipPath: 'inset(0 0 0% 0)', duration: 1.2, ease: 'power3.inOut', scrollTrigger: { trigger: el, start: 'top 82%' } }));
  });
  return (
    <section ref={root} className={s.parete} aria-labelledby="parete-titolo">
      <h2 id="parete-titolo" className={`${base.titoli} ${s.titolo}`}>Premiati <span>e in sala</span></h2>
      <div className={s.griglia}>
        {items.map(({ movie: f, award: a }, i) => {
          const fest = resolveFestival(a.type);
          const dietro = backdropsOf(f)[(i + 1) % Math.max(1, backdropsOf(f).length)];
          const sh = nextShow(f, now);
          return (
            <button key={`${f.id}-${a.type}-${a.year}`} type="button" className={`${s.tessera} ${i === 0 ? s.grande : i < 3 ? s.media : i < 6 ? s.larga : ''}`} data-tessera
              onClick={() => book(sh, f)} aria-label={`${f.title}, ${dayLong(sh.date)} alle ${time(sh.date)}: prenota`}>
              <span className={s.dietro} data-dietro><Vicina><Image src={img(dietro, 'w780')} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" style={{ objectFit: 'cover' }} /></Vicina></span>
              <span className={s.contenuto}>
                <Image src={fest.logo} alt={fest.name} width={200} height={200} className={s.logoFest} sizes="120px" />
                <span>
                  <span className={`${base.titoli} ${s.cosa}`}>{i === 0 ? a.prize : a.won[0]}</span>
                  <span className={`${base.dati} ${s.film}`}>{festivalName(a)}{a.year ? ` ${a.year}` : ''} · {f.title}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
