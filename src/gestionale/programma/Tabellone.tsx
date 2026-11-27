'use client';

import { useEffect, useRef, useState } from 'react';
import { cercaSuTmdb, filmDaTmdb, tabellone } from '@/programma/azioni';
import { CATALOG_SORTS, type CatalogSort } from '@/programma/motore/catalogSort';
import type { Trovato } from '@/gestionale/tmdb/leggi';
import { useAvviso } from '../Avviso';
import { immagineTmdb } from '../immagini';
import type { CatalogItem } from './types';

type Film = CatalogItem & { tasteNote?: string | null };

/** "1994 · 154′ · ★ 8,3" */
export function riga(f: { year: number | null; runtime?: number | null; durationMin?: number | null; voteAverage?: number | null }): string {
  const durata = f.runtime ?? f.durationMin;
  return [f.year, durata ? `${durata}′` : null, f.voteAverage ? `★ ${f.voteAverage.toFixed(1).replace('.', ',')}` : null].filter(Boolean).join(' · ');
}

/**
 * La libreria da sfogliare: i poster del catalogo in un ordine pesato sul gusto
 * della sala (o per novità, voto, durata…), la ricerca, e un film di passaggio
 * preso da TMDB senza scriverlo in catalogo.
 *
 * `lista` è lo scaffale accanto alla settimana: ogni film si sceglie o si
 * trascina sul giorno. `griglia` è «Riempi i buchi»: si spuntano i poster.
 */
export default function Tabellone({ modo, scelti, onScegli, onTrascina, escludi = [], tmdbScelto }: {
  modo: 'lista' | 'griglia';
  scelti: Set<string>;
  onScegli: (f: Film) => void;
  onTrascina?: (f: Film) => void;
  escludi?: string[];
  /** Nella lista: il film acceso sulla settimana. */
  tmdbScelto?: string | null;
}) {
  const di = useAvviso();
  const [cerca, setCerca] = useState('');
  const [ordine, setOrdine] = useState<CatalogSort>('mix');
  const [mai, setMai] = useState(false);
  const [seme, setSeme] = useState(1);
  const [pagina, setPagina] = useState(0);
  const [stato, setStato] = useState<{ chiave: string; film: Film[]; totale: number; pagine: number } | null>(null);
  const [tmdb, setTmdb] = useState<Trovato[] | null>(null);
  const [cercoTmdb, setCercoTmdb] = useState(false);
  const escludiChiave = escludi.join(',');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => { setQ(cerca.trim()); setPagina(0); setTmdb(null); }, 300);
    return () => window.clearTimeout(t);
  }, [cerca]);

  const chiave = `${q}|${ordine}|${mai}|${seme}|${pagina}|${escludiChiave}`;
  const mia = useRef(chiave);
  useEffect(() => {
    mia.current = chiave;
    tabellone({ count: modo === 'lista' ? 40 : 60, page: pagina, seed: seme, search: q || undefined, sort: ordine, onlyNever: mai, exclude: escludiChiave ? escludiChiave.split(',') : [] })
      .then(r => { if (mia.current === chiave) setStato({ chiave, film: r.films as Film[], totale: r.total, pagine: r.pages }); })
      .catch(() => { if (mia.current === chiave) setStato({ chiave, film: [], totale: 0, pagine: 1 }); });
  }, [chiave, modo, pagina, seme, q, ordine, mai, escludiChiave]);

  const carico = stato?.chiave !== chiave;

  const daTmdb = async () => {
    setCercoTmdb(true);
    try {
      setTmdb(await cercaSuTmdb(q));
    } catch {
      di('TMDB non ha risposto.', 'errore');
    } finally {
      setCercoTmdb(false);
    }
  };

  const prendi = async (t: Trovato) => {
    const f = await filmDaTmdb(String(t.id)).catch(() => null);
    if (!f) return di('Non riesco a leggere questo film su TMDB.', 'errore');
    if (!(f.runtime ?? f.durationMin)) return di(`Di «${f.title}» TMDB non sa la durata: non so dove metterlo.`, 'errore');
    onScegli(f as Film);
  };

  return (
    <div className="p-tab" data-modo={modo}>
      <div className="p-tab__filtri">
        <input className="g-cerca" type="search" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca titolo o regia" aria-label="Cerca nel catalogo" />
        <select value={ordine} onChange={e => { setOrdine(e.target.value as CatalogSort); setPagina(0); }} aria-label="Ordine">
          {CATALOG_SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <label className="g-spunta"><input type="checkbox" checked={mai} onChange={e => { setMai(e.target.checked); setPagina(0); }} /> Mai programmati</label>
        {(ordine === 'mix' || ordine === 'random') && (
          <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => { setSeme(s => s + 1); setPagina(0); }}>Rimescola</button>
        )}
      </div>

      {carico && !stato ? (
        <p className="g-nota">Sfoglio la libreria…</p>
      ) : (
        <>
          <p className="g-nota num">
            {stato?.totale ?? 0} film in libreria{q ? ` per «${q}»` : ''}
            {(stato?.pagine ?? 1) > 1 && ` · pagina ${pagina + 1} di ${stato?.pagine}`}
          </p>
          <ul className="p-tab__film" aria-busy={carico || undefined}>
            {stato?.film.map(f => {
              const preso = !!f.tmdbId && scelti.has(f.tmdbId);
              const acceso = !!f.tmdbId && f.tmdbId === tmdbScelto;
              const src = immagineTmdb(f.posterPath, modo === 'lista' ? 'w92' : 'w185');
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className="p-film"
                    aria-pressed={modo === 'griglia' ? preso : acceso}
                    draggable={modo === 'lista' && !!onTrascina}
                    onDragStart={e => {
                      if (!onTrascina || !f.tmdbId) return;
                      e.dataTransfer.setData('text/plain', `film:${f.tmdbId}`);
                      e.dataTransfer.effectAllowed = 'copy';
                      onTrascina(f);
                    }}
                    onClick={() => onScegli(f)}
                    title={f.tasteNote ?? undefined}
                  >
                    {src ? <img className="p-film__locandina" src={src} alt="" loading="lazy" /> : <span className="p-film__locandina" />}
                    <span className="p-film__testo">
                      <span className="p-film__titolo">{f.title}</span>
                      <span className="p-film__dati num">{riga(f)}</span>
                      {f.tasteNote && modo === 'lista' && <span className="p-film__nota">{f.tasteNote}</span>}
                    </span>
                    {preso && <span className="g-segno" data-tuo="">{modo === 'griglia' ? 'scelto' : 'in bozza'}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {(stato?.pagine ?? 1) > 1 && (
            <div className="p-tab__pagine">
              <button type="button" className="g-tasto g-tasto--piccolo" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>← Indietro</button>
              <button type="button" className="g-tasto g-tasto--piccolo" disabled={pagina + 1 >= (stato?.pagine ?? 1)} onClick={() => setPagina(p => p + 1)}>Avanti →</button>
            </div>
          )}
          {q && (
            <div className="p-tab__tmdb">
              {tmdb === null ? (
                <button type="button" className="g-tasto g-tasto--piccolo" onClick={daTmdb} disabled={cercoTmdb}>
                  {cercoTmdb ? 'Cerco su TMDB…' : `Non è in libreria? Cerca «${q}» su TMDB`}
                </button>
              ) : tmdb.length === 0 ? (
                <p className="g-nota">TMDB non trova niente.</p>
              ) : (
                <>
                  <p className="g-etichetta">Da TMDB · non entra nel catalogo</p>
                  <ul className="p-tab__film">
                    {tmdb.map(t => {
                      const src = immagineTmdb(t.poster_path, 'w92');
                      return (
                        <li key={t.id}>
                          <button type="button" className="p-film" onClick={() => void prendi(t)}>
                            {src ? <img className="p-film__locandina" src={src} alt="" /> : <span className="p-film__locandina" />}
                            <span className="p-film__testo">
                              <span className="p-film__titolo">{t.title}</span>
                              <span className="p-film__dati num">{t.release_date?.slice(0, 4) ?? ''}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
