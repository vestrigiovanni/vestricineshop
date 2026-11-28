'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatShowDayLong, formatShowTime } from '@/home/date';
import { luceDa, NEUTRA, tintaDa, type Luce } from '@/home/tinta';
import { pagine, perGiorno, type PostiDisplay, type SpettacoloInSala } from './display';
import type { DatiDisplay } from './carica';

/**
 * Lo schermo d'ingresso. Ogni 30 secondi chiede `/api/display`; se la rete cade
 * (o il server non risponde) tiene l'ultimo stato che ha e scrive a che ora
 * l'ha avuto. L'ora e gli spettacoli finiti si aggiornano da soli ogni
 * secondo, senza il server: quando il film finisce, la riga se ne va. Se gli
 * spettacoli non ci stanno si dividono in pagine che si alternano.
 * Il colore di ogni film si misura sul suo fondale, come nella Home.
 */

const AGGIORNA_MS = 30_000;
const RIPROVA_MS = 10_000;
const TIMEOUT_MS = 10_000;
/** Dopo tanto senza una risposta buona si dice «senza rete» anche se nessuna richiesta ha fallito. */
const TROPPO_VECCHIO_MS = 150_000;
const GIRO_MS = 12_000;
const RIGHE_PER_PAGINA = 7;

const tmdb = (percorso: string, misura: string) => (!percorso ? '' : percorso.startsWith('http') ? percorso : `https://image.tmdb.org/t/p/${misura}${percorso}`);
const maiuscola = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const css = (v: Record<string, string | number>) => v as CSSProperties;

function misura(el: HTMLImageElement) {
  try {
    const w = 48, h = Math.max(8, Math.round((48 * el.naturalHeight) / el.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return NEUTRA;
    x.drawImage(el, 0, 0, w, h);
    return tintaDa(x.getImageData(0, 0, w, h).data);
  } catch { return NEUTRA; }
}

export default function Display({ iniziale }: { iniziale: DatiDisplay | null }) {
  const [dati, setDati] = useState<DatiDisplay | null>(iniziale);
  const [ultimoOk, setUltimoOk] = useState<number | null>(iniziale ? Date.parse(iniziale.generato) : null);
  const [rete, setRete] = useState(true);
  const [ora, setOra] = useState<number | null>(null);
  const [giro, setGiro] = useState(0);
  const [luci, setLuci] = useState<Record<number, Luce | null>>({});
  const [mouse, setMouse] = useState(false);
  const richiesti = useRef(new Set<number>());

  // 1. I dati: ogni 30 secondi, e subito quando la rete torna.
  useEffect(() => {
    let vivo = true;
    let timer = 0;
    let controllo: AbortController | null = null;

    const chiedi = async () => {
      window.clearTimeout(timer);
      controllo?.abort();
      const mio = (controllo = new AbortController());
      const scade = window.setTimeout(() => mio.abort(), TIMEOUT_MS);
      let riuscito = false;
      try {
        const r = await fetch('/api/display', { cache: 'no-store', signal: mio.signal });
        if (!r.ok) throw new Error(`display ${r.status}`);
        const d = (await r.json()) as DatiDisplay;
        if (!Array.isArray(d?.spettacoli)) throw new Error('risposta senza spettacoli');
        if (vivo && controllo === mio) { setDati(d); setUltimoOk(Date.now()); setRete(true); riuscito = true; }
      } catch {
        if (vivo && controllo === mio) setRete(false);
      } finally {
        window.clearTimeout(scade);
        if (vivo && controllo === mio) timer = window.setTimeout(chiedi, riuscito ? AGGIORNA_MS : RIPROVA_MS);
      }
    };

    if (iniziale) timer = window.setTimeout(chiedi, AGGIORNA_MS); else chiedi();
    const alRitorno = () => { if (document.visibilityState === 'visible') chiedi(); };
    window.addEventListener('online', chiedi);
    document.addEventListener('visibilitychange', alRitorno);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
      controllo?.abort();
      window.removeEventListener('online', chiedi);
      document.removeEventListener('visibilitychange', alRitorno);
    };
  }, [iniziale]);

  // 2. L'orologio e il giro delle pagine.
  useEffect(() => {
    setOra(Date.now());
    const orologio = window.setInterval(() => setOra(Date.now()), 1000);
    const pagina = window.setInterval(() => setGiro(g => g + 1), GIRO_MS);
    return () => { window.clearInterval(orologio); window.clearInterval(pagina); };
  }, []);

  // 3. Il colore di ogni film, dal suo fondale.
  useEffect(() => {
    for (const s of dati?.spettacoli ?? []) {
      if (!s.fondale || richiesti.current.has(s.film)) continue;
      richiesti.current.add(s.film);
      const im = new window.Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => setLuci(l => ({ ...l, [s.film]: luceDa(misura(im)) }));
      im.onerror = () => richiesti.current.delete(s.film);
      im.src = tmdb(s.fondale, 'w92');
    }
  }, [dati]);

  // 4. Tastiera e mouse: F per lo schermo intero; il cursore si vede solo se si muove.
  useEffect(() => {
    let nascondi = 0;
    const tasto = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'f' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.();
    };
    const mossa = () => { setMouse(true); window.clearTimeout(nascondi); nascondi = window.setTimeout(() => setMouse(false), 3000); };
    window.addEventListener('keydown', tasto);
    window.addEventListener('mousemove', mossa);
    return () => { window.removeEventListener('keydown', tasto); window.removeEventListener('mousemove', mossa); window.clearTimeout(nascondi); };
  }, []);

  const adesso = useMemo(() => new Date(ora ?? (dati ? Date.parse(dati.generato) : 0)), [ora, dati]);
  const giorni = useMemo(() => (dati ? perGiorno(dati.spettacoli, adesso) : []), [dati, adesso]);
  const tutte = useMemo(() => pagine(giorni, RIGHE_PER_PAGINA), [giorni]);
  const corrente = tutte.length ? tutte[giro % tutte.length] : [];
  const primo = corrente[0]?.spettacoli[0];
  const lucePagina = primo ? luci[primo.film] ?? null : null;

  const senzaRete = !rete || (ultimoOk !== null && ora !== null && ora - ultimoOk > TROPPO_VECCHIO_MS);
  const quando = ultimoOk !== null ? formatShowTime(new Date(ultimoOk)) : '';

  const stile: CSSProperties | undefined = lucePagina
    ? css({ '--luce': lucePagina.accento, '--luce-ink': lucePagina.accentoInk, '--luce-fondo': lucePagina.fondo, '--luce-bagliore': lucePagina.bagliore })
    : undefined;

  return (
    <div className={`display${mouse ? ' display--mouse' : ''}`} style={stile}>
      <div className="display__bagliore" aria-hidden />
      {primo?.fondale && <img key={primo.film} className="display__fondale" src={tmdb(primo.fondale, 'w1280')} alt="" />}

      <header className="display__testa">
        <p className="display__marchio">Vestri Cinema</p>
        {ora !== null || dati ? (
          <div className="display__orologio">
            <time className="num" dateTime={adesso.toISOString()}>{formatShowTime(adesso)}</time>
            <span>{maiuscola(formatShowDayLong(adesso))}</span>
          </div>
        ) : null}
      </header>

      <main className="display__corpo">
        <h1 className="visually-hidden">Gli spettacoli di oggi e dei prossimi giorni</h1>
        {!dati ? (
          <p className="display__vuoto">{rete ? 'Sto leggendo il programma…' : 'Il programma non arriva: riprovo fra poco.'}</p>
        ) : !tutte.length ? (
          <div className="display__vuoto">
            <p>Non ci sono altri spettacoli in programma.</p>
            <p className="display__vuoto-sotto">Il prossimo programma arriva presto.</p>
          </div>
        ) : (
          <div className="display__pagina" key={giro % tutte.length}>
            {corrente.map(g => (
              <section className="giorno" key={g.chiave} style={css({ '--righe': g.spettacoli.length })}>
                <header className="giorno__testa">
                  <h2>{g.etichetta}</h2>
                  {g.etichetta === 'Oggi' || g.etichetta === 'Domani' ? <span>{g.data}</span> : null}
                </header>
                <ul className="giorno__righe">
                  {g.spettacoli.map(s => <Riga key={s.id} s={s} luce={luci[s.film] ?? null} />)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      <footer className="display__piede">
        <p>Biglietti gratuiti · vestricinema.com</p>
        {tutte.length > 1 && (
          <div className="display__punti" aria-hidden>
            {tutte.map((_, i) => <span key={i} className={i === giro % tutte.length ? 'attivo' : ''} />)}
          </div>
        )}
        <p className={`display__stato${senzaRete ? ' display__stato--spento' : ''}`} role="status" aria-live="polite">
          {senzaRete ? `Senza rete · ultimo stato alle ${quando || '—'}` : quando ? `Aggiornato alle ${quando}` : ''}
        </p>
      </footer>

      {tutte.length > 1 && <i className="display__giro" key={`g${giro}`} aria-hidden style={css({ '--giro': `${GIRO_MS}ms` })} />}
      <p className="display__suggerimento" aria-hidden>F · schermo intero</p>
    </div>
  );
}

function Riga({ s, luce }: { s: SpettacoloInSala; luce: Luce | null }) {
  const stile = luce ? css({ '--riga': luce.accento }) : undefined;
  const meta = [s.sala, s.lingua].filter(Boolean).join(' · ');
  return (
    <li className={`riga riga--${s.posti.stato}${s.inCorso ? ' riga--corso' : ''}`} style={stile}>
      <div className="riga__ora">
        <time className="num" dateTime={s.inizio}>{formatShowTime(s.inizio)}</time>
        {s.inCorso && <span>In corso</span>}
      </div>
      {s.poster
        ? <img className="riga__locandina" src={tmdb(s.poster, 'w185')} alt="" />
        : <span className="riga__locandina riga__locandina--vuota" aria-hidden />}
      <div className="riga__film">
        <h3>
          {s.titolo}
          {s.divieto !== 'T' && <span className="riga__divieto" title={`Divieto ${s.divieto}`}>{s.divieto}</span>}
        </h3>
        {meta && <p>{meta}</p>}
      </div>
      <Posti p={s.posti} />
    </li>
  );
}

function Posti({ p }: { p: PostiDisplay }) {
  if (p.stato === 'esaurito') return <div className="posti posti--esaurito"><span className="posti__esaurito">Esaurito</span></div>;
  if (p.stato === 'ignoti' || p.liberi === null) {
    return <div className="posti posti--ignoti" aria-label="Posti non disponibili"><span className="posti__n">—</span><span className="posti__t">posti</span></div>;
  }
  const uno = p.liberi === 1;
  const testo = p.stato === 'ultimi' ? (uno ? 'ultimo posto' : 'ultimi posti') : uno ? 'posto libero' : 'posti liberi';
  return (
    <div className={`posti posti--${p.stato}`} aria-label={`${p.liberi} ${testo}${p.totale ? ` su ${p.totale}` : ''}`}>
      <p className="posti__riga"><span className="posti__n num">{p.liberi}</span><span className="posti__t">{testo}</span></p>
      {p.totale !== null && <span className="posti__barra" aria-hidden><i style={{ width: `${Math.max(4, Math.min(100, (p.liberi / p.totale) * 100))}%` }} /></span>}
    </div>
  );
}
