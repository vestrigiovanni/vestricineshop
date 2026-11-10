'use client';

import Image from 'next/image';
import {
  cartellino, divietoEsteso, posti, premi, premio, quando, sala,
  type Film, type Premio as PremioDati, type Show,
} from './metadati';
import base from './Home.module.css';

/**
 * Il sistema dei metadati, la parte che si vede: un solo modo, riusato da ogni
 * atto, per scrivere quando e dove, i crediti, la versione, i premi coi loghi
 * dei festival e i posti. Le parole le decide `metadati.ts` (coi suoi test);
 * qui c'è solo come si disegnano. Un dato che manca non lascia niente: né una
 * riga vuota né un separatore.
 */

/** "Oggi alle 20:30", e accanto la sala: "Sala Ca Granda". */
export function Quando({ show, now, className = '', conSala = true }: { show: Show; now: Date; className?: string; conSala?: boolean }) {
  const dove = conSala ? sala(show) : '';
  return (
    <p className={`${base.quando} ${className}`}>
      <time dateTime={show.date}>{quando(show, now)}</time>
      {dove && <span className={base.sala}>{dove}</span>}
    </p>
  );
}

/** Il logo di un festival: quadrato, intero, con il suo nome per chi ascolta la pagina. */
function Festival({ p, lato }: { p: PremioDati; lato: number }) {
  return <Image src={p.festival.logo} alt={p.festival.name} width={lato} height={lato} sizes={`${lato}px`} className={base.festival} />;
}

/** Il riconoscimento più importante in una riga, col logo del suo festival. */
export function Premio({ film, className = '' }: { film: Film; className?: string }) {
  const p = premio(film);
  if (!p) return null;
  return (
    <p className={`${base.premio} ${className}`}>
      <Festival p={p} lato={28} />
      <span><strong>{p.titolo}</strong>{p.dove}</span>
    </p>
  );
}

/** I riconoscimenti del film, fino a quattro, ognuno sotto il logo del suo festival. */
export function Premi({ film, className = '', quanti = 4 }: { film: Film; className?: string; quanti?: number }) {
  const lista = premi(film, quanti);
  if (!lista.length) return null;
  return (
    <ul className={`${base.premi} ${className}`} aria-label="Premi e festival">
      {lista.map(p => (
        <li key={p.chiave} className={base.premioVoce}>
          {/* Passandoci sopra col mouse, il logo dice il suo festival per intero. */}
          <span className={base.festivalNome} data-nome={p.festival.name}><Festival p={p} lato={52} /></span>
          <strong>{p.titolo}</strong>
          <span>{p.dove}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * I posti. "Esaurito" e "Ultimo posto" si dicono sempre; "Posti disponibili"
 * solo dove c'è spazio per dirlo (`sempre`), perché altrove lo dice già Prenota.
 */
export function Posti({ show, sempre = false, className = '' }: { show: Show; sempre?: boolean; className?: string }) {
  const p = posti(show);
  if (p.stato === 'liberi' && !sempre) return null;
  return <span className={`${base.posti} ${className}`} data-stato={p.stato}>{p.testo}</span>;
}

type Parte = 'film' | 'versione' | 'generi' | 'premio';

/**
 * Il cartellino di un film: le stesse righe in ogni atto, come le etichette di
 * una collezione. Regia, anno e durata; lingua, sottotitoli e come si proietta
 * (col divieto, se c'è); il premio col logo del festival.
 */
export function Cartellino({ film, show, now, parti = ['film', 'versione', 'premio'], className = '' }: { film: Film; show: Show; now: Date; parti?: Parte[]; className?: string }) {
  const c = cartellino(film, show, now);
  const vietato = divietoEsteso(film);
  return (
    <div className={`${base.cartellino} ${className}`}>
      {parti.map(parte => {
        if (parte === 'film') return c.film && <p key={parte} className={base.riga}>{c.film}</p>;
        if (parte === 'generi') return c.generi && <p key={parte} className={base.riga}>{c.generi}</p>;
        if (parte === 'premio') return <Premio key={parte} film={film} />;
        return (c.versione || c.divieto) && (
          <p key={parte} className={base.riga}>
            {c.versione}
            {c.divieto && <>{c.versione ? ' · ' : ''}<abbr className={base.divieto} title={vietato}>{c.divieto}</abbr></>}
          </p>
        );
      })}
    </div>
  );
}
