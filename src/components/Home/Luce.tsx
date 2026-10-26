'use client';

import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { img } from './shared';
import { NEUTRA, stanzaDa, tintaDa, type Stanza, type Tinta } from './tinta';
import s from './Luce.module.css';

/**
 * La luce del film, la firma della home: la pagina è una sala buia e la colora
 * il film che hai davanti. Qui si misura il colore di ogni film (sui pixel di
 * una miniatura del suo fondale, servita da Next: stessa origine, quindi
 * leggibile), si decide quale film è in vista e si accende la stanza: fondo,
 * accento, Prenota, cassetto della prenotazione, barra del browser e la luce
 * d'ambiente dietro tutta la pagina.
 *
 * Chi vuole colorare la stanza mette `data-luce` su un elemento:
 * - `data-luce="<id del film>"`: il film, quando l'elemento copre il centro dello schermo;
 * - `data-luce="buio"`: luci spente, prima del trailer (con `data-luce-film` la barra
 *   propone intanto il film che sta per arrivare);
 * - `data-luce="tutti"`: la luce di tutti i film insieme, in fondo.
 * Dentro un atto fissato, `data-luce-da` e `data-luce-a` dicono in quale tratto
 * dell'atto vale (il progresso `--sc-p` che pubblica il motore scroll-craft).
 */

type Scena = string | null;

interface LuceCtx {
  stanze: Record<number, Stanza>;
  /** La luce d'ambiente di ogni film, già sfocata (un'immagine piccola, in data URL). */
  luci: Record<number, string>;
  scena: Scena;
  /** L'ultimo film che ha colorato la stanza: resta anche a luci spente. */
  filmVisto: number | null;
}

const LuceContext = createContext<LuceCtx>({ stanze: {}, luci: {}, scena: null, filmVisto: null });
export const useLuce = () => useContext(LuceContext);

/** Le variabili CSS di una stanza, per colorare un elemento col suo film. */
export function varDi(st?: Stanza): CSSProperties | undefined {
  if (!st) return undefined;
  return {
    '--f-fondo': st.fondo,
    '--f-bagliore': st.bagliore,
    '--f-accento': st.accento,
    '--f-accento-ink': st.accentoInk,
    '--f-tenue': st.inchiostroTenue,
  } as CSSProperties;
}

/** La miniatura che si misura e che, sfocata, fa da luce d'ambiente. */
const miniatura = (path: string) => `/_next/image?url=${encodeURIComponent(img(path, 'w300'))}&w=64&q=75`;

/**
 * La luce d'ambiente di un film, sfocata una volta sola qui. Il 26 ottobre
 * 2026 era un `filter: blur()` in CSS su uno strato a tutto schermo: Chrome lo
 * calcola una volta, Firefox lo rifaceva a ogni passo di scorrimento e la
 * pagina andava a scatti (misurato: da 49 a 17 ms per fotogramma senza).
 * Rimpicciolita a 16×9 e riallargata, l'immagine è già morbida; dove la tela
 * sa sfocare (`ctx.filter`) lo diventa del tutto.
 */
function sfoca(el: HTMLImageElement): string {
  try {
    const piccola = document.createElement('canvas'); piccola.width = 16; piccola.height = 9;
    piccola.getContext('2d')?.drawImage(el, 0, 0, 16, 9);
    const c = document.createElement('canvas'); c.width = 128; c.height = 72;
    const x = c.getContext('2d');
    if (!x) return '';
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    if ('filter' in x) x.filter = 'blur(5px) saturate(1.35)';
    // Più grande della tela: la sfocatura ai bordi non pesca nel vuoto.
    x.drawImage(piccola, -16, -9, 160, 90);
    return c.toDataURL('image/jpeg', 0.82);
  } catch { return ''; }
}

function misura(el: HTMLImageElement): Tinta {
  try {
    const w = 48, h = Math.max(8, Math.round((48 * el.naturalHeight) / el.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return NEUTRA;
    x.drawImage(el, 0, 0, w, h);
    return tintaDa(x.getImageData(0, 0, w, h).data);
  } catch { return NEUTRA; }
}

interface FilmLuce { id: number; backdrop_path?: string | null; poster_path?: string | null }

const BUIO = '#070708';

export function LuceProvider({ films, root, children }: { films: FilmLuce[]; root: RefObject<HTMLElement | null>; children: React.ReactNode }) {
  const [tinte, setTinte] = useState<Record<number, Tinta>>({});
  const [luci, setLuci] = useState<Record<number, string>>({});
  const [scena, setScena] = useState<Scena>(null);
  const [filmVisto, setFilmVisto] = useState<number | null>(null);
  const chiave = films.map(f => `${f.id}:${f.backdrop_path || f.poster_path || ''}`).join('|');

  // Si misurano tutti i film subito: sono miniature da 64 pixel.
  useEffect(() => {
    let vivo = true;
    for (const f of films) {
      const path = f.backdrop_path || f.poster_path;
      if (!path) continue;
      const im = new window.Image();
      im.decoding = 'async';
      im.onload = () => {
        if (!vivo) return;
        const t = misura(im), luce = sfoca(im);
        setTinte(p => ({ ...p, [f.id]: t }));
        if (luce) setLuci(p => ({ ...p, [f.id]: luce }));
      };
      im.src = miniatura(path);
    }
    return () => { vivo = false; };
  }, [chiave]); // eslint-disable-line react-hooks/exhaustive-deps

  const stanze = useMemo(() => Object.fromEntries(Object.entries(tinte).map(([id, t]) => [id, stanzaDa(t)])) as Record<number, Stanza>, [tinte]);

  // Quale film è in vista: quello il cui elemento copre il centro dello schermo.
  useEffect(() => {
    let timer = 0;
    const leggi = () => {
      timer = 0;
      const el = root.current;
      if (!el) return;
      const cx = innerWidth / 2, cy = innerHeight / 2;
      let trovata: Scena = null;
      let film: string | null = null;
      el.querySelectorAll<HTMLElement>('[data-luce]').forEach(n => {
        const da = n.getAttribute('data-luce-da');
        if (da !== null) {
          const atto = n.closest<HTMLElement>('[data-sc-act]');
          if (!atto) return;
          const r = atto.getBoundingClientRect();
          if (r.top > cy || r.bottom < cy) return;
          // Lo stesso progresso del motore (`--sc-p` di un atto fissato), calcolato qui:
          // il motore lo scrive nel suo fotogramma, che può arrivare dopo questo.
          const p = Math.min(1, Math.max(0, -r.top / Math.max(r.height - innerHeight, 1)));
          if (p >= parseFloat(da) && p < parseFloat(n.getAttribute('data-luce-a') || '1.01')) { trovata = n.getAttribute('data-luce'); film = n.getAttribute('data-luce-film') || trovata; }
          return;
        }
        const r = n.getBoundingClientRect();
        if (r.top <= cy && r.bottom >= cy && r.left <= cx && r.right >= cx) { trovata = n.getAttribute('data-luce'); film = n.getAttribute('data-luce-film') || trovata; }
      });
      if (trovata === null) return;
      setScena(trovata);
      if (film && /^\d+$/.test(film)) setFilmVisto(Number(film));
    };
    // Una lettura ogni decimo di secondo, non a ogni fotogramma: per cambiare
    // colore basta, e in Firefox (dove lo scorrimento va per conto suo e il
    // JavaScript insegue) ogni fotogramma lasciato libero è uno scatto in meno.
    // Il ritardo serve anche al motore: le locandine di lato le sposta lui, e
    // leggerle prima del suo fotogramma vorrebbe dire trovarle dov'erano.
    const chiedi = () => { if (!timer) timer = window.setTimeout(leggi, 100); };
    addEventListener('scroll', chiedi, { passive: true });
    addEventListener('resize', chiedi, { passive: true });
    chiedi();
    // Il motore fissa l'altezza degli atti appena montato: si rilegge dopo.
    const t = setTimeout(chiedi, 600);
    return () => { removeEventListener('scroll', chiedi); removeEventListener('resize', chiedi); clearTimeout(timer); clearTimeout(t); };
  }, [root]);

  // La stanza va sull'elemento radice: la vedono anche il cassetto della prenotazione e il piede.
  const stanza = scena && /^\d+$/.test(scena) ? stanze[Number(scena)] : undefined;
  const pronta = !!stanza || scena === 'buio' || scena === 'tutti';
  useEffect(() => {
    if (!pronta) return;
    const html = document.documentElement;
    const st = stanza ?? stanzaDa(NEUTRA);
    const fondo = scena === 'buio' ? BUIO : st.fondo;
    html.style.setProperty('--f-fondo', fondo);
    html.style.setProperty('--f-bagliore', st.bagliore);
    html.style.setProperty('--f-accento', st.accento);
    html.style.setProperty('--f-accento-ink', st.accentoInk);
    html.style.setProperty('--f-tenue', st.inchiostroTenue);
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = fondo;
  }, [pronta, stanza, scena]);

  // Uscendo dalla home la stanza torna neutra.
  useEffect(() => () => {
    const html = document.documentElement;
    for (const v of ['--f-fondo', '--f-bagliore', '--f-accento', '--f-accento-ink', '--f-tenue']) html.style.removeProperty(v);
    document.querySelector('meta[name="theme-color"]')?.remove();
  }, []);

  return <LuceContext.Provider value={{ stanze, luci, scena, filmVisto }}>{children}</LuceContext.Provider>;
}

/**
 * La luce d'ambiente: la miniatura del film in vista, sfocata e allargata
 * dietro tutta la pagina. Quando cambia film, la nuova sfuma sopra la vecchia.
 * A luci spente sparisce; in fondo diventa la luce di tutti i film.
 */
export function Ambiente({ films }: { films: FilmLuce[] }) {
  const { scena, stanze, luci } = useLuce();
  const [strati, setStrati] = useState<{ id: number; src: string }[]>([]);

  // Cambia film: lo strato nuovo si aggiunge sopra (durante il render, non in un
  // effetto: è stato che dipende da un altro stato, e così non c'è un giro in più).
  const id = scena && /^\d+$/.test(scena) ? Number(scena) : null;
  const sopra = strati[strati.length - 1]?.id ?? null;
  if (id !== null && id !== sopra && luci[id]) {
    setStrati([...strati.filter(x => x.id !== id), { id, src: luci[id] }].slice(-2));
  }

  // La luce di tutti i film: una macchia del colore di ciascuno, sparse per la stanza.
  const tutti = useMemo(() => {
    const glows = films.map(f => stanze[f.id]?.bagliore).filter(Boolean) as string[];
    if (!glows.length) return undefined;
    return glows.map((c, i) => {
      const x = (i * 37 + 11) % 100, y = (i * 53 + 23) % 100;
      return `radial-gradient(38% 42% at ${x}% ${y}%, ${c}, transparent 72%)`;
    }).join(', ');
  }, [films, stanze]);

  return (
    <div className={s.ambiente} data-scena={scena === 'buio' ? 'buio' : scena === 'tutti' ? 'tutti' : 'film'} aria-hidden>
      {strati.map(x => <div key={x.id} className={s.strato} style={{ backgroundImage: `url(${x.src})` }} />)}
      <div className={s.tutti} style={{ backgroundImage: tutti }} />
      <div className={s.vignetta} />
    </div>
  );
}
