'use client';

import { useEffect, useRef } from 'react';
import type { Candidato, FilmInProgramma } from './azioni';
import type { SpecialeSalvata } from './salvate';

/**
 * «Chi ha le foto?»: i film in programma, divisi per come sta il materiale
 * presso il distributore italiano. Pronti: la pagina del film risponde e foto
 * o zip si scaricano («Riempi dal distributore» fa tutto). A mano: c'è
 * qualcosa, ma va preso dal browser. Niente: area con login, distributore
 * sconosciuto o pagina vuota. Non scarica e non salva niente. Dalla v1.
 */

type Risposta = Candidato | { errore: string };

const GRUPPI = [
  { v: 'pronto', titolo: 'Pronti', nota: 'Pagina del film raggiungibile, foto scaricabili.' },
  { v: 'a-mano', titolo: 'Da prendere a mano', nota: 'C’è materiale (una cartella Dropbox, solo la locandina): va preso dal browser.' },
  { v: 'niente', titolo: 'Senza materiale da scaricare', nota: 'Area stampa con login, materiale da chiedere all’ufficio stampa, o distributore che non conosco.' },
] as const;

const giorno = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });

export default function ChiHaLeFoto({ film, risposte, speciali, controlla, scegli, chiudi }: {
  film: FilmInProgramma[];
  risposte: Map<number, Risposta>;
  speciali: SpecialeSalvata[];
  controlla: (ids: number[], ancora: boolean) => Promise<void>;
  scegli: (f: FilmInProgramma) => void;
  chiudi: () => void;
}) {
  // All'apertura si controllano i film non ancora controllati (le risposte restano un'ora sul server).
  const partito = useRef(false);
  useEffect(() => {
    if (partito.current || !film.length) return;
    partito.current = true;
    void controlla(film.filter(f => !risposte.has(f.tmdbId)).map(f => f.tmdbId), false);
  }, [film, risposte, controlla]);

  const gia = new Set(speciali.map(x => x.tmdbId));
  const ordinati = [...film].sort((a, b) => a.primo.localeCompare(b.primo));
  const fatti = film.filter(f => risposte.has(f.tmdbId)).length;
  const inCorso = fatti < film.length;

  const riga = (f: FilmInProgramma) => {
    const r = risposte.get(f.tmdbId);
    const c = r && !('errore' in r) ? r : null;
    const d = c?.distributore;
    return (
      <li key={f.tmdbId} className="s-voce">
        <div className="s-voce__testo">
          <b>{f.titolo}{gia.has(f.tmdbId) && <span className="g-segno" data-tuo="">già speciale</span>}</b>
          <span className="g-nota">
            <span className="num">{giorno(f.primo)}{f.ultimo.slice(0, 10) !== f.primo.slice(0, 10) ? ` – ${giorno(f.ultimo)}` : ''}</span> · {f.spettacoli} spettacol{f.spettacoli === 1 ? 'o' : 'i'}
            {d && <> · <b>{d.nome}</b></>}
            {d?.sito && <> · <a href={d.sito} target="_blank" rel="noreferrer">sito ↗</a></>}
            {d?.pagina && <> · <a href={d.pagina} target="_blank" rel="noreferrer">pagina del film ↗</a></>}
            {d?.fonte.startsWith('http') && <> · <a href={d.fonte} target="_blank" rel="noreferrer">MyMovies ↗</a></>}
          </span>
          {c?.cosa && <span className="s-cosa">{c.cosa}</span>}
          {c && <span className="g-nota">{c.nota}</span>}
          {r && 'errore' in r && <span className="g-errore">{r.errore}</span>}
        </div>
        <div className="s-voce__azioni">
          {!r ? <span className="g-nota">Controllo…</span> : (
            <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => void controlla([f.tmdbId], true)} title="Ricontrolla adesso">Ricontrolla</button>
          )}
          {!gia.has(f.tmdbId) && (
            <button type="button" className={`g-tasto g-tasto--piccolo${c?.verdetto === 'pronto' ? ' g-tasto--pieno' : ''}`} onClick={() => scegli(f)}>Prepara</button>
          )}
        </div>
      </li>
    );
  };

  const di = (v: string) => ordinati.filter(f => {
    const r = risposte.get(f.tmdbId);
    if (!r) return false;
    return ('errore' in r ? 'niente' : r.verdetto) === v;
  });
  const attesa = ordinati.filter(f => !risposte.has(f.tmdbId));

  return (
    <section className="g-gruppo s-candidati" aria-labelledby="chi-ha-le-foto">
      <div className="s-candidati__testa">
        <div>
          <h2 id="chi-ha-le-foto" className="s-sezione__titolo">Chi ha le foto?</h2>
          <p className="g-nota">
            {inCorso
              ? `Controllo i distributori: ${fatti} di ${film.length} film…`
              : `I ${film.length} film in programma, guardati presso il distributore italiano. Nessun file è stato scaricato.`}
          </p>
        </div>
        <div className="s-voce__azioni">
          <button type="button" className="g-tasto g-tasto--piccolo" disabled={inCorso} onClick={() => void controlla(film.map(f => f.tmdbId), true)}>Ricontrolla tutti</button>
          <button type="button" className="g-tasto g-tasto--piccolo g-tasto--tondo" onClick={chiudi} aria-label="Chiudi">×</button>
        </div>
      </div>
      {!film.length && <p className="g-nota">Nessun film in programma.</p>}
      {GRUPPI.map(g => {
        const qui = di(g.v);
        if (!qui.length) return null;
        return (
          <div key={g.v} className="s-candidati__gruppo" data-verdetto={g.v}>
            <p className="g-etichetta">{g.titolo} · {qui.length}</p>
            <p className="g-nota">{g.nota}</p>
            <ul className="s-voci">{qui.map(riga)}</ul>
          </div>
        );
      })}
      {attesa.length > 0 && (
        <div className="s-candidati__gruppo">
          <p className="g-etichetta">Da controllare · {attesa.length}</p>
          <ul className="s-voci">{attesa.map(riga)}</ul>
        </div>
      )}
    </section>
  );
}
