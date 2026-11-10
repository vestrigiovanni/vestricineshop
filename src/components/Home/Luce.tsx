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
 *
 * Dal 10 novembre 2026 la stanza prende la luce quando ci si ferma su un film,
 * non mentre gli si passa davanti. Misurato nel Firefox di Giovanni (che
 * disegna col processore): ogni cambio di luce a metà scorrimento erano un
 * ricalcolo di tutta la pagina e una dissolvenza a tutto schermo, e su "Più
 * avanti", dove i film si susseguono, più di metà dei fotogrammi superava i
 * 33 ms. Mentre si scorre il colore lo portano le schede dei film (ognuna ha
 * il suo); quando ci si ferma, la stanza lo raggiunge.
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

/** La tela su cui si prepara la luce di un film: piccola, poi il browser la allarga a tutto schermo. */
const LARGA = 192, ALTA = 108;

/** "#rrggbb" trasparente: le sfumature partono dal colore d'arrivo, senza passare dal grigio. */
const trasparente = (hex: string) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0)`;

/**
 * La vignetta: verso i bordi la luce torna al fondo, perché viene dallo
 * schermo e non dalle pareti. È un'ellisse larga il 120% e alta il 90% della
 * tela, centrata un po' sopra il mezzo: piena trasparenza fino al 30% del raggio.
 */
function vignetta(x: CanvasRenderingContext2D, fondo: string) {
  x.save();
  x.translate(LARGA * 0.5, ALTA * 0.45);
  x.scale(LARGA * 1.2, ALTA * 0.9);
  const g = x.createRadialGradient(0, 0, 0.3, 0, 0, 1);
  g.addColorStop(0, trasparente(fondo));
  g.addColorStop(1, fondo);
  x.fillStyle = g;
  x.fillRect(-1, -1, 2, 2);
  x.restore();
}

/**
 * La luce d'ambiente di un film, preparata una volta sola qui: il fotogramma
 * sfocato, a metà forza sul fondo del film, con la vignetta già dentro. Esce
 * un'immagine sola e opaca. Il 26 ottobre 2026 la sfocatura era un `filter:
 * blur()` in CSS su uno strato a tutto schermo (Firefox lo rifaceva a ogni
 * passo: da 49 a 17 ms per fotogramma senza); fino al 10 novembre la vignetta
 * e la trasparenza erano tre strati a tutto schermo da fondere a ogni cambio.
 */
function sfoca(el: HTMLImageElement, fondo: string): string {
  try {
    const piccola = document.createElement('canvas'); piccola.width = 16; piccola.height = 9;
    piccola.getContext('2d')?.drawImage(el, 0, 0, 16, 9);
    const c = document.createElement('canvas'); c.width = LARGA; c.height = ALTA;
    const x = c.getContext('2d');
    if (!x) return '';
    x.fillStyle = fondo;
    x.fillRect(0, 0, LARGA, ALTA);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.globalAlpha = 0.5;
    if ('filter' in x) x.filter = 'blur(7px) saturate(1.35)';
    // Più grande della tela: la sfocatura ai bordi non pesca nel vuoto.
    x.drawImage(piccola, -LARGA * 0.12, -ALTA * 0.12, LARGA * 1.24, ALTA * 1.24);
    x.globalAlpha = 1;
    if ('filter' in x) x.filter = 'none';
    vignetta(x, fondo);
    return c.toDataURL('image/png');
  } catch { return ''; }
}

/**
 * La luce di tutti i film insieme, per il programma in fondo: una macchia del
 * colore di ciascuno (al massimo dieci), sparse per la stanza. Anche questa è
 * un'immagine sola, fatta una volta: dieci sfumature a tutto schermo, in CSS,
 * erano un fotogramma lungo a ogni passo.
 */
function sfocaTutti(bagliori: string[], fondo: string): string {
  try {
    const c = document.createElement('canvas'); c.width = LARGA; c.height = ALTA;
    const x = c.getContext('2d');
    if (!x) return '';
    x.fillStyle = fondo;
    x.fillRect(0, 0, LARGA, ALTA);
    x.globalAlpha = 0.42;
    bagliori.slice(0, 10).forEach((colore, i) => {
      const cx = ((i * 37 + 11) % 100) / 100 * LARGA, cy = ((i * 53 + 23) % 100) / 100 * ALTA;
      x.save();
      x.translate(cx, cy);
      x.scale(LARGA * 0.38, ALTA * 0.42);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, colore);
      g.addColorStop(0.72, trasparente(colore));
      x.fillStyle = g;
      x.fillRect(-1, -1, 2, 2);
      x.restore();
    });
    x.globalAlpha = 1;
    vignetta(x, fondo);
    return c.toDataURL('image/png');
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
/** Dopo quanto tempo senza scorrere la stanza prende la luce del film in vista. */
const FERMO = 140;

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
        const luce = sfoca(im, stanzaDa(t[f.id]).fondo);
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
      for (const n of linea.keys()) if (n.closest('[data-sc-pan], [data-binario]')) linea.set(n, n.getBoundingClientRect());
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
    // La stanza cambia quando ci si ferma (o quasi: FERMO millisecondi senza scorrere):
    // ogni passo di scorrimento rimanda la lettura. Vedi in cima al file.
    const chiedi = () => { clearTimeout(timer); timer = window.setTimeout(leggi, FERMO); };
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
 * La luce d'ambiente: dietro tutta la pagina, la luce del film su cui ci si è
 * fermati. Ogni luce è uno strato solo, opaco (vedi `sfoca`): quando cambia,
 * la nuova sfuma sopra la vecchia, che poi viene tolta. A luci spente lo
 * strato è il buio; in fondo è la luce di tutti i film.
 */
export function Ambiente({ films }: { films: FilmLuce[] }) {
  const { scena } = useScena();
  const { stanze, luci } = useStanze();
  const [strati, setStrati] = useState<{ chiave: string; src: string }[]>([]);

  // La luce di tutti i film si prepara quando i colori ci sono (solo nel browser).
  const tutti = useMemo(() => {
    if (typeof document === 'undefined') return '';
    const bagliori = films.map(f => stanze[f.id]?.bagliore).filter(Boolean) as string[];
    return bagliori.length ? sfocaTutti(bagliori, stanzaDa(NEUTRA).fondo) : '';
  }, [films, stanze]);

  // Cambia scena: lo strato nuovo si aggiunge sopra (durante il render, non in un
  // effetto: è stato che dipende da un altro stato, e così non c'è un giro in più).
  const voluto = scena === 'buio' ? { chiave: 'buio', src: '' }
    : scena === 'tutti' ? (tutti ? { chiave: 'tutti', src: tutti } : null)
    : scena && luci[Number(scena)] ? { chiave: scena, src: luci[Number(scena)] } : null;
  const sopra = strati[strati.length - 1]?.chiave ?? null;
  if (voluto && voluto.chiave !== sopra) {
    setStrati([...strati.filter(x => x.chiave !== voluto.chiave), voluto].slice(-2));
  }

  return (
    <div className={s.ambiente} aria-hidden>
      {strati.map((x, i) => (
        <div
          key={x.chiave}
          className={s.strato}
          style={x.src ? { backgroundImage: `url(${x.src})` } : undefined}
          // Finita la dissolvenza lo strato sotto non si vede più: lo si toglie.
          onAnimationEnd={i === strati.length - 1 && strati.length > 1 ? () => setStrati(v => v.slice(-1)) : undefined}
        />
      ))}
    </div>
  );
}
