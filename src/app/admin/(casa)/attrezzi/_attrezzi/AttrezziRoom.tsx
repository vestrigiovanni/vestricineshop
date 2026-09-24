'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminClearCache,
  adminGetEmptyProjections,
  adminRefreshAllAwards,
  adminSyncAllMovies,
  adminSyncSoldOutStatus,
} from '@/actions/adminActions';
import { logoutAdmin } from '@/actions/authActions';
import { planningDeleteShow } from '@/actions/planningActions';
import Button from '@/components/cabina/Button';
import Dialog from '@/components/cabina/Dialog';
import { useToast } from '@/components/cabina/Toast';
import { romeClock } from '@/services/scheduling/rome';
import styles from '../../_stanza.module.css';

type Job = 'cache' | 'soldout' | 'awards' | 'missing' | 'force';

interface EmptyShow {
  id: number;
  name: string | { it?: string };
  date_from: string;
}

const PRETIX = 'https://pretix.eu/vestri/npkez/';
const CHECKIN = 'https://pretix.eu/control/event/vestri/npkez/webcheckin/';

function titleOf(e: EmptyShow): string {
  return typeof e.name === 'string' ? e.name : e.name?.it ?? 'Senza titolo';
}

function when(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })} ${romeClock(d)}`;
}

/**
 * I lavori che toccano tutto il cinema, in un posto solo. Ognuno dice prima
 * cosa fa e quanto ci mette.
 */
export default function AttrezziRoom() {
  const toast = useToast();
  const [running, setRunning] = useState<Job | null>(null);
  const [empty, setEmpty] = useState<EmptyShow[] | null>(null);
  const [emptyError, setEmptyError] = useState(false);
  const [cleaning, setCleaning] = useState<number | 'all' | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const loadEmpty = useCallback(async () => {
    try {
      setEmpty((await adminGetEmptyProjections()) as EmptyShow[]);
      setEmptyError(false);
    } catch {
      setEmpty([]);
      setEmptyError(true);
    }
  }, []);

  useEffect(() => {
    void loadEmpty();
  }, [loadEmpty]);

  const run = async (job: Job) => {
    setRunning(job);
    try {
      if (job === 'cache') {
        await adminClearCache();
        toast('Cache svuotata: Pretix si rilegge alla prossima visita.', 'ok');
      } else if (job === 'soldout') {
        const res = await adminSyncSoldOutStatus();
        toast(`Posti e tutto esaurito riletti: ${res.count} spettacoli.`, 'ok');
      } else if (job === 'awards') {
        const res = await adminRefreshAllAwards();
        if (!res.success) throw new Error(res.error);
        toast(`Premi aggiornati: ${res.updated} film${res.failed ? `, ${res.failed} non riusciti` : ''}.`, res.failed ? 'info' : 'ok');
      } else {
        const res = await adminSyncAllMovies(job === 'force');
        toast(`Database popolato: ${res?.upserted ?? 0} spettacoli passati in rassegna.`, 'ok');
      }
    } catch {
      toast('Il lavoro non è andato a buon fine. Riprova fra poco.', 'alarm');
    } finally {
      setRunning(null);
    }
  };

  const removeOne = async (e: EmptyShow): Promise<boolean> => {
    const res = await planningDeleteShow(e.id, false);
    return res.deleted;
  };

  const clean = async (e: EmptyShow) => {
    setCleaning(e.id);
    try {
      if (await removeOne(e)) {
        setEmpty((list) => list?.filter((x) => x.id !== e.id) ?? null);
        toast(`«${titleOf(e)}» di ${when(e.date_from)} eliminato.`, 'ok');
      } else {
        toast('Non l’ho eliminato: nel frattempo qualcuno ha comprato un biglietto.', 'alarm');
      }
    } catch {
      toast('Pretix non ha risposto.', 'alarm');
    } finally {
      setCleaning(null);
    }
  };

  const cleanAll = async () => {
    setConfirmAll(false);
    if (!empty) return;
    setCleaning('all');
    let done = 0;
    let kept = 0;
    for (const e of empty) {
      try {
        if (await removeOne(e)) done++;
        else kept++;
      } catch {
        kept++;
      }
    }
    await loadEmpty();
    setCleaning(null);
    toast(`${done} proiezioni vuote eliminate${kept ? `, ${kept} lasciate perché hanno biglietti o Pretix non ha risposto` : ''}.`, kept ? 'info' : 'ok');
  };

  const tool = (job: Job, title: string, text: string, label: string) => (
    <li className={styles.tool}>
      <div>
        <b>{title}</b>
        <p>{text}</p>
      </div>
      <Button variant={job === 'force' ? 'alarm' : 'outline'} onClick={() => run(job)} disabled={running !== null}>
        {running === job ? 'Lavoro…' : label}
      </Button>
    </li>
  );

  return (
    <div className={styles.room}>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>Per tutto il cinema</p>
          <h1 className={styles.title}>Attrezzi</h1>
        </div>
        <div className={styles.headActions}>
          <Button href={PRETIX} variant="ghost">Pretix ↗</Button>
          <Button href={CHECKIN} variant="ghost">Check-in all’ingresso ↗</Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await logoutAdmin();
              window.location.href = '/admin/login';
            }}
          >
            Esci
          </Button>
        </div>
      </header>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <p className={styles.section}>Rileggere e rinfrescare</p>
          <ul className={styles.tools}>
            {tool('cache', 'Cache di Pretix', 'Il sito rilegge Pretix alla prossima visita invece di usare la copia che ha. Immediato.', 'Svuota')}
            {tool('soldout', 'Posti e tutto esaurito', 'Rilegge le quote di ogni spettacolo futuro. Qualche minuto.', 'Rileggi')}
            {tool('awards', 'Premi', 'Chiede a MUBI i premi di ogni film in programma. Qualche minuto.', 'Aggiorna')}
            {tool('missing', 'Dati mancanti', 'Scorre Pretix e completa le schede a cui manca qualcosa. Le personalizzazioni restano.', 'Completa')}
            {tool('force', 'Rinfresca tutto da TMDB', 'Rilegge ogni scheda da TMDB, anche quelle complete. Le personalizzazioni restano, ma ci vuole di più.', 'Rinfresca')}
          </ul>
          {running && running !== 'cache' && <p className={styles.hint}>Resta su questa pagina finché non finisce.</p>}
        </section>

        <section className={styles.panel}>
          <p className={styles.section}>Proiezioni vuote, da oggi in poi</p>
          <p className={styles.hint}>Spettacoli futuri senza nemmeno un biglietto. Se nel frattempo qualcuno compra, non li tocco.</p>
          {empty === null && <p className={styles.hint}>Guardo tutte le quote su Pretix…</p>}
          {emptyError && <p className={styles.hint}>Pretix non ha risposto. Riprova fra poco.</p>}
          {empty && empty.length === 0 && !emptyError && <p className={styles.hint}>Nessuna: ogni spettacolo futuro ha almeno un biglietto.</p>}
          {empty && empty.length > 0 && (
            <>
              <ul className={styles.list}>
                {empty.map((e) => (
                  <li key={e.id} className={styles.item}>
                    <div className={styles.itemMain}>
                      <span>{titleOf(e)}</span>
                      <span className={styles.meta}>{when(e.date_from)}</span>
                    </div>
                    <Button variant="ghost" onClick={() => void clean(e)} disabled={cleaning !== null}>
                      {cleaning === e.id ? 'Elimino…' : 'Elimina'}
                    </Button>
                  </li>
                ))}
              </ul>
              <Button variant="alarm" onClick={() => setConfirmAll(true)} disabled={cleaning !== null}>
                {cleaning === 'all' ? 'Elimino…' : `Elimina tutte e ${empty.length}`}
              </Button>
            </>
          )}
        </section>
      </div>

      {confirmAll && empty && (
        <Dialog open onClose={() => setConfirmAll(false)} title={`Eliminare ${empty.length} proiezioni vuote?`} showTitle>
          <p className={styles.text}>Spariscono da Pretix, dal sito e dall’app. Quelle che nel frattempo hanno venduto un biglietto restano.</p>
          <div className={styles.dialogActions}>
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>Annulla</Button>
            <Button variant="alarm" onClick={cleanAll}>Elimina</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
