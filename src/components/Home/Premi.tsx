'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { resolveFestival } from './festivals';
import { backdropsOf, WeighedAward } from './regia';
import { Film, Coda, SplitText, Testata, dayLong, gsap, img, nextShow, time, useBook, useRegia, Vicina } from './shared';
import base from './Home.module.css';
import s from './Premi.module.css';

const festivalName = (a: WeighedAward) => resolveFestival(a.type).name;

/**
 * Quanto spazio prende un riquadro della parete, su sei colonne (due sul
 * telefono): il primo è grande, il secondo alto, poi file da tre. L'ultima
 * fila si allarga per non lasciare buchi.
 */
function misura(i: number, n: number): React.CSSProperties {
  let c = 2, r = 1;
  if (n === 1) { c = 6; r = 2; }
  else if (i === 0) { c = 4; r = 2; }
  else if (i === 1) { c = 2; r = 2; }
  else {
    const resto = n - 2, pieni = Math.floor(resto / 3) * 3;
    if (i - 2 >= pieni) c = resto - pieni === 1 ? 6 : 3;
  }
  const cm = i === 0 || (i === n - 1 && (n - 1) % 2 === 1) ? 2 : 1;
  return { '--c': c, '--r': r, '--cm': cm, '--rm': i === 0 ? 2 : 1 } as React.CSSProperties;
}

/** La pagina d'onore: il premio più alto della settimana, a tutto schermo. */
export function Onore({ film, award, now }: { film: Film; award: WeighedAward; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const fest = resolveFestival(award.type);
  const sfondo = backdropsOf(film)[1] || film.backdrop_path;
  useRegia(root, () => {
    gsap.from('[data-festival]', { scale: 0.35, opacity: 0, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top 85%', end: 'top 15%', scrub: true } });
    // Il premio sale lettera per lettera, al passo dello scorrimento.
    const premio = SplitText.create('[data-premio]', { type: 'chars', mask: 'chars' });
    gsap.from(premio.chars, { yPercent: 115, ease: 'none', stagger: 0.05, scrollTrigger: { trigger: root.current, start: 'top 62%', end: 'top 8%', scrub: 0.8 } });
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
      <Testata id="parete-titolo" occhiello="Dai festival" destra={<span className={base.dati}>{items.length} premi vinti</span>}>
        Premiati <em>e in sala</em>
      </Testata>
      <div className={s.griglia}>
        {items.map(({ movie: f, award: a }, i) => {
          const fest = resolveFestival(a.type);
          const dietro = backdropsOf(f)[(i + 1) % Math.max(1, backdropsOf(f).length)];
          const sh = nextShow(f, now);
          return (
            <button key={`${f.id}-${a.type}-${a.year}`} type="button" className={`${s.tessera} ${i === 0 ? s.grande : ''}`} style={misura(i, items.length)} data-tessera
              onClick={() => book(sh, f)} aria-label={`${f.title}, ${dayLong(sh.date)} alle ${time(sh.date)}: prenota`}>
              <span className={s.dietro} data-dietro><Vicina><Image src={img(dietro, 'w780')} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" style={{ objectFit: 'cover' }} /></Vicina></span>
              <span className={s.contenuto}>
                <Image src={fest.logo} alt={fest.name} width={200} height={200} className={s.logoFest} sizes="120px" />
                <span>
                  <span className={`${base.titoli} ${s.cosa}`}>{i === 0 ? a.prize : a.won[0]}</span>
                  <span className={`${base.dati} ${s.film}`}>{festivalName(a)}{a.year ? ` ${a.year}` : ''} · {f.title}</span>
                </span>
                <span className={`${base.dati} ${s.quando}`}>{dayLong(sh.date).split(' ').slice(0, 2).join(' ')} · {time(sh.date)} <span aria-hidden>→</span></span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
