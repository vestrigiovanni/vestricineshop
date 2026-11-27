/* eslint-disable @next/next/no-img-element */
import type { Giorno, Slot } from './programma';
import { durata, giornoDi, lingua, ora, sala, tecnica, unisci, type Film } from './metadati';
import { Cartellino, Logo, Posti, Prenota, Quando, arco, img, type Ancora } from './pezzi';

/**
 * Gli atti della Home, dal film più vicino al più lontano (la regia è in
 * `programma.ts`). Ogni elemento che parla di un film porta `data-film`
 * (Luce.tsx gli dà il colore del film) e `data-luce` (quando è al centro dello
 * schermo, la pagina prende la sua luce). Gli atti fissati (`data-sc-act="pin"`)
 * li muove il motore scroll-craft, che pubblica il progresso in `--sc-p`.
 */

type Atto<T> = T & { now: Date; ancora: Ancora };

// ─── Atto 1: il prossimo film ─────────────────────────────────────────────

export function Apertura({ slot, now, ancora }: Atto<{ slot: Slot<Film> }>) {
  const { movie: f, show } = slot;
  const testo = f.tagline || f.overview || '';
  return (
    <section id={ancora(f.id)} className="apertura" data-sc-act="pin" data-sc-span="1.5" style={{ height: '150vh' }}
      data-film={f.id} data-luce={f.id} aria-labelledby="apertura-titolo">
      <div className="sc-stage apertura__palco" data-sc-stage>
        {f.backdrop_path && <img className="apertura__fondale" src={img(f.backdrop_path, 'w1280')} alt="" fetchPriority="high" decoding="async"
          srcSet={`${img(f.backdrop_path, 'w780')} 780w, ${img(f.backdrop_path, 'w1280')} 1280w, ${img(f.backdrop_path, 'original')} 2560w`} sizes="100vw" />}
        <div className="apertura__velo" />
        {f.poster_path && (
          <img className="apertura__locandina" src={img(f.poster_path, 'w500')} alt={`Locandina di ${f.title}`} decoding="async" />
        )}
        <div className="container apertura__testo">
          <p className="occhiello">Il prossimo film</p>
          <h2 id="apertura-titolo" className="apertura__titolo"><Logo film={f} size="w780" eager /></h2>
          <Quando show={show} now={now} className="apertura__quando" />
          {testo && <p className="apertura__trama">{testo}</p>}
          <Cartellino film={f} show={show} now={now} />
          <div className="azioni">
            <Prenota show={show} film={f} now={now} />
            <Posti show={show} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Atto 2: gli altri film del giorno ────────────────────────────────────

/**
 * Le schede del giorno si impilano: ognuna si ferma in cima e la successiva le
 * sale sopra, come i fogli del programma di sala. Solo CSS (`position: sticky`).
 */
export function Oggi({ slots, now, ancora }: Atto<{ slots: Slot<Film>[] }>) {
  const giorni = new Set(slots.map(x => giornoDi(x.show.date, now)));
  const nome = giorni.size === 1 ? [...giorni][0] : 'Subito dopo';
  const n = slots.length;
  return (
    <section className="atto oggi" aria-labelledby="oggi-titolo">
      <header className="container atto__capo" data-sc-in>
        <h2 id="oggi-titolo">{nome}.</h2>
        <p className="atto__sotto">
          {n === 1 ? `Un altro film, alle ${ora(slots[0].show)}` : `Altri ${n} film, dalle ${ora(slots[0].show)} alle ${ora(slots[n - 1].show)}`}.
        </p>
      </header>
      <ol className="container oggi__pila">
        {slots.map((x, i) => (
          <li key={x.show.id} id={ancora(x.movie.id)} className="oggi__carta" style={{ ['--i' as string]: i }} data-film={x.movie.id} data-luce={x.movie.id}>
            {x.movie.backdrop_path && <img className="oggi__fondale" src={img(x.movie.backdrop_path, 'w1280')} alt="" loading="lazy" decoding="async" />}
            <div className="oggi__velo" />
            <div className="oggi__testo">
              <time className="oggi__ora cifre" dateTime={x.show.date}>{ora(x.show)}</time>
              <h3 className="oggi__titolo"><Logo film={x.movie} /></h3>
              <Cartellino film={x.movie} show={x.show} now={now} voci={['film', 'versione', 'premio']} />
              <div className="azioni">
                <Prenota show={x.show} film={x.movie} now={now} />
                {sala(x.show) && <span className="oggi__sala">{sala(x.show)}</span>}
                <Posti show={x.show} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── Atto 3: nei prossimi giorni ──────────────────────────────────────────

/** Il titolo si ferma a metà schermo e la cornice con le locandine gli sale sopra. */
export function Prossimi({ slots, dopo, now, ancora }: Atto<{ slots: Slot<Film>[]; dopo: number }>) {
  const n = slots.length;
  const primo = giornoDi(slots[0].show.date, now), ultimo = giornoDi(slots[n - 1].show.date, now);
  return (
    <section className="atto prossimi" aria-labelledby="prossimi-titolo">
      <header className="container prossimi__capo">
        <h2 id="prossimi-titolo">{primo === ultimo ? `${primo}.` : 'Nei prossimi giorni.'}</h2>
        <p className="atto__sotto">{n} film{arco(slots[0].show.date, slots[n - 1].show.date, now)}.</p>
      </header>
      <div className="container">
        <div className="prossimi__cornice">
          <ul className="prossimi__parete">
            {slots.map(x => (
              <li key={x.movie.id} id={ancora(x.movie.id)} className="opera" data-film={x.movie.id} data-luce={x.movie.id}>
                <div className="opera__locandina">
                  {x.movie.poster_path && <img src={img(x.movie.poster_path, 'w500')} alt={`Locandina di ${x.movie.title}`} loading="lazy" decoding="async" />}
                </div>
                <Quando show={x.show} now={now} className="opera__quando" />
                <h3 className="opera__titolo">{x.movie.title}</h3>
                <Cartellino film={x.movie} show={x.show} now={now} voci={['film', 'premio']} />
                <div className="azioni azioni--strette">
                  <Prenota show={x.show} film={x.movie} now={now} variante="link" />
                  <Posti show={x.show} />
                </div>
              </li>
            ))}
          </ul>
          {dopo > 0 && <p className="prossimi__coda">E ancora {dopo === 1 ? 'un film' : `${dopo} film`}, più avanti.</p>}
        </div>
      </div>
    </section>
  );
}

// ─── Atto 4: le luci si spengono ──────────────────────────────────────────

/** Il buio prima del trailer, con il motto del film se c'è (non se ne inventano). */
export function Silenzio({ film }: { film: Film }) {
  const motto = (film.tagline || '').trim();
  return (
    <section className="silenzio" data-luce="buio" data-motto={motto ? '' : undefined} aria-label="Si spengono le luci">
      {motto && <p className="silenzio__motto" data-sc-in>{motto}</p>}
    </section>
  );
}

// ─── Atto 6: più avanti ───────────────────────────────────────────────────

/** Quanti fotogrammi grandi al massimo: il 27/11/2026 i film più lontani erano 76, una galleria lunga 24.000 pixel. */
export const LONTANI_MAX = 12;

/** I film più lontani, come le foto di una mostra: uno grande e uno piccolo, a righe alterne. Gli altri, nel programma completo. */
export function Lontani({ slots, now, ancora }: Atto<{ slots: Slot<Film>[] }>) {
  const mostrati = slots.slice(0, LONTANI_MAX);
  const altri = slots.length - mostrati.length;
  return (
    <section className="atto lontani" aria-labelledby="lontani-titolo">
      <header className="container atto__capo" data-sc-in>
        <h2 id="lontani-titolo">Più avanti.</h2>
        <p className="atto__sotto">{slots.length === 1 ? 'Un film' : `${slots.length} film`}{arco(slots[0].show.date, slots[slots.length - 1].show.date, now)}.</p>
      </header>
      <ul className="container lontani__galleria">
        {mostrati.map((x, i) => (
          <li key={x.movie.id} id={ancora(x.movie.id)} className="lontano" data-grande={i % 4 === 0 || i % 4 === 3 ? '' : undefined}
            data-film={x.movie.id} data-luce={x.movie.id}>
            <div className="lontano__quadro">
              {x.movie.backdrop_path && <img src={img(x.movie.backdrop_path, 'w1280')} alt="" loading="lazy" decoding="async" />}
              <div className="lontano__velo" />
              <h3 className="lontano__titolo"><Logo film={x.movie} /></h3>
            </div>
            <Quando show={x.show} now={now} />
            <Cartellino film={x.movie} show={x.show} now={now} />
            <div className="azioni azioni--strette">
              <Prenota show={x.show} film={x.movie} now={now} variante="link" />
              <Posti show={x.show} />
            </div>
          </li>
        ))}
      </ul>
      {altri > 0 && (
        <p className="container lontani__coda">
          E altri {altri === 1 ? 'un film' : `${altri} film`}, fino a {giornoDi(slots[slots.length - 1].show.date, now).toLowerCase()}.{' '}
          <a className="prenota-link" href="#programma">Sono tutti nel programma<span aria-hidden> ↓</span></a>
        </p>
      )}
    </section>
  );
}

// ─── Atto 7: tutto il programma ───────────────────────────────────────────

/**
 * La chiusura che resta: le locandine di tutti i film (portano al loro film più
 * su), poi il programma giorno per giorno. Il primo giorno è aperto, gli altri
 * si aprono al clic (aperti tutti, la lista era troppo lunga: Gio, 26/10/2026).
 * I film che non hanno un posto più su prendono l'ancora sulla loro prima riga.
 */
export function Tutto({ film, giorni, now, ancora }: Atto<{ film: Slot<Film>[]; giorni: Giorno<Film>[] }>) {
  const spettacoli = giorni.reduce((n, g) => n + g.slots.length, 0);
  const primo = giorni[0]?.slots[0]?.show.date, ultimo = giorni[giorni.length - 1]?.slots[0]?.show.date;
  return (
    <section id="programma" className="atto tutto" data-luce="tutti" aria-labelledby="tutto-titolo">
      <header className="container atto__capo" data-sc-in>
        <h2 id="tutto-titolo">Tutto il programma.</h2>
        <p className="atto__sotto">
          {film.length === 1 ? 'Un film' : `${film.length} film`}, {spettacoli === 1 ? 'uno spettacolo' : `${spettacoli} spettacoli`}
          {primo && ultimo ? arco(primo, ultimo, now) : ''}.
        </p>
      </header>

      <ul className="container tutto__parete" data-sc-stagger="18">
        {film.map(x => (
          <li key={x.movie.id} data-film={x.movie.id}>
            <a className="tutto__locandina" href={`#film-${x.movie.id}`} aria-label={`${x.movie.title}: vai al film`}>
              {x.movie.poster_path && <img src={img(x.movie.poster_path, 'w342')} alt="" loading="lazy" decoding="async" />}
            </a>
          </li>
        ))}
      </ul>

      <div className="container tutto__settimana">
        {giorni.map((g, i) => {
          const n = g.slots.length;
          return (
            <details key={g.dayKey} className="giorno" open={i === 0}>
              <summary className="giorno__capo">
                <h3 className="giorno__nome">{giornoDi(g.slots[0].show.date, now)}</h3>
                <span className="giorno__conto">
                  {n === 1 ? `Un film alle ${ora(g.slots[0].show)}` : `${n} film, dalle ${ora(g.slots[0].show)} alle ${ora(g.slots[n - 1].show)}`}
                </span>
                <span className="giorno__freccia" aria-hidden />
              </summary>
              <ul className="giorno__righe">
                {g.slots.map(x => (
                  <li key={x.show.id} id={ancora(x.movie.id)} className="riga" data-film={x.movie.id}>
                    <time className="riga__ora cifre" dateTime={x.show.date}>{ora(x.show)}</time>
                    <span className="riga__film">
                      <a className="riga__titolo" href={`#film-${x.movie.id}`}>{x.movie.title}</a>
                      <span className="riga__dati">{unisci([x.movie.director, durata(x.movie.runtime), lingua(x.show), ...tecnica(x.show), sala(x.show)])}</span>
                    </span>
                    <span className="riga__azione">
                      <Posti show={x.show} />
                      <Prenota show={x.show} film={x.movie} now={now} variante="link" />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}
