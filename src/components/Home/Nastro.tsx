'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Film, ScrollTrigger, dayShort, gsap, img, nextShow, time, useBook, useRegia } from './shared';
import base from './Home.module.css';
import s from './Nastro.module.css';

/**
 * Il nastro dei titoli: tutti i film in sala, in Libre Caslon, su due righe
 * che scorrono in versi opposti. Scendendo accelerano, risalendo tornano
 * indietro. Passandoci sopra la riga si ferma e accanto al cursore compare la
 * locandina; un clic prenota il prossimo spettacolo.
 */
export default function Nastro({ films, now }: { films: Film[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const poster = useRef<HTMLDivElement>(null);
  const [sopra, setSopra] = useState<Film | null>(null);
  // Le locandine già viste restano montate: si chiedono solo al primo passaggio.
  const [visti, setVisti] = useState<number[]>([]);
  const guarda = (f: Film) => { setSopra(f); setVisti(v => (v.includes(f.id) ? v : [...v, f.id])); };
  const book = useBook();
  const righe = [films.filter((_, i) => i % 2 === 0), films.filter((_, i) => i % 2 === 1)].filter(r => r.length);
  const spettacoli = films.reduce((n, f) => n + f.subevents.filter(x => new Date(x.date) >= now).length, 0);

  useRegia(root, () => {
    const scorre = gsap.utils.toArray<HTMLElement>('[data-scorre]').map((el, i) =>
      i % 2
        ? gsap.fromTo(el, { xPercent: -50 }, { xPercent: 0, duration: 90, ease: 'none', repeat: -1 })
        : gsap.fromTo(el, { xPercent: 0 }, { xPercent: -50, duration: 90, ease: 'none', repeat: -1 }));
    let verso = 1;
    const st = ScrollTrigger.create({
      trigger: root.current, start: 'top bottom', end: 'bottom top',
      onToggle: self => scorre.forEach(t => (self.isActive ? t.resume() : t.pause())),
      onUpdate: self => {
        verso = self.direction;
        const spinta = gsap.utils.clamp(1, 8, Math.abs(self.getVelocity()) / 180);
        gsap.to(scorre, { timeScale: verso * spinta, duration: 0.2, overwrite: true, onComplete: () => { gsap.to(scorre, { timeScale: verso, duration: 1.6, ease: 'power2.out', overwrite: true }); } });
      },
    });
    // La riga sotto il cursore si ferma, così il titolo resta dove lo si vuole prendere.
    const righeEl = gsap.utils.toArray<HTMLElement>('[data-riga-nastro]');
    const entra = (i: number) => () => gsap.to(scorre[i], { timeScale: 0, duration: 0.6, ease: 'power2.out', overwrite: true });
    const esce = (i: number) => () => gsap.to(scorre[i], { timeScale: verso, duration: 1, ease: 'power2.in', overwrite: true });
    const off = righeEl.map((el, i) => {
      const a = entra(i), b = esce(i);
      el.addEventListener('pointerenter', a); el.addEventListener('pointerleave', b);
      el.addEventListener('focusin', a); el.addEventListener('focusout', b);
      return () => {
        el.removeEventListener('pointerenter', a); el.removeEventListener('pointerleave', b);
        el.removeEventListener('focusin', a); el.removeEventListener('focusout', b);
      };
    });
    // La locandina segue il cursore con un attimo di ritardo.
    const p = poster.current!;
    const vaX = gsap.quickTo(p, 'x', { duration: 0.6, ease: 'power3.out' });
    const vaY = gsap.quickTo(p, 'y', { duration: 0.6, ease: 'power3.out' });
    const ruota = gsap.quickTo(p, 'rotation', { duration: 0.8, ease: 'power3.out' });
    let ultimoX = 0;
    const muovi = (e: PointerEvent) => { vaX(e.clientX); vaY(e.clientY); ruota(gsap.utils.clamp(-12, 12, (e.clientX - ultimoX) * 0.6)); ultimoX = e.clientX; };
    window.addEventListener('pointermove', muovi);
    return () => { st.kill(); off.forEach(f => f()); window.removeEventListener('pointermove', muovi); };
  });

  return (
    <section ref={root} className={s.nastro} aria-labelledby="nastro-titolo" onPointerLeave={() => setSopra(null)}>
      <div className={s.testa}>
        <h2 id="nastro-titolo" className={`${base.dati} ${s.etichetta}`}>In sala</h2>
        <span className={`${base.dati} ${s.etichetta}`}>{films.length} film · {spettacoli} spettacoli</span>
      </div>
      {righe.map((riga, r) => (
        <div key={r} className={s.riga} data-riga-nastro>
          <div className={s.scorre} data-scorre>
            {/* Due copie una dietro l'altra: a metà corsa il nastro ricomincia senza salto. */}
            {[0, 1].map(copia => (
              <ul key={copia} className={s.copia} aria-hidden={copia === 1 || undefined}>
                {riga.map(f => {
                  const sh = nextShow(f, now);
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        className={s.voce}
                        tabIndex={copia === 1 ? -1 : undefined}
                        onPointerEnter={e => { if (e.pointerType === 'mouse') guarda(f); }}
                        onFocus={() => setSopra(null)}
                        onClick={() => book(sh, f)}
                        aria-label={`${f.title}${f.director ? `, di ${f.director}` : ''}: ${dayShort(sh.date)} alle ${time(sh.date)}, prenota`}
                      >
                        <span className={`${base.titoli} ${s.titolo}`}>{f.title}</span>
                        {f.release_year && <span className={`${base.dati} ${s.anno}`}>{f.release_year}</span>}
                      </button>
                      <span className={s.punto} aria-hidden>✳</span>
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        </div>
      ))}

      <div ref={poster} className={`${s.poster} ${sopra ? s.posterVisto : ''}`} aria-hidden>
        {films.filter(f => visti.includes(f.id)).map(f => (
          <div key={f.id} className={s.posterImg} data-visto={sopra?.id === f.id || undefined}>
            <Image src={img(f.poster_path, 'w342')} alt="" fill sizes="220px" style={{ objectFit: 'cover' }} />
          </div>
        ))}
        {sopra && (
          <span className={`${base.dati} ${s.posterQuando}`}>{dayShort(nextShow(sopra, now).date)} · {time(nextShow(sopra, now).date)}</span>
        )}
      </div>
    </section>
  );
}
