'use client';

import { useEffect, useRef } from 'react';
import { ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import type { Candidato, FilmInProgramma } from '@/actions/specialeActions';
import type { SpecialeSalvata } from '@/services/speciali';
import Button from '@/components/cabina/Button';
import stanza from '../../_stanza.module.css';
import s from './Speciale.module.css';

/**
 * «Chi ha le foto?» (25 novembre 2026, chiesto da Giovanni): i film in
 * programma, divisi per come sta il materiale presso il distributore
 * italiano. Pronti: la pagina del film risponde e foto o zip si scaricano
 * («Riempi dal distributore» fa tutto). A mano: c'è qualcosa, ma va preso dal
 * browser. Niente: distributore con login, sconosciuto, o pagina vuota.
 * Così la prossima proiezione speciale si sceglie a colpo sicuro.
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
    controlla(film.filter(f => !risposte.has(f.tmdbId)).map(f => f.tmdbId), false);
  }, [film, risposte, controlla]);

  const gia = new Set(speciali.map(x => x.tmdbId));
  // Prima i film che arrivano prima: la proiezione speciale va preparata in tempo.
  const ordinati = [...film].sort((a, b) => a.primo.localeCompare(b.primo));
  const fatti = film.filter(f => risposte.has(f.tmdbId)).length;
  const inCorso = fatti < film.length;

  const riga = (f: FilmInProgramma) => {
    const r = risposte.get(f.tmdbId);
    const c = r && !('errore' in r) ? r : null;
    const d = c?.distributore;
    return (
      <li key={f.tmdbId} className={stanza.item}>
        <div className={stanza.itemMain}>
          <b>{f.titolo}{gia.has(f.tmdbId) && <span className={s.gia}> · già speciale</span>}</b>
          <span className={stanza.meta}>
            {giorno(f.primo)}{f.ultimo.slice(0, 10) !== f.primo.slice(0, 10) ? ` – ${giorno(f.ultimo)}` : ''} · {f.spettacoli} spettacol{f.spettacoli === 1 ? 'o' : 'i'}
            {d && <> · <b className={s.dist}>{d.nome}</b></>}
            {d?.sito && <> · <a href={d.sito} target="_blank" rel="noreferrer">sito <ExternalLink size={11} /></a></>}
            {d?.pagina && <> · <a href={d.pagina} target="_blank" rel="noreferrer">pagina del film <ExternalLink size={11} /></a></>}
            {d?.fonte.startsWith('http') && <> · <a href={d.fonte} target="_blank" rel="noreferrer">MyMovies <ExternalLink size={11} /></a></>}
          </span>
          {c?.cosa && <span className={s.cosa}>{c.cosa}</span>}
          {c && <span className={stanza.meta}>{c.nota}</span>}
          {r && 'errore' in r && <span className={stanza.meta}>{r.errore}</span>}
        </div>
        <div className={stanza.itemActions}>
          {!r && <Loader2 size={16} className={s.gira} aria-label="Controllo…" />}
          {r && (
            <button type="button" className={stanza.iconBtn} onClick={() => controlla([f.tmdbId], true)} title="Ricontrolla adesso" aria-label="Ricontrolla">
              <RefreshCw size={15} />
            </button>
          )}
          {!gia.has(f.tmdbId) && <Button variant={c?.verdetto === 'pronto' ? 'fill' : 'outline'} onClick={() => scegli(f)}>Prepara</Button>}
        </div>
      </li>
    );
  };

  // I film ancora da controllare, o finiti in errore, stanno in fondo al loro gruppo «niente».
  const di = (v: string) => ordinati.filter(f => {
    const r = risposte.get(f.tmdbId);
    const vv = r && !('errore' in r) ? r.verdetto : 'niente';
    return r ? vv === v : false;
  });
  const attesa = ordinati.filter(f => !risposte.has(f.tmdbId));

  return (
    <section className={`${stanza.panel} ${s.candidati}`} aria-labelledby="chi-ha-le-foto">
      <div className={s.candidatiTesta}>
        <div>
          <h2 id="chi-ha-le-foto" className={s.titoloSezione}>Chi ha le foto?</h2>
          <p className={stanza.meta}>
            {inCorso
              ? <>Controllo i distributori: {fatti} di {film.length} film…</>
              : <>I {film.length} film in programma, guardati presso il distributore italiano. Nessun file è stato scaricato.</>}
          </p>
        </div>
        <div className={stanza.itemActions}>
          <Button variant="ghost" disabled={inCorso} onClick={() => controlla(film.map(f => f.tmdbId), true)}><RefreshCw size={15} /> Ricontrolla tutti</Button>
          <button type="button" className={stanza.iconBtn} onClick={chiudi} title="Chiudi" aria-label="Chiudi"><X size={16} /></button>
        </div>
      </div>
      {!film.length && <p className={stanza.meta}>Nessun film in programma.</p>}
      {GRUPPI.map(g => {
        const qui = di(g.v);
        if (!qui.length) return null;
        return (
          <div key={g.v} className={s.gruppo} data-verdetto={g.v}>
            <p className={stanza.section}>{g.titolo} · {qui.length}</p>
            <p className={stanza.meta}>{g.nota}</p>
            <ul className={stanza.list}>{qui.map(riga)}</ul>
          </div>
        );
      })}
      {attesa.length > 0 && (
        <div className={s.gruppo}>
          <p className={stanza.section}>Da controllare · {attesa.length}</p>
          <ul className={stanza.list}>{attesa.map(riga)}</ul>
        </div>
      )}
    </section>
  );
}
