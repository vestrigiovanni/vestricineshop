'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from '@/components/Immagine';
import { useTrailer } from '@/context/TrailerContext';
import { toCinemaDayKey } from '@/utils/cinemaDate';
import { trailerOf } from './programma';
import { Posti, Premi, Quando } from './Dati';
import { crediti, divieto, divietoEsteso, generi, lingua, posti, tecnica, titoloOriginale, unisci, voto } from './metadati';
import { Film, FilmLogo, Show, giornoBreve, img, ora, quando } from './shared';
import base from './Home.module.css';
import s from './SchedaFilm.module.css';

/** Oltre questi caratteri la trama si chiude su poche righe, con "Altro". */
const TRAMA_CORTA = 180;
/** Quanti fotogrammi del film si possono sfogliare (il primo è il fondale di sempre). */
const FOTOGRAMMI = 5;

interface Props {
  film: Film;
  show: Show;
  now: Date;
  onApri: (show: Show, film: Film) => void;
  /** Il fotogramma che fa da fondale adesso, e come cambiarlo. */
  fotogramma: string;
  onFotogramma: (path: string) => void;
}

/**
 * La scheda intera di un film, dentro l'apertura: ci si arriva da qualunque
 * Prenota della pagina. Qui c'è tutto quello che il catalogo e TMDB sanno del
 * film: i premi coi loghi dei festival, il logo, il motto, il titolo
 * originale, regia anno durata e generi, la versione di questo spettacolo
 * (lingua, sottotitoli, come si proietta), il divieto, il voto, la trama e il
 * cast, i fotogrammi (quello scelto diventa il fondale), i giorni di
 * proiezione coi loro orari e i posti, e Prenota, che apre il cassetto sullo
 * spettacolo scelto.
 * Così era la hero prima del 18 ottobre 2026, e Giovanni l'ha rivoluta.
 */
export default function SchedaFilm({ film, show, now, onApri, fotogramma, onFotogramma }: Props) {
  const { openTrailer } = useTrailer();
  const titolo = useRef<HTMLHeadingElement>(null);
  const trailer = trailerOf(film);

  const futuri = useMemo(() => film.subevents.filter(x => new Date(x.date) >= now).sort((a, b) => a.date.localeCompare(b.date)), [film, now]);
  const giorni = useMemo(() => {
    const out: { key: string; shows: Show[] }[] = [];
    for (const x of futuri) {
      const key = toCinemaDayKey(x.date);
      const g = out[out.length - 1];
      if (g && g.key === key) g.shows.push(x);
      else out.push({ key, shows: [x] });
    }
    return out;
  }, [futuri]);

  // Lo spettacolo scelto: quello del Prenota premuto, se si può ancora prenotare.
  const [scelta, setScelta] = useState<number | null>(() => {
    const giusto = futuri.find(x => x.id === show.id && !x.isSoldOut) || futuri.find(x => !x.isSoldOut) || futuri[0];
    return giusto ? giusto.id : null;
  });
  const sel = futuri.find(x => x.id === scelta) || null;
  const [giorno, setGiorno] = useState(() => (sel ? toCinemaDayKey(sel.date) : giorni[0]?.key));
  const delGiorno = giorni.find(g => g.key === giorno) || giorni[0];
  const [tutta, setTutta] = useState(false);

  // Chi è arrivato qui da un Prenota più in basso deve ritrovarsi sulla scheda, anche con la tastiera.
  useEffect(() => {
    const metti = () => titolo.current?.focus({ preventScroll: true });
    if (scrollY < 4) { metti(); return; }
    const t = window.setTimeout(metti, 900);
    return () => clearTimeout(t);
  }, []);

  const scegliGiorno = (key: string) => {
    setGiorno(key);
    const g = giorni.find(x => x.key === key);
    const primo = g?.shows.find(x => !x.isSoldOut) || g?.shows[0];
    if (primo) setScelta(primo.id);
  };

  const motto = (film.tagline || '').trim();
  const originale = titoloOriginale(film);
  const ilFilm = unisci([...crediti(film), ...generi(film)]);
  const versione = sel ? unisci([lingua(sel), ...tecnica(sel)]) : '';
  const vietato = divieto(film);
  const punti = voto(film);
  const lunga = (film.overview || '').length > TRAMA_CORTA;
  const cast = (film.cast || []).filter(Boolean).slice(0, 5);
  const fotogrammi = [film.backdrop_path, ...(film.extraBackdrops || [])].filter((p, i, tutti): p is string => !!p && tutti.indexOf(p) === i).slice(0, FOTOGRAMMI);

  return (
    <div className={s.scheda}>
      <Premi film={film} className={s.premi} />

      <h2 id="apertura-titolo" ref={titolo} tabIndex={-1} className={s.titolo}>
        <FilmLogo film={film} className={s.logo} subito sizes="(max-width: 860px) 80vw, 520px" />
      </h2>
      {(motto || originale) && (
        <p className={s.motto}>
          {motto && <q>{motto}</q>}
          {originale && <span className={s.originale}>{originale}</span>}
        </p>
      )}

      {sel ? <Quando show={sel} now={now} className={s.quando} /> : <p className={`${base.quando} ${s.quando}`}>Nessuno spettacolo in programma</p>}
      <div className={s.dati}>
        {ilFilm && <p className={base.riga}>{ilFilm}</p>}
        {(versione || vietato || punti) && (
          <p className={base.riga}>
            {versione}
            {vietato && <>{versione ? ' · ' : ''}<abbr className={base.divieto} title={divietoEsteso(film)}>{vietato}</abbr></>}
            {punti && <>{versione || vietato ? ' · ' : ''}<span className={s.voto} title="Il voto medio su TMDB"><strong>{punti}</strong> su TMDB</span></>}
          </p>
        )}
      </div>

      {film.overview && (
        <div className={s.trama}>
          <p className={tutta || !lunga ? s.tramaTutta : s.tramaCorta}>{film.overview}</p>
          {cast.length > 0 && <p className={s.cast} data-aperta={tutta || !lunga ? '' : undefined}><span>Con</span> {cast.join(', ')}</p>}
          {lunga && (
            <button type="button" className={s.altro} onClick={() => setTutta(v => !v)} aria-expanded={tutta}>
              {tutta ? 'Meno' : 'Altro'}
            </button>
          )}
        </div>
      )}

      {fotogrammi.length > 1 && (
        <div className={s.fotogrammi} role="group" aria-label="I fotogrammi del film: quello scelto fa da fondale">
          {fotogrammi.map((path, i) => (
            <button key={path} type="button" className={s.fotogramma} aria-pressed={path === fotogramma} aria-label={`Fotogramma ${i + 1} di ${fotogrammi.length}`} onClick={() => onFotogramma(path)}>
              <Image src={img(path, 'w300')} alt="" fill sizes="112px" />
            </button>
          ))}
        </div>
      )}

      {giorni.length > 0 && (
        <div className={s.orari}>
          {giorni.length > 1 && (
            <div className={s.giorni} role="group" aria-label="Giorni di proiezione">
              {giorni.map(g => (
                <button key={g.key} type="button" className={s.giorno} aria-pressed={g.key === delGiorno.key} onClick={() => scegliGiorno(g.key)}>
                  {giornoBreve(g.shows[0].date, now)}
                </button>
              ))}
            </div>
          )}
          <div className={s.ore} role="group" aria-label={`Orari, ${giornoBreve(delGiorno.shows[0].date, now).toLowerCase()}`}>
            {delGiorno.shows.map(x => {
              const p = posti(x);
              return (
                <button key={x.id} type="button" className={s.ora} aria-pressed={x.id === sel?.id} disabled={x.isSoldOut} onClick={() => setScelta(x.id)}>
                  {ora(x)}{p.stato !== 'liberi' && <span className={s.notaOra}> · {p.testo}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={s.azioni}>
        {sel && !sel.isSoldOut ? (
          <>
            <button type="button" className={base.prenota} onClick={() => onApri(sel, film)} aria-label={`Prenota ${film.title}, ${quando(sel, now).toLowerCase()}`}>
              Prenota
            </button>
            <Posti show={sel} sempre />
          </>
        ) : (
          sel ? <Posti show={sel} className={base.esaurito} /> : <span className={base.esaurito}>Esaurito</span>
        )}
        {trailer && <button type="button" className={base.prenotaLink} onClick={() => openTrailer(trailer)}>Guarda il trailer</button>}
      </div>
    </div>
  );
}
