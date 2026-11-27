'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAvviso } from '../Avviso';
import Finestra from '../Finestra';
import { breve, immagineTmdb } from '../immagini';
import type { Trovato } from '../tmdb/leggi';
import { cercaPerCorreggere, conferma, correggi, togli, type VoceCatalogo } from './azioni';

const STATI: Record<string, string> = {
  pending: 'In attesa di TMDB',
  ok: 'Abbinato da Plex',
  fixed: 'Confermato a mano',
  suspect: 'Da verificare',
  missing: 'Non trovato su TMDB',
};

/**
 * Un film del catalogo: è quello giusto? Se sì si conferma, se no si collega
 * a mano al film TMDB giusto. Da qui si apre anche la sua scheda.
 */
export default function SchedaCatalogo({ film, onCambiato, onTolto, onChiudi }: {
  film: VoceCatalogo;
  onCambiato: (f: VoceCatalogo) => void;
  onTolto: (id: number) => void;
  onChiudi: () => void;
}) {
  const di = useAvviso();
  const [correggo, setCorreggo] = useState(!film.tmdbId);
  const [testo, setTesto] = useState(film.title);
  const [trovati, setTrovati] = useState<Trovato[] | null>(null);
  const [lavoro, setLavoro] = useState<'conferma' | 'cerca' | 'correggi' | 'togli' | null>(null);
  const [chiediTogli, setChiediTogli] = useState(false);

  const dubbio = film.verifyStatus === 'suspect' || film.verifyStatus === 'missing';
  const fondale = immagineTmdb(film.backdropPath, 'w780');
  const locandina = immagineTmdb(film.posterPath, 'w342');
  const durata = film.runtime ?? film.durationMin;

  const ok = async () => {
    setLavoro('conferma');
    const r = await conferma(film.id);
    setLavoro(null);
    if (!r.ok) return di(r.errore, 'errore');
    di(`«${film.title}»: abbinamento confermato.`);
    onCambiato({ ...film, verifyStatus: 'fixed' });
  };

  const cerca = async (e: React.FormEvent) => {
    e.preventDefault();
    setLavoro('cerca');
    const r = await cercaPerCorreggere(testo || film.title);
    setLavoro(null);
    if (!r.ok) return di(r.errore, 'errore');
    setTrovati(r.trovati.slice(0, 12));
  };

  const collega = async (t: Trovato) => {
    setLavoro('correggi');
    const r = await correggi(film.id, String(t.id));
    setLavoro(null);
    if (!r.ok) return di(r.errore, 'errore');
    di(`«${film.title}» ora è collegato a «${t.title}».`);
    setCorreggo(false);
    setTrovati(null);
    onCambiato(r.film);
  };

  const via = async () => {
    setChiediTogli(false);
    setLavoro('togli');
    const r = await togli(film.id);
    setLavoro(null);
    if (!r.ok) return di(r.errore, 'errore');
    di(`«${film.title}» tolto dal catalogo.`);
    onTolto(film.id);
  };

  return (
    <article className="g-cat-scheda" aria-labelledby="g-cat-titolo">
      <div className="g-cat-scheda__fondale" data-slot aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {fondale && <img src={fondale} alt="" />}
      </div>
      <button type="button" className="g-tasto g-tasto--piccolo g-tasto--tondo g-cat-scheda__chiudi" onClick={onChiudi} aria-label="Chiudi">×</button>

      <header className="g-cat-scheda__testa">
        <span className="g-cat-scheda__locandina" data-slot>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {locandina && <img src={locandina} alt="" />}
        </span>
        <div>
          <p className="g-occhiello" data-allarme={dubbio || undefined}>{STATI[film.verifyStatus] ?? film.verifyStatus}</p>
          <h2 id="g-cat-titolo" className="g-scheda__titolo">{film.title}</h2>
          <p className="g-nota num">
            {[film.year, durata ? `${durata}′` : null, film.director].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>

      <dl className="g-dati">
        {film.tmdbTitle && film.tmdbTitle !== film.title && (<><dt>Su TMDB</dt><dd>{film.tmdbTitle}{film.tmdbId ? <span className="num"> · {film.tmdbId}</span> : null}</dd></>)}
        {film.originalTitle && film.originalTitle !== film.title && (<><dt>Titolo originale</dt><dd>{film.originalTitle}</dd></>)}
        {film.genres.length > 0 && (<><dt>Generi</dt><dd>{film.genres.join(', ')}</dd></>)}
        {!!film.voteAverage && (<><dt>Voto TMDB</dt><dd className="num">{film.voteAverage.toFixed(1)}</dd></>)}
        {film.awardLabels.length > 0 && (<><dt>Premi</dt><dd>{film.awardLabels.slice(0, 4).join(' · ')}</dd></>)}
        <dt>Plex</dt>
        <dd>{film.inPlex ? `${film.plexLibraries.join(' e ') || 'in libreria'}${film.addedAt ? `, dal ${breve(film.addedAt)}` : ''}` : 'non è in libreria'}</dd>
        <dt>In sala</dt>
        <dd className="num">{film.programmato ? `${film.programmato} spettacoli` : 'mai programmato'}</dd>
      </dl>

      {film.overview && <p className="g-testo">{film.overview}</p>}

      {dubbio && (
        <p className="g-avviso">
          {film.tmdbId
            ? 'L’abbinamento con TMDB è stato indovinato: guarda locandina e dati, poi conferma o correggi.'
            : 'Nessun abbinamento con TMDB: cerca qui sotto il film giusto.'}
        </p>
      )}

      <div className="g-cat-scheda__azioni">
        {dubbio && film.tmdbId && (
          <button type="button" className="g-tasto g-tasto--pieno" onClick={ok} disabled={lavoro !== null}>{lavoro === 'conferma' ? 'Confermo…' : 'Sì, è lui'}</button>
        )}
        {film.tmdbId && <Link className="g-tasto" href={`/admin/programma?tmdb=${film.tmdbId}`}>Programma</Link>}
        {film.tmdbId && <Link className="g-tasto" href={`/admin/film?tmdb=${film.tmdbId}`}>Scheda del film</Link>}
        <button type="button" className="g-tasto" onClick={() => setCorreggo(v => !v)} aria-expanded={correggo}>
          {correggo ? 'Chiudi la correzione' : 'Film sbagliato? Correggi'}
        </button>
      </div>

      {correggo && (
        <div className="g-correggi">
          <form className="g-correggi__cerca" onSubmit={cerca}>
            <input type="search" value={testo} onChange={e => setTesto(e.target.value)} placeholder="Titolo, oppure id TMDB" aria-label="Cerca il film giusto" />
            <button type="submit" className="g-tasto" disabled={lavoro !== null}>{lavoro === 'cerca' ? 'Cerco…' : 'Cerca'}</button>
          </form>
          {trovati?.length === 0 && <p className="g-nota">Nessun film con questo nome.</p>}
          {!!trovati?.length && (
            <div className="g-griglia" data-tipo="locandina">
              {trovati.map(t => {
                const p = immagineTmdb(t.poster_path, 'w185');
                return (
                  <button key={t.id} type="button" className="g-griglia__voce" onClick={() => collega(t)} disabled={lavoro !== null} aria-current={String(t.id) === film.tmdbId || undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p ? <img src={p} alt="" loading="lazy" /> : <span className="g-griglia__vuoto" />}
                    <span>{t.title}{t.release_date ? ` (${t.release_date.slice(0, 4)})` : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <footer className="g-cat-scheda__piede">
        <button type="button" className="g-tasto g-tasto--allarme" onClick={() => setChiediTogli(true)} disabled={lavoro !== null}>Togli dal catalogo</button>
      </footer>

      {chiediTogli && (
        <Finestra titolo={`Togliere «${film.title}» dal catalogo?`} onChiudi={() => setChiediTogli(false)}>
          <p className="g-testo">Sparisce dal catalogo. Gli spettacoli già in sala non si toccano; se il film è ancora in Plex, la prossima sync lo rimette.</p>
          <div className="g-finestra__azioni">
            <button type="button" className="g-tasto" onClick={() => setChiediTogli(false)}>Annulla</button>
            <button type="button" className="g-tasto g-tasto--allarme" onClick={via}>Togli</button>
          </div>
        </Finestra>
      )}
    </article>
  );
}
