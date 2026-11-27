import { programmaDalDatabase } from '@/services/proiezioni';
import { nomeSala } from '@/services/programma';

export const dynamic = 'force-dynamic';

const giornoLungo = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });

export default async function Home() {
  const giorni = await programmaDalDatabase();
  return (
    <>
      <header className="barra">
        <div className="container">
          <a className="marchio" href="/">Vestri Cinema</a>
          <a className="btn btn--primary btn--small" href="#programma">Prenota</a>
        </div>
      </header>
      <main className="container" id="programma">
        <section className="apertura">
          <h1>In sala</h1>
          <p className="lead">Ogni proiezione in programma, dalla più vicina.</p>
        </section>
        {giorni.length === 0 && <p className="vuoto">Nessuna proiezione in programma.</p>}
        {giorni.map((g) => (
          <section key={g.giorno} className="giorno">
            <h2>{giornoLungo.format(g.proiezioni[0].inizio)}</h2>
            {g.proiezioni.map((p) => (
              <div key={p.id} className="riga">
                <span className="ora">{ora.format(p.inizio)}</span>
                <span className="titolo">{p.titolo}</span>
                <span className="sala">{nomeSala(p.sala)}</span>
              </div>
            ))}
          </section>
        ))}
      </main>
      <footer className="piede">
        <div className="container">
          <span className="marchio">Vestri Cinema</span>
          I biglietti sono gratuiti e si prenotano qui.
        </div>
      </footer>
    </>
  );
}
