'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAvviso } from '../Avviso';
import Finestra from '../Finestra';
import { immagineTmdb } from '../immagini';
import { abbinaUnGiro, aggiungiTmdb, elencoCatalogo, quadro, sorprendimi, type Filtri, type VoceCatalogo } from './azioni';
import SchedaCatalogo from './SchedaCatalogo';

/**
 * La stanza Catalogo: la libreria Plex del cinema, abbinata a TMDB. Cerca,
 * filtra, «Sorprendimi», e i film da verificare si confermano o si correggono.
 * I film arrivano dal Mac (`npm run plex:sync`); qui si sistemano.
 */
export default function StanzaCatalogo() {
  const di = useAvviso();
  const [filtri, setFiltri] = useState<Filtri>({ ordine: 'novita' });
  const [cerca, setCerca] = useState('');
  const [film, setFilm] = useState<VoceCatalogo[]>([]);
  const [totale, setTotale] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [ancora, setAncora] = useState(false);
  const [carico, setCarico] = useState(true);
  const [caso, setCaso] = useState(false);
  const [q, setQ] = useState<{ conti: Record<string, number>; generi: string[]; decenni: number[] } | null>(null);
  const [scelto, setScelto] = useState<VoceCatalogo | null>(null);
  const [nuovoId, setNuovoId] = useState('');
  const [aggiungo, setAggiungo] = useState(false);
  const [abbina, setAbbina] = useState<{ righe: string[]; lavoro: boolean } | null>(null);
  const chiesta = useRef(0);

  const leggi = useCallback(async (n: number) => {
    const mia = ++chiesta.current;
    setCaso(false);
    setCarico(true);
    const r = await elencoCatalogo(filtri, n);
    if (chiesta.current !== mia) return;
    setCarico(false);
    if (!r.ok) return di(r.errore, 'errore');
    setFilm(x => (n === 1 ? r.film : [...x, ...r.film]));
    setPagina(n);
    setTotale(r.totale);
    setAncora(r.ancora);
  }, [filtri, di]);

  const conta = useCallback(async () => {
    const r = await quadro();
    if (r.ok) setQ(r);
  }, []);

  useEffect(() => { void leggi(1); }, [leggi]);
  useEffect(() => { void conta(); }, [conta]);
  useEffect(() => {
    const t = window.setTimeout(() => setFiltri(f => (f.cerca === (cerca.trim() || undefined) ? f : { ...f, cerca: cerca.trim() || undefined })), 300);
    return () => window.clearTimeout(t);
  }, [cerca]);

  const metti = (x: Partial<Filtri>) => setFiltri(f => ({ ...f, ...x }));

  const pesca = async () => {
    chiesta.current++;
    setCarico(true);
    const r = await sorprendimi(filtri);
    setCarico(false);
    if (!r.ok) return di(r.errore, 'errore');
    setFilm(r.film);
    setTotale(r.film.length);
    setAncora(false);
    setCaso(true);
  };

  const aggiungi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuovoId.trim()) return;
    setAggiungo(true);
    const r = await aggiungiTmdb(nuovoId.trim());
    setAggiungo(false);
    if (!r.ok) return di(r.errore, 'errore');
    setNuovoId('');
    di(`Aggiunto al catalogo: «${r.titolo}».`);
    void conta();
    void leggi(1);
  };

  const abbinaTutto = async () => {
    const righe: string[] = [];
    const scrivi = (riga: string, sostituisci = false) => {
      if (sostituisci) righe.pop();
      righe.push(riga);
      setAbbina({ righe: [...righe], lavoro: true });
    };
    scrivi('Comincio…');
    let prima = Infinity;
    let fase = '';
    for (;;) {
      const r = await abbinaUnGiro();
      if (!r.ok) {
        scrivi(r.errore);
        break;
      }
      if (r.fase === 'fatto') {
        scrivi('Fatto: tutto il catalogo è abbinato e completo.');
        break;
      }
      const nome = r.fase === 'abbino' ? 'Abbino a TMDB i film nuovi' : 'Completo le schede (voto, trama, fondale)';
      scrivi(`${nome}: ne restano ${r.restano}.`, fase === r.fase);
      // Se non scende più, quelli che restano TMDB non li sa sistemare.
      if (fase === r.fase && r.restano >= prima) {
        scrivi(`Ne restano ${r.restano} che TMDB non sa sistemare: si correggono a mano.`);
        break;
      }
      fase = r.fase;
      prima = r.restano;
    }
    setAbbina({ righe: [...righe], lavoro: false });
    void conta();
    void leggi(1);
  };

  const cambiato = (f: VoceCatalogo) => {
    setFilm(x => x.map(y => (y.id === f.id ? f : y)));
    setScelto(f);
    void conta();
  };
  const tolto = (id: number) => {
    setFilm(x => x.filter(y => y.id !== id));
    setTotale(t => Math.max(0, t - 1));
    setScelto(null);
    void conta();
  };

  const c = q?.conti;
  const dubbi = (c?.suspect ?? 0) + (c?.missing ?? 0);

  return (
    <div className="g-stanza-catalogo" data-aperta={scelto ? '' : undefined}>
      <header className="g-testata">
        <div>
          <p className="g-occhiello num">
            {c ? `${c.totale} film · ${c.inPlex} in Plex · ${dubbi} da verificare${c.pending ? ` · ${c.pending} in attesa di TMDB` : ''}` : 'Leggo il catalogo…'}
          </p>
          <h1 className="g-titolo">Catalogo</h1>
        </div>
        <div className="g-testata__azioni">
          <form className="g-aggiungi" onSubmit={aggiungi}>
            <input value={nuovoId} onChange={e => setNuovoId(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Id TMDB" aria-label="Aggiungi un film per id TMDB" />
            <button type="submit" className="g-tasto" disabled={aggiungo || !nuovoId}>{aggiungo ? 'Aggiungo…' : 'Aggiungi'}</button>
          </form>
          <button type="button" className="g-tasto" onClick={() => setAbbina({ righe: [], lavoro: false })}>Abbina a TMDB</button>
        </div>
      </header>

      <div className="g-filtri">
        <input className="g-cerca" type="search" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Titolo, regista o id TMDB" aria-label="Cerca nel catalogo" />
        <select aria-label="Genere" value={filtri.genere ?? ''} onChange={e => metti({ genere: e.target.value || undefined })}>
          <option value="">Tutti i generi</option>
          {q?.generi.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select aria-label="Decennio" value={filtri.decennio ?? ''} onChange={e => metti({ decennio: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Tutti gli anni</option>
          {q?.decenni.map(d => <option key={d} value={d}>Anni {String(d).slice(2)}{d < 2000 ? '' : ` (${d})`}</option>)}
        </select>
        <select aria-label="Ordine" value={filtri.ordine ?? 'novita'} onChange={e => metti({ ordine: e.target.value as Filtri['ordine'] })}>
          <option value="novita">Ultimi arrivati in Plex</option>
          <option value="titolo">Titolo A→Z</option>
          <option value="anno">Più recenti</option>
          <option value="voto">Voto TMDB</option>
        </select>
        <label className="g-spunta"><input type="checkbox" checked={!!filtri.soloInPlex} onChange={e => metti({ soloInPlex: e.target.checked || undefined })} /> Solo in Plex</label>
        <label className="g-spunta"><input type="checkbox" checked={!!filtri.maiProgrammati} onChange={e => metti({ maiProgrammati: e.target.checked || undefined })} /> Mai programmati</label>
        <label className="g-spunta"><input type="checkbox" checked={!!filtri.daVerificare} onChange={e => metti({ daVerificare: e.target.checked || undefined })} /> Da verificare</label>
        <button type="button" className="g-tasto g-tasto--piccolo" onClick={pesca}>Sorprendimi</button>
      </div>

      <div className="g-cat-corpo">
        <div className="g-cat-lista">
          <p className="g-nota num">{caso ? `${totale} film a caso: «Sorprendimi» per altri` : `${totale} film`}{carico ? ' · carico…' : ''}</p>
          <ul className="g-copertine">
            {film.map(f => {
              const p = immagineTmdb(f.posterPath, 'w185');
              const dubbio = f.verifyStatus === 'suspect' || f.verifyStatus === 'missing';
              return (
                <li key={f.id}>
                  <button type="button" className="g-copertina" aria-current={scelto?.id === f.id || undefined} onClick={() => setScelto(f)}>
                    <span className="g-copertina__locandina" data-slot>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p && <img src={p} alt="" loading="lazy" />}
                      <span data-keep className="g-copertina__segni">
                        {dubbio && <span className="g-segno" data-allarme>{f.verifyStatus === 'missing' ? 'non trovato' : 'da verificare'}</span>}
                        {f.programmato > 0 && <span className="g-segno num">×{f.programmato}</span>}
                      </span>
                    </span>
                    <span className="g-copertina__titolo">{f.title}</span>
                    <span className="g-copertina__dati num">{[f.year, f.director].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!carico && film.length === 0 && <p className="g-nota">Nessun film con questi filtri.</p>}
          {ancora && (
            <div className="g-ancora">
              <button type="button" className="g-tasto" onClick={() => void leggi(pagina + 1)} disabled={carico}>{carico ? 'Carico…' : 'Altri 60'}</button>
            </div>
          )}
        </div>

        <aside className="g-cat-lato" aria-label="Il film scelto">
          {scelto ? (
            <SchedaCatalogo key={scelto.id} film={scelto} onCambiato={cambiato} onTolto={tolto} onChiudi={() => setScelto(null)} />
          ) : (
            <div className="g-vuoto">
              <p className="g-vuoto__titolo">Scegli un film</p>
              <p className="g-nota">Per vederne la scheda, confermarne l’abbinamento con TMDB o correggerlo.</p>
            </div>
          )}
        </aside>
      </div>

      {abbina && (
        <Finestra titolo="Abbina il catalogo a TMDB" onChiudi={() => { if (!abbina.lavoro) setAbbina(null); }}>
          <p className="g-testo">
            I film arrivati da Plex trovano il loro film su TMDB, poi le schede si completano con voto, trama e fondale.
            Rifà solo quello che manca: si può rilanciare quando vuoi. Lo fa anche lo script di Plex, alla fine di ogni giro.
          </p>
          {abbina.righe.length > 0 && <ol className="g-registro">{abbina.righe.map((r, i) => <li key={i}>{r}</li>)}</ol>}
          <div className="g-finestra__azioni">
            <button type="button" className="g-tasto" onClick={() => setAbbina(null)} disabled={abbina.lavoro}>Chiudi</button>
            <button type="button" className="g-tasto g-tasto--pieno" onClick={abbinaTutto} disabled={abbina.lavoro}>{abbina.lavoro ? 'Lavoro…' : 'Avvia'}</button>
          </div>
        </Finestra>
      )}
    </div>
  );
}
