'use client';

import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { progresso } from './motore';
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
 * - `data-luce="buio"`: luci spente, prima del trailer;
 * - `data-luce="tutti"`: la luce di tutti i film insieme, in fondo.
 * Dentro un atto fissato, `data-luce-da` e `data-luce-a` dicono in quale tratto
 * dell'atto vale (il progresso `--sc-p` che pubblica il motore scroll-craft).
 */

type Scena = string | null;

interface StanzeCtx {
  stanze: Record<number, Stanza>;
  /** La luce d'ambiente di ogni film, già sfocata (un'immagine piccola, in data URL). */
  luci: Record<number, string>;
}
interface ScenaCtx {
  scena: Scena;
}

// Due contesti e non uno: il film in vista cambia di continuo mentre si scorre,
// i colori dei film no. Chi legge solo i colori (le locandine, il programma
// intero) così non si ridisegna a ogni cambio di film.
const StanzeContext = createContext<StanzeCtx>({ stanze: {}, luci: {} });
const ScenaContext = createContext<ScenaCtx>({ scena: null });
export const useStanze = () => useContext(StanzeContext);
export const useScena = () => useContext(ScenaContext);

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
  const chiave = films.map(f => `${f.id}:${f.backdrop_path || f.poster_path || ''}`).join('|');

  // Si misurano tutti i film subito: sono miniature da 64 pixel. I risultati
  // arrivano insieme, a gruppi: uno per film voleva dire quaranta giri di React
  // proprio mentre l'apertura entra.
  useEffect(() => {
    let vivo = true;
    let t: Record<number, Tinta> = {}, l: Record<number, string> = {};
    let timer = 0;
    const consegna = () => {
      timer = 0;
      if (!vivo) return;
      const nt = t, nl = l;
      t = {}; l = {};
      setTinte(p => ({ ...p, ...nt }));
      setLuci(p => ({ ...p, ...nl }));
    };
    for (const f of films) {
      const path = f.backdrop_path || f.poster_path;
      if (!path) continue;
      const im = new window.Image();
      im.decoding = 'async';
      im.onload = () => {
        if (!vivo) return;
        t[f.id] = misura(im);
        const luce = sfoca(im);
        if (luce) l[f.id] = luce;
        if (!timer) timer = window.setTimeout(consegna, 250);
      };
      im.src = miniatura(path);
    }
    return () => { vivo = false; clearTimeout(timer); };
  }, [chiave]); // eslint-disable-line react-hooks/exhaustive-deps

  const stanze = useMemo(() => Object.fromEntries(Object.entries(tinte).map(([id, t]) => [id, stanzaDa(t)])) as Record<number, Stanza>, [tinte]);

  // Quale film è in vista: quello che attraversa la linea a metà schermo. Lo dice
  // un IntersectionObserver, che il browser calcola quando ha già disposto la
  // pagina: niente misure a metà scorrimento, che su Firefox costringevano a
  // ricalcolare stili e disposizione dieci volte al secondo.
  useEffect(() => {
    const el = root.current;
    if (!el || !('IntersectionObserver' in window)) return;
    /** Ciò che attraversa la linea di mezzo, col suo rettangolo. */
    const linea = new Map<HTMLElement, { left: number; right: number }>();
    let timer = 0;
    const leggi = () => {
      timer = 0;
      const cx = innerWidth / 2;
      // Le locandine di lato si muovono senza uscire dalla linea: per loro il rettangolo si rilegge.
      for (const n of linea.keys()) if (n.closest('[data-sc-pan]')) linea.set(n, n.getBoundingClientRect());
      let trovata: Scena = null, distanza = Infinity;
      el.querySelectorAll<HTMLElement>('[data-luce]').forEach(n => {
        let d = 0;
        const da = n.getAttribute('data-luce-da');
        if (da !== null) {
          // Dentro un atto fissato vale in un tratto del suo progresso (`--sc-p`).
          const atto = n.closest<HTMLElement>('[data-sc-act]');
          if (!atto || !linea.has(atto)) return;
          const p = progresso(atto);
          if (p < parseFloat(da) || p >= parseFloat(n.getAttribute('data-luce-a') || '1.01')) return;
        } else {
          const r = linea.get(n);
          if (!r) return;
          d = r.left <= cx && r.right >= cx ? 0 : Math.min(Math.abs(r.left - cx), Math.abs(r.right - cx));
        }
        // In ordine di pagina vince l'ultimo (un pezzo dentro un atto batte l'atto);
        // fra quelli affiancati, il più vicino al centro.
        if (d > distanza) return;
        distanza = d;
        trovata = n.getAttribute('data-luce');
      });
      if (trovata === null) return;
      setScena(trovata);
    };
    const chiedi = () => {
      // Nel modo leggero (leggero.ts) la stanza cambia quando ci si ferma: col
      // processore ogni cambio di colori e di luce, a metà scorrimento, è un fotogramma lungo.
      if (el.hasAttribute('data-leggero')) { clearTimeout(timer); timer = window.setTimeout(leggi, 180); return; }
      if (!timer) timer = window.setTimeout(leggi, 100);
    };
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const n = e.target as HTMLElement;
        if (e.isIntersecting) linea.set(n, { left: e.boundingClientRect.left, right: e.boundingClientRect.right });
        else linea.delete(n);
      }
      chiedi();
    }, { rootMargin: '-49.5% 0px -49.5% 0px' });
    // Si osservano gli elementi con la luce, o il loro atto se valgono in un tratto.
    const osserva = () => {
      el.querySelectorAll<HTMLElement>('[data-luce]').forEach(n => {
        const atto = n.hasAttribute('data-luce-da') ? n.closest<HTMLElement>('[data-sc-act]') : n;
        if (atto) io.observe(atto);
      });
      chiedi();
    };
    osserva();
    // Elementi nuovi (React), o un film che cambia nello stesso posto (la scheda nell'apertura).
    const mo = new MutationObserver(osserva);
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-luce'] });
    // Dentro un atto fissato il film cambia senza che niente entri o esca dalla linea.
    addEventListener('scroll', chiedi, { passive: true });
    return () => { io.disconnect(); mo.disconnect(); removeEventListener('scroll', chiedi); clearTimeout(timer); };
  }, [root]);

  // La stanza va sull'elemento radice: la vedono anche il cassetto della prenotazione e il piede.
  // I colori cambiano di colpo, senza transizione: una transizione delle variabili
  // su :root faceva ricalcolare a Firefox tutta la pagina per più di un secondo a
  // ogni cambio di film. Il passaggio morbido lo fa la luce d'ambiente, che sfuma.
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

  const valoreStanze = useMemo(() => ({ stanze, luci }), [stanze, luci]);
  const valoreScena = useMemo(() => ({ scena }), [scena]);
  return (
    <StanzeContext.Provider value={valoreStanze}>
      <ScenaContext.Provider value={valoreScena}>{children}</ScenaContext.Provider>
    </StanzeContext.Provider>
  );
}

/**
 * La luce d'ambiente: la miniatura del film in vista, sfocata e allargata
 * dietro tutta la pagina. Quando cambia film, la nuova sfuma sopra la vecchia.
 * A luci spente sparisce; in fondo diventa la luce di tutti i film.
 */
export function Ambiente({ films }: { films: FilmLuce[] }) {
  const { scena } = useScena();
  const { stanze, luci } = useStanze();
  const [strati, setStrati] = useState<{ id: number; src: string }[]>([]);

  // Cambia film: lo strato nuovo si aggiunge sopra (durante il render, non in un
  // effetto: è stato che dipende da un altro stato, e così non c'è un giro in più).
  const id = scena && /^\d+$/.test(scena) ? Number(scena) : null;
  const sopra = strati[strati.length - 1]?.id ?? null;
  if (id !== null && id !== sopra && luci[id]) {
    setStrati([...strati.filter(x => x.id !== id), { id, src: luci[id] }].slice(-2));
  }

  // La luce di tutti i film: una macchia del colore di ciascuno, sparse per la stanza.
  // Al massimo dieci: quaranta sfumature a tutto schermo erano un fotogramma lungo.
  const tutti = useMemo(() => {
    const glows = (films.map(f => stanze[f.id]?.bagliore).filter(Boolean) as string[]).slice(0, 10);
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
