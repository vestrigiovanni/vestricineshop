'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useTrailer } from '@/context/TrailerContext';
import { toCinemaDayKey } from '@/utils/cinemaDate';
import { resolveFestival } from './festivals';
import { trailerOf, weighAward } from './programma';
import { Film, FilmLogo, Show, crediti, giornoBreve, lingua, maiuscola, ora, quando, tecnica } from './shared';
import base from './Home.module.css';
import s from './SchedaFilm.module.css';

/** Oltre questi caratteri la trama si chiude su tre righe, con "Altro". */
const TRAMA_CORTA = 180;

/**
 * La scheda intera di un film, dentro l'apertura: ci si arriva da qualunque
 * Prenota della pagina. I premi coi loghi dei festival, il logo, i crediti e
 * come si proietta, la trama (col cast, aprendola), i giorni di proiezione coi
 * loro orari, e Prenota, che apre il cassetto sullo spettacolo scelto.
 * Così era la hero prima del 18 ottobre 2026, e Giovanni l'ha rivoluta.
 */
export default function SchedaFilm({ film, show, now, onApri }: { film: Film; show: Show; now: Date; onApri: (show: Show, film: Film) => void }) {
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

  // I premi più importanti, col logo del festival: al massimo quattro.
  const premi = useMemo(() => (film.awards || []).map(weighAward).sort((a, b) => b.weight - a.weight).slice(0, 4), [film.awards]);

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

  const dati = [...crediti(film), sel ? lingua(sel) : '', ...(sel ? tecnica(sel) : [])].filter(Boolean);
  const lunga = (film.overview || '').length > TRAMA_CORTA;

  return (
    <div className={s.scheda}>
      {premi.length > 0 && (
        <ul className={s.premi} aria-label="Premi">
          {premi.map(p => {
            const f = resolveFestival(p.type);
            return (
              <li key={`${p.type}-${p.year}-${p.prize}`} className={s.premio}>
                <Image src={f.logo} alt="" width={52} height={52} sizes="52px" className={s.festival} />
                {/* Il premio solo se vinto: una candidatura alla Palma d'oro non è una Palma d'oro. */}
                <span className={s.premioNome}>{p.won.length ? maiuscola(p.prize) : p.nominated.length ? 'Candidatura' : 'Selezione ufficiale'}</span>
                <span className={s.premioDove}>{!p.won.length && p.nominated.length ? `${maiuscola(p.prize)}, ` : ''}{f.breve}{p.year ? ` ${p.year}` : ''}</span>
              </li>
            );
          })}
        </ul>
      )}

      <p className={s.quando}>{sel ? quando(sel, now) : 'Nessuno spettacolo in programma'}</p>
      <h2 id="apertura-titolo" ref={titolo} tabIndex={-1} className={s.titolo}>
        <FilmLogo film={film} className={s.logo} priority sizes="(max-width: 860px) 80vw, 520px" />
      </h2>
      {dati.length > 0 && <p className={s.dati}>{dati.join(' · ')}</p>}

      {film.overview && (
        <div className={s.trama}>
          <p className={tutta || !lunga ? s.tramaTutta : s.tramaCorta}>{film.overview}</p>
          {tutta && film.cast && film.cast.length > 0 && <p className={s.cast}><span>Con</span> {film.cast.join(', ')}</p>}
          {lunga && (
            <button type="button" className={s.altro} onClick={() => setTutta(v => !v)} aria-expanded={tutta}>
              {tutta ? 'Meno' : 'Altro'}
            </button>
          )}
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
            {delGiorno.shows.map(x => (
              <button key={x.id} type="button" className={s.ora} aria-pressed={x.id === sel?.id} disabled={x.isSoldOut} onClick={() => setScelta(x.id)}>
                {ora(x)}{x.isSoldOut && <span className={s.esauritoOra}> · Esaurito</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={s.azioni}>
        {sel && !sel.isSoldOut ? (
          <button type="button" className={base.prenota} onClick={() => onApri(sel, film)} aria-label={`Prenota ${film.title}, ${quando(sel, now).toLowerCase()}`}>
            Prenota
          </button>
        ) : (
          <span className={base.esaurito}>Esaurito</span>
        )}
        {trailer && <button type="button" className={base.prenotaLink} onClick={() => openTrailer(trailer)}>Guarda il trailer</button>}
      </div>
    </div>
  );
}
