'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { backdropsOf, Slot } from './regia';
import { Film, Show, Coda, FilmLogo, PrenotaButton, Testata, dayLong, dayShort, gsap, img, lingua, nextShow, prefersMotion, runtime, sala, time, registraGsap, useBook, useInView, useRegia, Vicina } from './shared';
import base from './Home.module.css';
import s from './Pezzi.module.css';

/** L'indirizzo di un'immagine TMDB servita da Next: stessa origine, quindi leggibile pixel per pixel. */
const nextImg = (path: string, w: number) => `/_next/image?url=${encodeURIComponent(img(path, 'w780'))}&w=${w}&q=75`;

// ─── Pellicola che scorre ─────────────────────────────────────────────────

/**
 * Tre film nello stesso quadro, una striscia ciascuno: scendendo, i
 * fotogrammi passano di lato, una striscia verso sinistra e la successiva
 * verso destra. Accanto, il logo e il prossimo spettacolo.
 */
export function Pellicola({ films, now }: { films: Film[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  useRegia(root, phone => {
    const strisce = gsap.utils.toArray<HTMLElement>('[data-striscia]');
    const corsa = (el: HTMLElement) => Math.max(0, el.scrollWidth - (el.parentElement?.clientWidth || window.innerWidth));
    const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * (phone ? 1 : 1.2)), scrub: 0.7, pin: true, invalidateOnRefresh: true } });
    strisce.forEach((el, i) => {
      if (i % 2) tl.fromTo(el, { x: () => -corsa(el) }, { x: 0, ease: 'none' }, 0);
      else tl.fromTo(el, { x: 0 }, { x: () => -corsa(el), ease: 'none' }, 0);
    });
  });
  return (
    <section ref={root} className={s.pellicola} aria-label={`Fotogrammi di ${films.map(f => f.title).join(', ')}`}>
      <span className={`${base.dati} ${s.pellicolaEtichetta}`}>In pellicola · {films.length} film</span>
      {films.map((f, i) => <Striscia key={f.id} film={f} now={now} indice={i} />)}
    </section>
  );
}

function Striscia({ film, now, indice }: { film: Film; now: Date; indice: number }) {
  const frames = backdropsOf(film).slice(0, 7);
  const base0 = 10 + ((film.id * 7 + indice * 13) % 30);
  const sh = nextShow(film, now);
  return (
    <div className={s.filaPellicola}>
      <div className={s.filaTesta}>
        <FilmLogo film={film} className={s.filaLogo} sizes="220px" />
        <span className={`${base.dati} ${s.filaQuando}`}>{dayShort(sh.date).split(' ').slice(0, 2).join(' ')} · {time(sh.date)}</span>
        <PrenotaButton show={sh} film={film} className={s.filaPrenota} />
      </div>
      <div className={s.filaFinestra}>
        <div className={s.striscia} data-striscia>
          {frames.map((p, i) => (
            <div key={p} className={s.fotogramma}>
              <span className={`${base.dati} ${s.codice}`}>{base0 + i}{i % 2 ? 'A' : ''} ▸ KODAK 5219</span>
              <Vicina><Image src={img(p, 'w780')} alt="" fill sizes="(max-width: 768px) 52vw, 26vw" style={{ objectFit: 'cover' }} /></Vicina>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── La giornata in sala ──────────────────────────────────────────────────

const TONI = ['#e8a33d', '#efe6d8', '#c97b4a', '#9fb3a8', '#d8b6a4', '#b8a37a', '#8fa1c4'];

/** Quadrante di 24 ore: ogni spettacolo è un arco lungo quanto il film; la lancetta segna adesso. */
export function Giornata({ dayKey, slots, now }: { dayKey: string; slots: Slot<Film>[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const lancetta = useRef<SVGLineElement>(null);
  const [scelto, setScelto] = useState(0);
  const C = 300, RAG = 230;
  const minuti = (d: string) => { const [h, m] = time(d).split(':').map(Number); return h * 60 + m; };
  // Arrotondate: server e browser non danno gli stessi decimali, e l'idratazione se ne accorgerebbe.
  const pt = (m: number, r: number) => { const a = (m / 1440) * Math.PI * 2 - Math.PI / 2; return [Math.round((C + r * Math.cos(a)) * 100) / 100, Math.round((C + r * Math.sin(a)) * 100) / 100]; };
  const arco = (a: number, b: number, r: number) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); return `M${x1},${y1} A${r},${r} 0 ${b - a > 720 ? 1 : 0} 1 ${x2},${y2}`; };

  // L'ora vera si legge solo nel browser: sul server la lancetta resta ferma a mezzanotte.
  useEffect(() => {
    const el = lancetta.current; if (!el) return;
    registraGsap();
    const ora = new Date(), adesso = Number(time(ora.toISOString()).split(':')[0]) * 60 + Number(time(ora.toISOString()).split(':')[1]);
    const gradi = (adesso / 1440) * 360;
    if (prefersMotion()) gsap.fromTo(el, { rotation: 0 }, { rotation: gradi, svgOrigin: `${C} ${C}`, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: root.current, start: 'top 70%' } });
    else el.setAttribute('transform', `rotate(${gradi} ${C} ${C})`);
  }, []);
  useRegia(root, () => {
    root.current!.querySelectorAll<SVGPathElement>('[data-arco]').forEach(p => { const l = p.getTotalLength(); p.style.strokeDasharray = String(l); p.style.strokeDashoffset = String(l); });
    gsap.to('[data-arco]', { strokeDashoffset: 0, duration: 1.4, stagger: 0.15, ease: 'power2.inOut', scrollTrigger: { trigger: root.current, start: 'top 70%' } });
  });

  const sl = slots[scelto], fine = minuti(sl.show.date) + (sl.movie.runtime || 0);
  const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return (
    <section ref={root} className={s.giornata} aria-labelledby="giornata-titolo">
      <Testata id="giornata-titolo" occhiello={dayLong(slots[0].show.date)} destra={<span className={base.dati}>{slots.length} spettacoli</span>}>La giornata in sala</Testata>
      <div className={s.giornataCorpo}>
        <svg viewBox="0 0 600 600" className={s.quadrante} role="img" aria-label={`Gli spettacoli di ${dayLong(slots[0].show.date)} su un quadrante di 24 ore`}>
          <circle cx={C} cy={C} r={RAG} fill="none" stroke="rgba(239,230,216,.08)" strokeWidth={26} />
          {Array.from({ length: 24 }, (_, h) => { const [x1, y1] = pt(h * 60, RAG + 20), [x2, y2] = pt(h * 60, RAG + (h % 6 ? 26 : 32)); return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(239,230,216,.35)" />; })}
          {[0, 6, 12, 18].map(h => { const [x, y] = pt(h * 60, RAG + 50); return <text key={h} x={x} y={y} className={s.oraQuadrante} textAnchor="middle" dominantBaseline="middle">{String(h).padStart(2, '0')}</text>; })}
          {slots.map((x, i) => (
            <path key={x.show.id} data-arco d={arco(minuti(x.show.date), minuti(x.show.date) + (x.movie.runtime || 100), RAG)} stroke={TONI[i % TONI.length]}
              className={`${s.arco} ${i === scelto ? s.arcoScelto : ''}`} onPointerEnter={() => setScelto(i)} onClick={() => setScelto(i)} />
          ))}
          <line ref={lancetta} x1={C} y1={C} x2={C} y2={C - RAG + 40} stroke="#e8a33d" strokeWidth={2} />
          <circle cx={C} cy={C} r={5} fill="#e8a33d" />
        </svg>
        <div className={s.scheda} aria-live="polite">
          <div className={s.sceglitori}>
            {slots.map((x, i) => <button key={x.show.id} className={`${base.dati} ${i === scelto ? s.attivo : ''}`} onClick={() => setScelto(i)} aria-pressed={i === scelto}>{time(x.show.date)}</button>)}
          </div>
          <FilmLogo film={sl.movie} className={s.schedaLogo} />
          <div className={`${base.titoli} ${s.inizioFine}`}>{time(sl.show.date)} → {hhmm(fine)}</div>
          <span className={`${base.dati} ${s.schedaDati}`}>{[sl.movie.director, runtime(sl.movie.runtime), lingua(sl.show), sala(sl.show)].filter(Boolean).join(' · ')}</span>
          <PrenotaButton show={sl.show} film={sl.movie} />
        </div>
      </div>
    </section>
  );
}

// ─── Locandina → fotogramma ───────────────────────────────────────────────

export function Locandina({ film, now }: { film: Film; now: Date }) {
  const root = useRef<HTMLElement>(null);
  useRegia(root, () => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top top', end: '+=60%', scrub: 0.6, pin: true } });
    tl.to('[data-cornice]', { height: () => Math.min(window.innerWidth / 2.39, window.innerHeight * 0.62), width: '100vw', ease: 'power2.inOut', duration: 1 })
      .to('[data-poster]', { opacity: 0, duration: 0.5 }, 0.35)
      .to('[data-fondale]', { opacity: 1, duration: 0.5 }, 0.35)
      .fromTo('[data-coda]', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, 0.8);
  });
  return (
    <section ref={root} className={s.locandina} aria-label={film.title}>
      <div className={s.cornice} data-cornice>
        <div className={s.strato} data-poster><Vicina><Image src={img(film.poster_path, 'w780')} alt={`Locandina di ${film.title}`} fill sizes="(max-width: 768px) 70vw, 40vw" style={{ objectFit: 'cover' }} /></Vicina></div>
        <div className={`${s.strato} ${s.fondale}`} data-fondale><Vicina><Image src={img(film.backdrop_path, 'w1280')} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} /></Vicina></div>
      </div>
      <Coda film={film} show={nextShow(film, now)} className={s.codaSotto} />
    </section>
  );
}

// ─── Il film in una striscia di colore ────────────────────────────────────

/** I fondali letti colonna per colonna: ogni colonna diventa una riga del suo colore medio. */
export function Barre({ film, now }: { film: Film; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [vicino, setVicino] = useState(false);
  const [strisce, setStrisce] = useState<{ c: string; p: string }[]>([]);
  // L'animazione nasce al primo render: legge le strisce da qui, non dalla chiusura.
  const strisceRef = useRef<{ c: string; p: string }[]>([]);
  strisceRef.current = strisce;
  const [anteprima, setAnteprima] = useState<{ p: string; x: number } | null>(null);
  const progresso = useRef(prefersMotion() ? 0 : 1);
  const frames = useMemo(() => backdropsOf(film).slice(0, 7), [film]);

  useEffect(() => {
    const el = root.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVicino(true); io.disconnect(); } }, { rootMargin: '600px' });
    io.observe(el); return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!vicino) return;
    let vivo = true;
    const COL = 70, H = 40;
    Promise.all(frames.map(p => new Promise<{ c: string; p: string }[]>(ok => {
      const im = new window.Image();
      im.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = COL; c.height = H;
          const x = c.getContext('2d')!; x.drawImage(im, 0, 0, COL, H);
          const d = x.getImageData(0, 0, COL, H).data, out: { c: string; p: string }[] = [];
          for (let col = 0; col < COL; col++) { let r = 0, g = 0, b = 0; for (let y = 0; y < H; y++) { const k = (y * COL + col) * 4; r += d[k]; g += d[k + 1]; b += d[k + 2]; } out.push({ c: `rgb(${(r / H) | 0},${(g / H) | 0},${(b / H) | 0})`, p }); }
          ok(out);
        } catch { ok([]); }
      };
      im.onerror = () => ok([]);
      im.src = nextImg(p, 384);
    }))).then(r => { if (vivo) setStrisce(r.flat()); });
    return () => { vivo = false; };
  }, [vicino, frames]);

  const disegna = () => {
    const cv = tela.current, righe = strisceRef.current; if (!cv || !righe.length) return;
    cv.width = cv.clientWidth * devicePixelRatio; cv.height = cv.clientHeight * devicePixelRatio;
    const ctx = cv.getContext('2d')!, w = cv.width / righe.length, n = Math.round(righe.length * progresso.current);
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < n; i++) { ctx.fillStyle = righe[i].c; ctx.fillRect(Math.floor(i * w), 0, Math.ceil(w) + 1, cv.height); }
  };
  useEffect(() => { disegna(); const r = () => disegna(); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); });
  useRegia(root, () => {
    const st = { p: 0 };
    gsap.to(st, { p: 1, ease: 'none', onUpdate: () => { progresso.current = st.p; disegna(); }, scrollTrigger: { trigger: root.current, start: 'top top', end: '+=60%', scrub: 0.4, pin: true } });
  });

  return (
    <section ref={root} className={s.barre} aria-label={`I colori di ${film.title}`}>
      <span className={`${base.dati} ${s.conta}`}>{frames.length} fotogrammi · {frames.length * 70} colori</span>
      <div className={s.barreTela}
        onPointerMove={e => { if (!strisce.length) return; const b = e.currentTarget.getBoundingClientRect(); const i = Math.floor(((e.clientX - b.left) / b.width) * strisce.length); const st = strisce[i]; if (st) setAnteprima({ p: st.p, x: e.clientX - b.left }); }}
        onPointerLeave={() => setAnteprima(null)}>
        <canvas ref={tela} aria-hidden />
        {anteprima && (
          <div className={s.anteprima} style={{ left: `clamp(0px, ${anteprima.x}px - 140px, calc(100% - 280px))` }}>
            <Image src={img(anteprima.p, 'w780')} alt="" fill sizes="280px" style={{ objectFit: 'cover' }} />
          </div>
        )}
      </div>
      <Coda film={film} show={nextShow(film, now)} className={s.codaSotto} />
    </section>
  );
}

// ─── Iride ────────────────────────────────────────────────────────────────

export function Iride({ film, now }: { film: Film; now: Date }) {
  const root = useRef<HTMLElement>(null);
  useRegia(root, () => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top top', end: '+=60%', scrub: 0.5, pin: true } });
    tl.fromTo('[data-iride]', { clipPath: 'circle(0% at 50% 45%)' }, { clipPath: 'circle(80% at 50% 45%)', ease: 'power2.inOut', duration: 1 })
      .fromTo('[data-coda]', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, 0.75);
  });
  return (
    <section ref={root} className={s.palcoPieno} aria-label={film.title}>
      <div className={s.pieno} data-iride><Vicina><Image src={img(film.backdrop_path, 'w1280')} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} /></Vicina></div>
      <Coda film={film} show={nextShow(film, now)} className={s.codaSopra} />
    </section>
  );
}

// ─── Trailer muto ─────────────────────────────────────────────────────────

/** Quando arrivi, il trailer parte da solo, senza audio, tagliato in formato cinema. */
export function TrailerMuto({ film, trailerKey, now }: { film: Film; trailerKey: string; now: Date }) {
  const [ref, visto] = useInView<HTMLDivElement>('0px');
  const [mostra, setMostra] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  // Il fondale resta finché YouTube non dice che il video sta davvero andando
  // (playerState 1): se l'autoplay è bloccato si vede il fotogramma, non il nero.
  useEffect(() => {
    if (!visto) return;
    const ascolta = (e: MessageEvent) => {
      if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
      try { const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; if (d?.info?.playerState === 1) setMostra(true); } catch { /* messaggi d'altro tipo */ }
    };
    window.addEventListener('message', ascolta);
    return () => window.removeEventListener('message', ascolta);
  }, [visto]);
  const presentati = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: trailerKey }), '*');
  return (
    <section className={s.trailer} aria-label={`Trailer di ${film.title}, senza audio`}>
      <div ref={ref} className={s.trailerQuadro}>
        {visto && (
          <iframe
            ref={frame}
            onLoad={presentati}
            src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&playsinline=1&modestbranding=1&rel=0&start=8&enablejsapi=1`}
            allow="autoplay; encrypted-media"
            title={`Trailer di ${film.title}`}
            tabIndex={-1}
          />
        )}
        <div className={s.trailerAttesa} style={{ opacity: mostra ? 0 : 1 }}><Vicina><Image src={img(film.backdrop_path, 'w1280')} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} /></Vicina></div>
      </div>
      <Coda film={film} show={nextShow(film, now)} className={s.codaSotto} />
    </section>
  );
}

// ─── Doppio programma ─────────────────────────────────────────────────────

export function Doppio({ a, b }: { a: Slot<Film>; b: Slot<Film> }) {
  const root = useRef<HTMLElement>(null);
  useRegia(root, () => {
    const el = root.current!, sx = el.querySelector<HTMLElement>('[data-lato="s"]')!, dx = el.querySelector<HTMLElement>('[data-lato="d"]')!, linea = el.querySelector<HTMLElement>('[data-linea]')!;
    const p = { v: 50 }, set = () => { sx.style.width = p.v + '%'; dx.style.width = 100 - p.v + '%'; linea.style.left = p.v + '%'; };
    gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: '+=70%', scrub: 0.6, pin: true } })
      .to(p, { v: 78, onUpdate: set, duration: 1, ease: 'power1.inOut' })
      .to(p, { v: 22, onUpdate: set, duration: 1.4, ease: 'power1.inOut' })
      .to(p, { v: 50, onUpdate: set, duration: 0.8 });
  });
  const lato = (x: Slot<Film>, k: 's' | 'd') => (
    <div className={`${s.lato} ${k === 's' ? s.latoS : s.latoD}`} data-lato={k}>
      <div className={s.latoImg}><Vicina><Image src={img(x.movie.backdrop_path, 'w1280')} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} /></Vicina></div>
      <div className={s.etichetta}>
        <FilmLogo film={x.movie} className={s.latoLogo} />
        <div className={`${base.titoli} ${s.latoOra}`}>{time(x.show.date)}</div>
        <PrenotaButton show={x.show} film={x.movie} />
      </div>
    </div>
  );
  return (
    <section ref={root} className={s.doppio} aria-label={`Doppio programma: ${a.movie.title} e ${b.movie.title}`}>
      {lato(a, 's')}{lato(b, 'd')}
      <div className={s.linea} data-linea />
      <span className={`${base.dati} ${s.doppioGiorno}`}>Doppio programma · {dayLong(a.show.date)}</span>
    </section>
  );
}

// ─── Ventaglio di locandine ───────────────────────────────────────────────

export function Ventaglio({ films, now }: { films: Film[]; now: Date }) {
  const root = useRef<HTMLElement>(null);
  const book = useBook();
  useRegia(root, phone => {
    const carte = gsap.utils.toArray<HTMLElement>('[data-carta]'), n = carte.length, ampio = phone ? 9 : 13;
    gsap.set(carte, { rotation: i => (i - (n - 1) / 2) * 1.2 });
    gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top top', end: '+=55%', scrub: 0.6, pin: true } })
      .to(carte, { rotation: i => (i - (n - 1) / 2) * ampio, ease: 'power2.out', duration: 1 })
      .to('[data-carta-quando]', { opacity: 1, duration: 0.3 }, 0.7);
  });
  return (
    <section ref={root} className={s.ventaglio} aria-labelledby="ventaglio-titolo">
      <h2 id="ventaglio-titolo" className={`${base.titoli} ${s.ventaglioTitolo}`} data-split>Più avanti</h2>
      <div className={s.mazzo}>
        {films.map((f, i) => {
          const sh = nextShow(f, now), n = films.length;
          return (
            <button key={f.id} className={s.carta} data-carta style={{ transform: `rotate(${(i - (n - 1) / 2) * 11}deg)` }} onClick={() => book(sh, f)} aria-label={`${f.title}, ${dayLong(sh.date)} alle ${time(sh.date)}: prenota`}>
              <Vicina><Image src={img(f.poster_path, 'w342')} alt="" fill sizes="240px" style={{ objectFit: 'cover' }} /></Vicina>
              <span className={`${base.dati} ${s.cartaQuando}`} data-carta-quando>{dayLong(sh.date).split(' ').slice(0, 2).join(' ')} · {time(sh.date)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ─── Sinossi in sottotitoli ───────────────────────────────────────────────

/** Spezza la sinossi in battute da sottotitolo: al massimo due righe da circa 37 caratteri. */
export function battute(testo: string, max = 74): string[][] {
  const righe: string[] = []; let cur = '';
  for (const w of testo.split(/\s+/).filter(Boolean)) {
    if ((cur + ' ' + w).trim().length > max) { righe.push(cur.trim()); cur = w; } else cur += ' ' + w;
  }
  if (cur.trim()) righe.push(cur.trim());
  return righe.map(r => {
    if (r.length <= 38) return [r];
    const m = r.lastIndexOf(' ', Math.ceil(r.length / 2) + 4);
    return m > 0 ? [r.slice(0, m), r.slice(m + 1)] : [r];
  });
}

export function Sottotitoli({ film, show }: { film: Film; show: Show }) {
  const root = useRef<HTMLElement>(null);
  const subs = useMemo(() => battute(film.overview || '').slice(0, 7), [film.overview]);
  // Sul server e senza movimento si vede la prima battuta; con il movimento si parte dal vuoto.
  const [k, setK] = useState(0);
  useEffect(() => { if (prefersMotion()) setK(-1); }, []);
  useRegia(root, () => {
    const st = { i: -1 };
    gsap.to(st, { i: subs.length - 0.01, ease: 'none', onUpdate: () => setK(Math.floor(st.i)), scrollTrigger: { trigger: root.current, start: 'top top', end: '+=' + subs.length * 12 + '%', scrub: true, pin: true } });
  }, [subs.length]);
  const fondale = backdropsOf(film)[2] || film.backdrop_path;
  return (
    <section ref={root} className={s.sottotitoli} aria-label={`La trama di ${film.title}`}>
      <span className={`${base.dati} ${s.vo}`}>Versione originale{show.language ? ` · ${show.language}` : ''}{show.subtitles ? ` · sottotitoli ${show.subtitles.toLowerCase()}` : ''}</span>
      <div className={s.subQuadro}><Vicina><Image src={img(fondale, 'w1280')} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} /></Vicina></div>
      <p className={s.sub} aria-hidden>{k >= 0 && subs[k] ? subs[k].map((r, i) => <span key={i}>{r}<br /></span>) : null}</p>
      <p className={s.soloLettori}>{film.overview}</p>
      <Coda film={film} show={show} className={s.codaSotto} />
    </section>
  );
}
