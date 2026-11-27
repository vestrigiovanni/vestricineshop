/* eslint-disable @next/next/no-img-element */
import { sala, type Film } from '../home/metadati';
import { trailerOf } from '../home/programma';
import { Logo, Posti, Prenota, type Ancora } from '../home/pezzi';
import { ogniGiorno, type SpecialeInSala } from './proiezioneSpeciale';
import { logoTestata } from './loghiStampa';
import { immagine, misure } from './immagine';
import { Critica } from './Critica';

/** Il trailer con l'audio, su YouTube: la home non ha una finestra sua. */
export const suYouTube = (chiave: string) => `https://www.youtube.com/watch?v=${chiave}`;

/**
 * La proiezione speciale (dalla v1, 25 novembre 2026): finché è in programma
 * apre la home, prima del prossimo film, ed esce dalla fila degli atti (resta
 * solo in Tutto il programma). Una pagina d'apertura come quella di un
 * distributore: il fotogramma del film, «Vestri Cinema × la casa», il logo del
 * film; poi le frasi della critica, una per schermata, ciascuna sul suo
 * fotogramma. Le date sono quelle del cinema (`periodo`), non quelle
 * dell'anteprima nazionale stampate nel materiale; sotto, sala e orari.
 *
 * Le immagini stanno ferme, scorre la pagina: si muovono solo le frasi della
 * critica, legate allo scorrimento (Critica.tsx).
 */
export default function Speciale({ dati, now, ancora }: { dati: SpecialeInSala<Film>; now: Date; ancora: Ancora }) {
  const { speciale, movie, show, orari } = dati;
  const carattere = speciale.carattere;
  const trailer = trailerOf(movie);
  const sotto = [sala(show), ogniGiorno(orari)].filter(Boolean).join(', ');
  const voce = carattere ? ({ '--cit-font': `'Critica ${carattere.famiglia}'`, '--cit-peso': carattere.peso } as React.CSSProperties) : undefined;

  return (
    <section id={ancora(movie.id)} className="sp" data-atto="speciale" data-film={movie.id} data-luce={movie.id} aria-labelledby="speciale-titolo">
      <div className="sp-apertura">
        <img className="sp-fondale" src={immagine(speciale.fondale)} srcSet={misure(speciale.fondale)} sizes="100vw" alt=""
          fetchPriority="high" decoding="async" />
        <div className="sp-apertura__velo" />
        {/* Come la collaborazione di due maison: Vestri Cinema × la casa del film. */}
        <div className="container sp-collab">
          <img className="sp-collab__marchio" src="/assets/vestri-cinema.png" alt="Vestri Cinema" width={437} height={373} />
          {speciale.casa.logo && (
            <>
              <span className="sp-collab__per" aria-label="con">×</span>
              <img className="sp-collab__casa" src={immagine(speciale.casa.logo, 'w500')} alt={speciale.casa.nome} />
            </>
          )}
        </div>
        <div className="container sp-apertura__testo">
          {speciale.sopra && <p className="sp-sopra">{speciale.sopra}</p>}
          <h2 id="speciale-titolo" className="sp-titolo"><Logo film={movie} size="original" className="sp-titolo__logo" eager /></h2>
          <p className="occhiello sp-evento">Proiezione speciale</p>
          <p className="sp-periodo">{dati.periodo}</p>
          {sotto && <p className="sp-orari">{sotto}</p>}
          <div className="azioni sp-azioni">
            <Prenota show={show} film={movie} now={now} />
            <Posti show={show} sempre />
            {trailer && <a className="prenota-link" href={suYouTube(trailer)} target="_blank" rel="noopener noreferrer">Guarda il trailer<span aria-hidden> ↗</span></a>}
          </div>
        </div>
      </div>

      {carattere && (
        // Il carattere del trailer, servito dal sito: nessuna richiesta a Google.
        <style>{`@font-face{font-family:'Critica ${carattere.famiglia}';src:url('${carattere.src}') format('woff2');font-weight:${carattere.peso};font-display:swap}`}</style>
      )}
      {speciale.citazioni.map(c => (
        <Critica key={`${c.fonte}-${c.testo}`} testo={c.testo} fonte={c.fonte} critico={c.critico}
          logo={c.fonte ? logoTestata(c.fonte) : null} fondale={immagine(c.fondale)} misure={misure(c.fondale)}
          style={voce} trailer={!!carattere} />
      ))}
    </section>
  );
}
