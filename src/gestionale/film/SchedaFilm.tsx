'use client';

import { useEffect, useState } from 'react';
import { useAvviso } from '../Avviso';
import Finestra from '../Finestra';
import { anteprimaYouTube, giorno, immagineTmdb, ora } from '../immagini';
import { LINGUE, SOTTOTITOLI } from '../tmdb/scelte';
import { premiFilm, rileggiFilm, salvaFilm, tornaTmdbFilm, type FilmAperto, type Premio } from './azioni';
import Scegli, { type Tipo } from './Scegli';
import { cambiato, moduloDa, type Modulo } from './scheda';

const DIVIETI = ['T', '6+', '10+', '14+', '18+'];
const LINGUE_VERSIONE = ['ITALIANO', ...Object.values(LINGUE).filter(l => l !== 'ITALIANO')];

const CAMPO_DI: Record<Exclude<Tipo, 'trailer'>, 'customPosterPath' | 'customBackdropPath' | 'customLogoPath'> = {
  locandina: 'customPosterPath',
  fondale: 'customBackdropPath',
  logo: 'customLogoPath',
};

/**
 * La scheda di un film come la scrive Gio. Quello che si salva qui vince su
 * TMDB: la sync non lo riscrive più, e sito, app e Pretix lo vedono subito.
 */
export default function SchedaFilm({ aperto, onSporco, onSalvato, onAggiornato, onChiudi }: {
  aperto: FilmAperto;
  onSporco: (sporco: boolean) => void;
  onSalvato: () => void;
  onAggiornato: (a: FilmAperto) => void;
  onChiudi: () => void;
}) {
  const di = useAvviso();
  const { scheda, tmdb, spettacoli } = aperto;
  const [salvato, setSalvato] = useState<Modulo>(() => moduloDa(scheda));
  const [m, setM] = useState<Modulo>(salvato);
  const [premi, setPremi] = useState<Premio[]>(aperto.premi);
  const [scegli, setScegli] = useState<Tipo | null>(null);
  const [lavoro, setLavoro] = useState<'salva' | 'rileggi' | 'torna' | 'premi' | null>(null);
  const [chiedi, setChiedi] = useState<'rileggi' | 'torna' | null>(null);

  const sporco = cambiato(salvato, m);
  useEffect(() => onSporco(sporco), [sporco, onSporco]);

  const metti = <K extends keyof Modulo>(k: K, v: Modulo[K]) => setM(x => ({ ...x, [k]: v }));

  const salva = async () => {
    setLavoro('salva');
    const r = await salvaFilm(scheda.tmdbId, m);
    setLavoro(null);
    if (!r.ok) return di(r.errore, 'errore');
    setSalvato(m);
    di(r.pretix ? `«${m.customTitle || 'Il film'}» salvato: sito, app e Pretix lo vedono subito.` : 'Salvato sul sito. Pretix non ha risposto: si allinea con la sync della notte.', r.pretix ? 'ok' : 'errore');
    onSalvato();
  };

  const rileggi = async (torna: boolean) => {
    setChiedi(null);
    setLavoro(torna ? 'torna' : 'rileggi');
    const r = torna ? await tornaTmdbFilm(scheda.tmdbId) : await rileggiFilm(scheda.tmdbId);
    setLavoro(null);
    if (!r.ok) return di(r.errore, 'errore');
    di(torna ? 'La scheda è tornata quella di TMDB.' : 'Riletto da TMDB: i tuoi testi sono rimasti.');
    onAggiornato(r);
    onSalvato();
  };

  const aggiornaPremi = async () => {
    setLavoro('premi');
    const r = await premiFilm(scheda.tmdbId);
    setLavoro(null);
    if (!r.ok) return di(r.errore, 'errore');
    setPremi(r.premi);
    di(r.premi.length ? `Premi riletti da MUBI: ${r.premi.length}.` : 'MUBI non conosce premi per questo film.');
  };

  const futuri = spettacoli.filter(s => Date.parse(s.dateFrom) >= Date.now());
  const locandina = immagineTmdb(m.customPosterPath || tmdb?.locandina, 'w185');
  const titolo = m.customTitle || tmdb?.titolo || `TMDB ${scheda.tmdbId}`;

  const immagine = (tipo: Exclude<Tipo, 'trailer'>, nome: string) => {
    const campo = CAMPO_DI[tipo];
    const valore = m[campo];
    const nascosto = valore === 'none';
    const daTmdb = tmdb && valore === (tipo === 'locandina' ? tmdb.locandina : tipo === 'fondale' ? tmdb.fondale : tmdb.logo);
    const src = immagineTmdb(valore, tipo === 'locandina' ? 'w185' : 'w300');
    return (
      <div className="g-imm" data-tipo={tipo}>
        <span className="g-imm__testa">
          <span className="g-etichetta">{nome}</span>
          {valore && !nascosto && <span className="g-segno" data-tuo={!daTmdb || undefined}>{daTmdb ? 'da TMDB' : 'tua'}</span>}
        </span>
        <button type="button" className="g-imm__vista" onClick={() => setScegli(tipo)} disabled={nascosto} aria-label={`${nome}: scegli da TMDB`}>
          {nascosto ? <span>Nascosto: il sito scrive il titolo</span> : src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" loading="lazy" />
          ) : <span>Nessuna immagine</span>}
        </button>
        <span className="g-imm__riga">
          <input value={nascosto ? '' : valore} disabled={nascosto} onChange={e => metti(campo, e.target.value)} placeholder="/percorso.jpg o indirizzo" aria-label={`${nome}: percorso`} />
          {tipo === 'logo' && (
            <button type="button" className="g-tasto g-tasto--piccolo" onClick={() => metti(campo, nascosto ? tmdb?.logo ?? '' : 'none')}>
              {nascosto ? 'Mostra' : 'Nascondi'}
            </button>
          )}
        </span>
      </div>
    );
  };

  const trailer = anteprimaYouTube(m.customTrailerUrl);

  return (
    <section className="g-scheda" aria-labelledby="g-scheda-titolo">
      <header className="g-scheda__testa">
        <span className="g-scheda__locandina" data-slot>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {locandina && <img src={locandina} alt="" />}
        </span>
        <div>
          <p className="g-occhiello">{scheda.isManualOverride ? 'Scheda tua: vince su TMDB' : 'Scheda presa da TMDB'}</p>
          <h2 id="g-scheda-titolo" className="g-scheda__titolo">{titolo}</h2>
          <p className="g-nota num">
            {[tmdb?.uscita?.slice(0, 4), tmdb?.titoloOriginale && tmdb.titoloOriginale !== titolo ? tmdb.titoloOriginale : null, scheda.runtime ? `${scheda.runtime}′` : null, `TMDB ${scheda.tmdbId}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button type="button" className="g-tasto g-tasto--piccolo g-tasto--tondo" onClick={onChiudi} aria-label="Chiudi la scheda">×</button>
      </header>

      <div className="g-scheda__corpo">
        <fieldset className="g-gruppo">
          <legend>Come si presenta</legend>
          <label className="g-campo"><span>Titolo</span>
            <input value={m.customTitle} onChange={e => metti('customTitle', e.target.value)} placeholder={tmdb?.titolo} />
          </label>
          <label className="g-campo"><span>Motto</span>
            <input value={m.tagline} onChange={e => metti('tagline', e.target.value)} placeholder={tmdb?.motto || 'Una riga, sotto il titolo'} />
          </label>
          <label className="g-campo"><span>Trama</span>
            <textarea rows={6} value={m.customOverview} onChange={e => metti('customOverview', e.target.value)} />
          </label>
          <div className="g-due">
            <label className="g-campo"><span>Regia</span>
              <input value={m.customDirector} onChange={e => metti('customDirector', e.target.value)} placeholder="Separati da virgola" />
            </label>
            <label className="g-campo"><span>Cast</span>
              <input value={m.customCast} onChange={e => metti('customCast', e.target.value)} placeholder="Separati da virgola" />
            </label>
          </div>
        </fieldset>

        <fieldset className="g-gruppo">
          <legend>La copia in sala</legend>
          <div className="g-quattro">
            <label className="g-campo"><span>Lingua</span>
              <select value={m.versionLanguage} onChange={e => metti('versionLanguage', e.target.value)}>
                {[...new Set([...LINGUE_VERSIONE, m.versionLanguage])].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="g-campo"><span>Sottotitoli</span>
              <select value={m.subtitles} onChange={e => metti('subtitles', e.target.value)}>
                {[...new Set([...SOTTOTITOLI, m.subtitles])].map(s => <option key={s} value={s}>{s === 'NESSUNO' ? 'Nessuno' : s}</option>)}
              </select>
            </label>
            <label className="g-campo"><span>Età</span>
              <select value={m.customRating} onChange={e => metti('customRating', e.target.value)}>
                {[...new Set([...DIVIETI, m.customRating])].map(d => <option key={d} value={d}>{d === 'T' ? 'T · per tutti' : d}</option>)}
              </select>
            </label>
            <label className="g-campo"><span>Sala</span>
              <input value={m.customRoomName} onChange={e => metti('customRoomName', e.target.value)} placeholder="Come su Pretix" />
            </label>
          </div>
          <label className="g-interruttore">
            <input type="checkbox" checked={m.manualSoldOut} onChange={e => metti('manualSoldOut', e.target.checked)} />
            <span><b>Tutto esaurito a mano</b> Il sito mostra il film esaurito qualunque cosa dica Pretix.</span>
          </label>
        </fieldset>

        <fieldset className="g-gruppo">
          <legend>Immagini</legend>
          <div className="g-immagini">
            {immagine('locandina', 'Locandina')}
            {immagine('fondale', 'Fondale')}
            {immagine('logo', 'Logo')}
          </div>
        </fieldset>

        <fieldset className="g-gruppo">
          <legend>Trailer</legend>
          <div className="g-trailer">
            <button type="button" className="g-imm__vista" data-tipo="fondale" onClick={() => setScegli('trailer')} aria-label="Scegli il trailer da TMDB">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {trailer ? <img src={trailer} alt="" loading="lazy" /> : <span>Nessun trailer</span>}
            </button>
            <div className="g-trailer__campi">
              <label className="g-campo"><span>Indirizzo YouTube</span>
                <input value={m.customTrailerUrl} onChange={e => metti('customTrailerUrl', e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
              </label>
              <label className="g-campo"><span>Come si chiama sul sito</span>
                <input value={m.customTrailerTitle} onChange={e => metti('customTrailerTitle', e.target.value)} placeholder="Trailer ufficiale" />
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset className="g-gruppo">
          <legend>Premi</legend>
          {premi.length === 0 ? <p className="g-nota">Nessun premio salvato.</p> : (
            <ul className="g-premi">
              {premi.map((p, i) => (
                <li key={`${p.type}-${i}`}><b>{p.label}</b>{p.year ? <span className="num"> · {p.year}</span> : null}{p.details && <p>{p.details}</p>}</li>
              ))}
            </ul>
          )}
          <button type="button" className="g-tasto g-tasto--piccolo" onClick={aggiornaPremi} disabled={lavoro !== null}>
            {lavoro === 'premi' ? 'Leggo MUBI…' : 'Aggiorna i premi da MUBI'}
          </button>
        </fieldset>

        {futuri.length > 0 && (
          <fieldset className="g-gruppo">
            <legend>In sala · <span className="num">{futuri.length}</span></legend>
            <ul className="g-spettacoli">
              {futuri.map(s => (
                <li key={s.pretixId} className="num">
                  <span>{giorno(s.dateFrom)}</span>
                  <b>{ora(s.dateFrom)}</b>
                  <span>{s.roomName || 'Sala'}</span>
                  <span>{s.isSoldOut ? 'esaurito' : `${s.availableSeats ?? '?'} / ${s.totalSeats ?? '?'} liberi`}</span>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </div>

      <footer className="g-scheda__piede" data-sporco={sporco || undefined}>
        <span className="g-nota">{sporco ? 'Modifiche non salvate' : 'Tutto salvato'}</span>
        <span className="g-scheda__azioni">
          <button type="button" className="g-tasto" onClick={() => setChiedi('rileggi')} disabled={lavoro !== null}>
            {lavoro === 'rileggi' ? 'Rileggo…' : 'Rileggi da TMDB'}
          </button>
          {scheda.isManualOverride && (
            <button type="button" className="g-tasto" onClick={() => setChiedi('torna')} disabled={lavoro !== null}>
              {lavoro === 'torna' ? 'Torno…' : 'Torna come su TMDB'}
            </button>
          )}
          <button type="button" className="g-tasto g-tasto--pieno" onClick={salva} disabled={!sporco || lavoro !== null}>
            {lavoro === 'salva' ? 'Salvo…' : 'Salva'}
          </button>
        </span>
      </footer>

      {scegli && (
        <Scegli
          tmdbId={scheda.tmdbId}
          tipo={scegli}
          attuale={scegli === 'trailer' ? m.customTrailerUrl : m[CAMPO_DI[scegli]]}
          onScelto={v => (scegli === 'trailer' ? metti('customTrailerUrl', v) : metti(CAMPO_DI[scegli], v))}
          onChiudi={() => setScegli(null)}
        />
      )}

      {chiedi && (
        <Finestra titolo={chiedi === 'rileggi' ? 'Rileggere da TMDB?' : 'Tornare come su TMDB?'} onChiudi={() => setChiedi(null)}>
          <p className="g-testo">
            {chiedi === 'rileggi'
              ? `Rileggo il film da TMDB e completo quello che manca. I tuoi testi restano.${sporco ? ' Le modifiche non salvate in questa scheda si perdono.' : ''}`
              : 'Titolo, trama, immagini e trailer tornano quelli di TMDB, su sito, app e Pretix. Lingua, sottotitoli, sala ed esaurito restano come sono.'}
          </p>
          <div className="g-finestra__azioni">
            <button type="button" className="g-tasto" onClick={() => setChiedi(null)}>Annulla</button>
            <button type="button" className="g-tasto g-tasto--pieno" onClick={() => rileggi(chiedi === 'torna')}>
              {chiedi === 'rileggi' ? 'Rileggi' : 'Torna come su TMDB'}
            </button>
          </div>
        </Finestra>
      )}
    </section>
  );
}
