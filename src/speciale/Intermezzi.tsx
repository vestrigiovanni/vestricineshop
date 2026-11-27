/* eslint-disable @next/next/no-img-element */
import { sala, type Film } from '../home/metadati';
import { trailerOf } from '../home/programma';
import { linkPrenota, Posti, Prenota } from '../home/pezzi';
import { ogniGiorno, type ConDate, type Posto, type SpecialeInSala } from './proiezioneSpeciale';
import { immagine } from './immagine';
import { suYouTube } from './Speciale';
import Video from './Video';

/**
 * Gli intermezzi della proiezione speciale (dalla v1, 25 novembre 2026): il
 * materiale del distributore messo fra gli atti, perché chi scorre la pagina
 * non si dimentichi della proiezione speciale ("per tenere alta l'attenzione",
 * Gio). Tre, distanti fra loro: il banner dopo gli altri film del giorno, la
 * locandina con le foto di scena dopo i prossimi giorni, il trailer verticale
 * dopo Più avanti.
 *
 * Nel materiale c'erano le date dell'anteprima nazionale: sono state
 * cancellate dalle immagini, e al loro posto il sito scrive quelle del cinema,
 * prese dal programma (`periodo`).
 */
type Props = { dati: SpecialeInSala<Film>; now: Date };

/** "Sala A24, ogni giorno alle 16:00 e alle 21:00". */
const doveQuando = ({ show, orari }: SpecialeInSala<Film>) => [sala(show), ogniGiorno(orari)].filter(Boolean).join(', ');
const maiuscola = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Le date del cinema, dove il distributore aveva le sue. */
function DateDelCinema({ posto, dati, tipo }: { posto?: Posto; dati: SpecialeInSala<Film>; tipo: 'oriz' | 'vert' | 'locandina' }) {
  if (!posto) return null;
  return (
    <span className="sp-date" data-tipo={tipo} data-riquadro={posto.riquadro ? '' : undefined}
      style={{ left: `${posto.x}%`, top: `${posto.y}%`, width: `${posto.w}%`, height: `${posto.h}%` }}>
      <span className="sp-date__evento">Proiezione speciale</span>
      <span className="sp-date__periodo">{dati.periodo}</span>
    </span>
  );
}

/** Intermezzo 1, dopo gli altri film del giorno: il banner a tutta larghezza, che si tocca per prenotare. */
export function IntermezzoBanner({ dati, now }: Props) {
  // Con un banner solo, quello vale per lo schermo grande e per il telefono.
  const b = dati.speciale.materiale?.banner;
  const o: ConDate | undefined = b?.orizzontale ?? b?.verticale;
  const v: ConDate | undefined = b?.verticale ?? o;
  if (!o || !v) return null;
  const tipo = (x: ConDate) => (x.w >= x.h ? 'oriz' : 'vert');
  const cornici = (
    <>
      <span className="sp-cornice sp-cornice--oriz" style={{ aspectRatio: `${o.w} / ${o.h}` }}>
        <img src={immagine(o.src)} alt="" loading="lazy" decoding="async" />
        <DateDelCinema posto={o.date} dati={dati} tipo={tipo(o)} />
      </span>
      <span className="sp-cornice sp-cornice--vert" style={{ aspectRatio: `${v.w} / ${v.h}` }}>
        <img src={immagine(v.src)} alt="" loading="lazy" decoding="async" />
        <DateDelCinema posto={v.date} dati={dati} tipo={tipo(v)} />
      </span>
    </>
  );
  return (
    <section className="sp-banner" data-atto="intermezzo-banner" data-film={dati.movie.id} data-luce={dati.movie.id}
      aria-label={`${dati.movie.title}, proiezione speciale`}>
      {dati.show.isSoldOut
        ? <div className="sp-manifesto">{cornici}</div>
        : <a className="sp-manifesto" href={linkPrenota(dati.show)}
          aria-label={`Prenota ${dati.movie.title}, proiezione speciale: ${dati.periodo.toLowerCase()}`}>{cornici}</a>}
      <div className="container sp-banner__piede">
        <p className="sp-riga">{doveQuando(dati)}</p>
        <div className="azioni azioni--strette">
          <Prenota show={dati.show} film={dati.movie} now={now} variante="link" />
          <Posti show={dati.show} />
        </div>
      </div>
    </section>
  );
}

/** Intermezzo 2, dopo i prossimi giorni: la locandina e le foto di scena. */
export function IntermezzoQuinte({ dati, now }: Props) {
  const l = dati.speciale.materiale?.locandina;
  const foto = dati.speciale.materiale?.foto ?? [];
  if (!l && !foto.length) return null;
  return (
    <section className="atto sp-quinte" data-atto="intermezzo-quinte" data-film={dati.movie.id} data-luce={dati.movie.id}
      aria-labelledby="quinte-titolo">
      <header className="container atto__capo">
        <p className="occhiello">Proiezione speciale</p>
        <h2 id="quinte-titolo">{dati.movie.title}</h2>
        <p className="atto__sotto">{dati.periodo}. {maiuscola(doveQuando(dati))}.</p>
        <div className="azioni">
          <Prenota show={dati.show} film={dati.movie} now={now} />
          <Posti show={dati.show} sempre />
        </div>
      </header>
      <div className="container sp-mostra" data-solo={!l ? 'foto' : !foto.length ? 'locandina' : undefined}>
        {l && (
          <figure className="sp-locandina" style={{ aspectRatio: `${l.w} / ${l.h}` }}>
            <img src={immagine(l.src)} alt={`Locandina di ${dati.movie.title}`} loading="lazy" decoding="async" />
            <DateDelCinema posto={l.date} dati={dati} tipo="locandina" />
          </figure>
        )}
        {foto.length > 0 && (
          <ul className="sp-foto">
            {foto.map(f => (
              <li key={f.src}>
                <figure className="sp-scatto">
                  <span className="sp-scatto__immagine" style={{ aspectRatio: `${f.w} / ${f.h}` }}>
                    <img src={immagine(f.src)} alt={f.chi ? `${f.chi} in ${dati.movie.title}` : `Una scena di ${dati.movie.title}`} loading="lazy" decoding="async" />
                  </span>
                  {(f.chi || f.credito) && (
                    <figcaption className="sp-didascalia">
                      {f.chi && <span>{f.chi}</span>}
                      {f.credito && <span className="sp-didascalia__credito">Foto: {f.credito}</span>}
                    </figcaption>
                  )}
                </figure>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Intermezzo 3, dopo Più avanti: il trailer verticale, muto e a ciclo, in un telefono. */
export function IntermezzoTrailer({ dati, now }: Props) {
  const tv = dati.speciale.materiale?.trailerVerticale;
  const trailer = trailerOf(dati.movie);
  if (!tv?.src) return null;
  return (
    <section className="atto sp-verticale" data-atto="intermezzo-trailer" data-film={dati.movie.id} data-luce={dati.movie.id}
      aria-labelledby="verticale-titolo">
      <div className="container sp-verticale__dentro">
        <div className="sp-verticale__testo">
          <p className="occhiello">Proiezione speciale</p>
          <h2 id="verticale-titolo" className="sp-verticale__titolo">{dati.movie.title}</h2>
          {dati.speciale.sopra && <p className="sp-verticale__sopra">{dati.speciale.sopra}</p>}
          <p className="sp-periodo">{dati.periodo}</p>
          <p className="sp-riga">{doveQuando(dati)}</p>
          <div className="azioni">
            <Prenota show={dati.show} film={dati.movie} now={now} />
            {trailer && <a className="prenota-link" href={suYouTube(trailer)} target="_blank" rel="noopener noreferrer">Guarda con l&apos;audio<span aria-hidden> ↗</span></a>}
          </div>
        </div>
        <div className="sp-telefono">
          <Video src={immagine(tv.src)} poster={tv.poster ? immagine(tv.poster) : undefined} titolo={dati.movie.title} />
        </div>
      </div>
    </section>
  );
}
