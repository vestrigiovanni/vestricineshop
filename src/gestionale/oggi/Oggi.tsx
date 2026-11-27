import Link from 'next/link';
import type { OggiData, OggiShow } from './buildOggi';
import { Rinfresca, RileggiPosti } from './Vivo';

function lingua(s: OggiShow): string {
  if (!s.lingua) return 'Lingua da indicare';
  return s.sottotitoli && s.sottotitoli !== 'NESSUNO' ? `${s.lingua}, sott. ${s.sottotitoli}` : s.lingua;
}

function posti(s: OggiShow): string {
  if (s.soldOut) return 'tutto esaurito';
  if (s.sold === null || s.total === null) return 'posti da leggere';
  return `${s.sold}/${s.total} prenotati`;
}

const STATO = { finito: 'finito', 'in-sala': 'in sala', dopo: 'dopo' } as const;

function Adesso({ data }: { data: OggiData }) {
  const s = data.current;
  if (s) {
    const fatto = Math.round(s.progress * 100);
    return (
      <section className="o-adesso" aria-label="In sala adesso">
        <p className="g-occhiello" data-allarme=""><span className="o-punto" aria-hidden /> In sala adesso · <span className="num">{s.start}–{s.end}</span></p>
        <h2 className="o-adesso__titolo">{s.title}</h2>
        <p className="g-nota">{[s.director, lingua(s)].filter(Boolean).join(' · ')}</p>
        <div className="p-barretta p-barretta--grande" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fatto} aria-label="Avanzamento del film">
          <span style={{ width: `${fatto}%` }} />
        </div>
      </section>
    );
  }
  const n = data.next;
  return (
    <section className="o-adesso" data-ferma="" aria-label="In sala adesso">
      <p className="g-occhiello">Sala ferma</p>
      {n ? (
        <>
          <h2 className="o-adesso__titolo">{n.title}</h2>
          <p className="g-nota">Il prossimo, {n.when} alle <span className="num">{n.start}</span> · {lingua(n)}</p>
        </>
      ) : (
        <h2 className="o-adesso__titolo">Niente in programma</h2>
      )}
    </section>
  );
}

/**
 * La stanza Oggi, la porta del gestionale: cosa c'è in sala adesso, la
 * giornata, i numeri e «Da guardare» (posti non letti, spettacoli vuoti, film
 * senza lingua o trailer, giorni senza niente, una conferma a metà). Legge dal
 * database, non da Pretix. Dalla v1 (`_oggi`).
 */
export default function Oggi({ data }: { data: OggiData }) {
  return (
    <div className="o-stanza">
      <Rinfresca />
      <header className="g-testata">
        <div>
          <p className="g-occhiello">{data.dateLabel}{data.rooms.length > 0 && ` · ${data.rooms.join(' · ')}`}</p>
          <h1 className="g-titolo">Oggi in sala</h1>
        </div>
        <div className="g-testata__azioni">
          <Link className="g-tasto g-tasto--pieno" href="/admin/programma">Programma</Link>
        </div>
      </header>

      <div className="o-corpo">
        <div className="o-giorno">
          <Adesso data={data} />
          <section aria-label="La giornata">
            <h3 className="g-etichetta o-sezione">La giornata</h3>
            {data.day.length === 0 ? (
              <p className="g-nota">Oggi non ci sono spettacoli.</p>
            ) : (
              <ol className="o-righe">
                {data.day.map(s => (
                  <li key={s.id} className="o-riga" data-stato={s.state}>
                    <span className="o-riga__ora num">{s.start}</span>
                    <span className="o-riga__testo"><b>{s.title}</b><span className="g-nota">{[data.rooms.length > 1 ? s.room : null, lingua(s)].filter(Boolean).join(' · ')}</span></span>
                    <span className="o-riga__lato"><span className="g-nota num">{posti(s)}</span><span className="g-segno" data-tuo={s.state === 'in-sala' || undefined}>{STATO[s.state]}</span></span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="o-lato">
          <div className="o-numeri">
            <div><span className="g-etichetta">Spettacoli</span><b className="num">{data.stats.showsToday}</b></div>
            <div><span className="g-etichetta">Prenotati</span><b className="num" title={data.stats.soldToday === null ? 'I posti di oggi non sono ancora stati letti da Pretix' : undefined}>{data.stats.soldToday ?? '—'}</b></div>
            <div><span className="g-etichetta">Settimana</span><b className="num">{data.stats.showsWeek}</b></div>
          </div>
          <section aria-label="Da guardare">
            <h3 className="g-etichetta o-sezione">Da guardare</h3>
            {data.alerts.length === 0 ? (
              <p className="g-nota">Tutto in ordine.</p>
            ) : (
              <ul className="o-avvisi">
                {data.alerts.map(a => (
                  <li key={a.id} className="o-avviso" data-tono={a.tone}>
                    <p>{a.text}</p>
                    {a.action?.kind === 'sync-posti' && <RileggiPosti etichetta={a.action.label} />}
                    {a.action?.href && <Link className="g-tasto g-tasto--piccolo" href={a.action.href}>{a.action.label}</Link>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
