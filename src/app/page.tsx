import { filmInSala } from '@/home/carica';
import { buildProgramma } from '@/home/programma';
import { Apertura, Lontani, Oggi, Prossimi, Silenzio, Tutto } from '@/home/atti';
import { creaAncore } from '@/home/pezzi';
import Trailer from '@/home/Trailer';
import Luce from '@/home/Luce';
import Motore from '@/home/Motore';
import { specialiAttive } from '@/speciale/leggi';
import { specialeInSala } from '@/speciale/proiezioneSpeciale';
import Speciale from '@/speciale/Speciale';
import { IntermezzoBanner, IntermezzoQuinte, IntermezzoTrailer } from '@/speciale/Intermezzi';
import '@/home/home.css';
import '@/speciale/speciale.css';

export const dynamic = 'force-dynamic';

/**
 * La Home: una galleria che va dal film più vicino al più lontano, calma
 * all'inizio e intensa alla fine, in una sala buia che prende la luce del
 * film che hai davanti. Sette atti: il prossimo film, gli altri del giorno,
 * i prossimi giorni, il buio, il trailer, più avanti, tutto il programma.
 *
 * La proiezione speciale, finché è in programma, apre la pagina prima del
 * prossimo film ed esce dalla fila degli atti (resta in Tutto il programma);
 * fra gli atti tornano i suoi tre intermezzi.
 *
 * `?film=<id>` (i vecchi link /movie/<id>): quel film apre la pagina.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ film?: string }> }) {
  const { film: voluto } = await searchParams;
  const now = new Date();
  const [films, speciali] = await Promise.all([filmInSala(now), specialiAttive()]);
  const sp = specialeInSala(films, now, speciali);
  const tutti = buildProgramma(films, now);
  const regia = sp ? buildProgramma(films.filter(f => f.id !== sp.movie.id), now) : tutti;
  let p = regia && tutti ? { ...regia, film: tutti.film, giorni: tutti.giorni } : tutti;

  if (p && voluto && Number(voluto) !== p.primo.movie.id) {
    const id = Number(voluto);
    const scelto = p.film.find(x => x.movie.id === id);
    const via = <T extends { movie: { id: number } }>(xs: T[]) => xs.filter(x => x.movie.id !== id);
    if (scelto) p = { ...p, primo: scelto, oggi: [p.primo, ...via(p.oggi)], prossimi: via(p.prossimi), lontani: via(p.lontani) };
  }

  const ancora = creaAncore();
  const luce = films.map(f => ({ id: f.id, fondale: f.backdrop_path || f.poster_path || '' }));

  return (
    <>
      <header className="barra">
        <div className="container barra__dentro">
          <a className="marchio" href="/">Vestri Cinema</a>
          <a className="barra__azione" href="#programma">Programma</a>
        </div>
      </header>

      <main className="home" id="home">
        <Luce films={luce} />
        <Motore radice="#home" />
        <h1 className="visually-hidden">Vestri Cinema: i film in sala</h1>

        {sp && <Speciale dati={sp} now={now} ancora={ancora} />}
        {!p ? (
          <section className="container vuoto">
            <h2>La sala è chiusa.</h2>
            <p className="lead">Nessun film in programma per ora: il prossimo arriva presto.</p>
          </section>
        ) : (
          <>
            <Apertura slot={p.primo} now={now} ancora={ancora} />
            {p.oggi.length > 0 && <Oggi slots={p.oggi} now={now} ancora={ancora} />}
            {/* Gli intermezzi della proiezione speciale, distanti fra loro: chi scorre la ritrova. */}
            {sp && <IntermezzoBanner dati={sp} now={now} />}
            {p.prossimi.length > 0 && (
              <Prossimi slots={p.prossimi} dopo={p.lontani.length + (p.trailer ? 1 : 0)} now={now} ancora={ancora} />
            )}
            {sp && <IntermezzoQuinte dati={sp} now={now} />}
            {p.trailer && <Silenzio film={p.trailer.slot.movie} />}
            {p.trailer && <Trailer slot={p.trailer.slot} chiave={p.trailer.key} now={now} />}
            {p.lontani.length > 0 && <Lontani slots={p.lontani} now={now} ancora={ancora} />}
            {sp && <IntermezzoTrailer dati={sp} now={now} />}
            <Tutto film={p.film} giorni={p.giorni} now={now} ancora={ancora} />
          </>
        )}
      </main>

      <footer className="piede">
        <div className="container piede__dentro">
          <span className="marchio">Vestri Cinema</span>
          <p>I biglietti sono gratuiti e si prenotano qui.</p>
        </div>
      </footer>
    </>
  );
}
