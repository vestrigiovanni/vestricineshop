import { cartellino, giornoDi, posti, quando, type Film, type Show } from './metadati';

/**
 * I pezzi che ogni atto della Home ripete: l'immagine TMDB, il logo del film,
 * il cartellino e Prenota. Tutti disegnati sul server: il colore del film
 * arriva dopo, dal browser (Luce.tsx scrive `--f-accento` sugli elementi con
 * `data-film`).
 */

/** Un'immagine TMDB alla misura voluta. TMDB le serve già ridotte: niente ottimizzatore. */
export const img = (path: string | null | undefined, size = 'w1280') =>
  !path ? '' : path.startsWith('http') ? path : `https://image.tmdb.org/t/p/${size}${path}`;

/**
 * La cassa di Pretix su quello spettacolo, come i link che Gio manda già oggi.
 * Con JavaScript Prenota apre la sala del sito (`data-prenota`, la legge
 * Biglietteria.tsx); senza, porta qui.
 */
export const linkPrenota = (s: Show) => `https://pretix.eu/vestri/npkez/${s.id}/`;

/** Il primo elemento della pagina per ogni film prende l'ancora `#film-<id>`: lì portano le locandine in fondo. */
export function creaAncore() {
  const viste = new Set<number>();
  return (id: number) => {
    if (viste.has(id)) return undefined;
    viste.add(id);
    return `film-${id}`;
  };
}
export type Ancora = ReturnType<typeof creaAncore>;

export function Prenota({ show, film, now, variante = 'pieno' }: { show: Show; film: Film; now: Date; variante?: 'pieno' | 'link' }) {
  if (show.isSoldOut) return <span className="esaurito">Esaurito</span>;
  return (
    <a className={variante === 'pieno' ? 'prenota' : 'prenota-link'} href={linkPrenota(show)} data-prenota={show.id}
      aria-label={`Prenota ${film.title}, ${quando(show, now).toLowerCase()}`}>
      Prenota{variante === 'link' && <span aria-hidden> →</span>}
    </a>
  );
}

/** "Ultimi 4 posti" quando la sala si sta riempiendo; altrimenti niente (o "Posti disponibili", se `sempre`). */
export function Posti({ show, sempre = false }: { show: Show; sempre?: boolean }) {
  const p = posti(show);
  if (p.stato === 'esaurito' || (p.stato === 'liberi' && !sempre)) return null;
  return <span className="posti" data-stato={p.stato}>{p.testo}</span>;
}

/**
 * Il logo del film al posto del titolo, in una scatola di altezza fissa (la
 * decide la classe), così quando arriva non sposta niente. Senza logo, il titolo
 * in Boska. Se il logo è quasi nero, Luce.tsx lo accende (`data-acceso`).
 */
export function Logo({ film, size = 'w500', className = '', eager = false }: { film: Film; size?: string; className?: string; eager?: boolean }) {
  if (!film.logo_path) return <span className={`logo logo--testo ${className}`}>{film.title}</span>;
  return (
    <span className={`logo ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(film.logo_path, size)} alt={film.title} crossOrigin="anonymous" data-logo loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </span>
  );
}

/** "Oggi alle 20:30 · Sala Ca Granda" */
export function Quando({ show, now, className = '' }: { show: Show; now: Date; className?: string }) {
  const c = cartellino({ id: 0, title: '', subevents: [] }, show, now);
  return (
    <p className={`quando ${className}`}>
      <time dateTime={show.date}>{c.quando}</time>
      {c.sala && <span className="quando__sala">{c.sala}</span>}
    </p>
  );
}

type Voce = 'film' | 'versione' | 'generi' | 'premio';

/** Le righe del cartellino: regia/anno/durata, lingua e tecnica, generi e divieto, il premio. Una riga che manca non lascia tracce. */
export function Cartellino({ film, show, now, voci = ['film', 'versione', 'generi', 'premio'], className = '' }: { film: Film; show: Show; now: Date; voci?: Voce[]; className?: string }) {
  const c = cartellino(film, show, now);
  const righe: [Voce, React.ReactNode][] = [
    ['film', c.film],
    ['versione', c.versione],
    ['generi', (c.generi || c.divieto) && <>{c.generi}{c.generi && c.divieto && ' · '}{c.divieto && <abbr title={`Vietato ai minori di ${c.divieto.replace('+', '')} anni`}>{c.divieto}</abbr>}</>],
    ['premio', c.premio && <><span className="cartellino__premio">{c.premio.titolo}</span> · {c.premio.dove}</>],
  ];
  const presenti = righe.filter(([k, v]) => voci.includes(k) && v);
  if (!presenti.length) return null;
  return (
    <ul className={`cartellino ${className}`}>
      {presenti.map(([k, v]) => <li key={k} data-voce={k}>{v}</li>)}
    </ul>
  );
}

/** "da domani a sabato 5 dicembre", per i sottotitoli degli atti. */
export function arco(primo: string, ultimo: string, now: Date) {
  const a = giornoDi(primo, now), b = giornoDi(ultimo, now);
  return a === b ? '' : `, da ${a.toLowerCase()} a ${b.toLowerCase()}`;
}
