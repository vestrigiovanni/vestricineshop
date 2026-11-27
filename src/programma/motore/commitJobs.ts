/**
 * Registro dei lavori di creazione spettacoli — su database.
 *
 * PERCHÉ NON PIÙ IN MEMORIA — la versione precedente teneva i lavori in una
 * `Map` di processo e li faceva avanzare con una promessa lasciata correre
 * dopo che la risposta era già partita (`void run(...)`). Su Vercel quella
 * promessa non sopravvive: l'istanza viene congelata appena ha risposto.
 * Una programmazione da cento spettacoli non entra comunque nella vita di una
 * singola richiesta, quindi il lavoro si fermava a metà, il registro spariva
 * al cambio d'istanza, e non restava modo di sapere cosa fosse stato creato.
 *
 * COME FUNZIONA ORA — il lavoro è una riga, e ogni spettacolo da creare è una
 * riga sua. Nessuno lavora in sottofondo: chi segue il lavoro lo fa
 * **avanzare**, un lotto per richiesta. Qualsiasi istanza può servire
 * qualsiasi tick, quindi chiudere il portatile o perdere il wifi non perde
 * niente — alla riapertura il lavoro riprende esattamente da dove era.
 *
 * NIENTE DOPPIONI — ogni spettacolo ha una chiave unica dentro il lavoro
 * (`@@unique([jobId, key])`) e, appena creato, si porta dietro il suo
 * `pretixId`. Una riga con `pretixId` non viene mai ripresa in mano: riprovare
 * un lavoro interrotto ricrea solo ciò che non era nato.
 */

import prisma from '@/lib/prisma';

export type CommitState = 'pending' | 'running' | 'done' | 'error';

/** Le fasi, in quest'ordine: prima i metadati, poi la sala, poi il database. */
export type CommitPhase = 'metadata' | 'shows' | 'sync' | 'done';

export interface CommitError {
  /** Identifica lo spettacolo fallito: `tmdbId@YYYY-MM-DDTHH:mm`. */
  key: string;
  label: string;
  error: string;
}

export interface CommitJob {
  id: string;
  state: CommitState;
  phase: CommitPhase;
  step: string;
  done: number;
  total: number;
  /** Id Pretix dei sub-eventi creati. */
  created: number[];
  errors: CommitError[];
  startedAt: number;
  finishedAt?: number;
  /** Quanti spettacoli restano da creare: zero significa che la sala è a posto. */
  pending: number;
}

/** Uno spettacolo da creare, come lo conserva il lavoro. */
export interface CommitItemRow {
  id: string;
  key: string;
  tmdbId: string;
  date: string;
  time: string;
  title: string | null;
  runtime: number | null;
  payload: {
    replaces?: number[];
    forceReplace?: boolean;
    allowOutsideHours?: boolean;
    specs?: string[];
    specsNote?: string;
  };
  attempts: number;
}

/** Quanto a lungo un tick può tenersi una riga prima che sia considerata persa. */
const LEASE_MS = 90_000;

/** Quante volte si riprova uno spettacolo prima di darlo per fallito. */
export const MAX_ATTEMPTS = 3;

/** Quanto si conserva un lavoro finito prima di essere dimenticato. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function asErrors(value: unknown): CommitError[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is CommitError =>
      typeof e === 'object' && e !== null && typeof (e as CommitError).key === 'string'
  );
}

/**
 * Crea il lavoro e le sue righe. Non crea **niente** su Pretix: è un elenco di
 * intenzioni, che qualcuno dovrà poi far avanzare.
 */
export async function createJob(
  seatingPlanId: number,
  shows: {
    key: string;
    tmdbId: string;
    date: string;
    time: string;
    title?: string;
    runtime?: number;
    payload?: CommitItemRow['payload'];
  }[]
): Promise<string> {
  await sweep();

  // Due spettacoli con la stessa chiave sono lo stesso spettacolo chiesto due
  // volte: il vincolo di unicità li rifiuterebbe, e crearne due sarebbe
  // comunque sbagliato.
  const unique = new Map(shows.map((s) => [s.key, s]));

  const job = await prisma.planningCommitJob.create({
    data: {
      seatingPlanId,
      state: 'pending',
      phase: 'metadata',
      step: 'In coda',
      total: unique.size,
      filmTotal: new Set([...unique.values()].map((s) => s.tmdbId)).size,
      items: {
        create: [...unique.values()].map((s) => ({
          key: s.key,
          tmdbId: s.tmdbId,
          date: s.date,
          time: s.time,
          title: s.title ?? null,
          runtime: s.runtime ?? null,
          payload: (s.payload ?? {}) as object,
        })),
      },
    },
    select: { id: true },
  });

  return job.id;
}

/** Come sta andando. `null` se il lavoro non esiste (o è stato dimenticato). */
export async function getJob(id: string): Promise<CommitJob | null> {
  const job = await prisma.planningCommitJob.findUnique({
    where: { id },
    include: {
      items: {
        select: { state: true, pretixId: true, key: true, title: true, date: true, time: true, error: true },
      },
    },
  });
  if (!job) return null;

  const created: number[] = [];
  const itemErrors: CommitError[] = [];
  let done = 0;
  let pending = 0;

  for (const it of job.items) {
    if (it.pretixId != null) created.push(it.pretixId);
    if (it.state === 'done' || it.state === 'failed' || it.state === 'skipped') done++;
    else pending++;
    if (it.state === 'failed' && it.error) {
      itemErrors.push({
        key: it.key,
        label: `${it.title ?? it.key} · ${it.date} ${it.time}`,
        error: it.error,
      });
    }
  }

  // L'avanzamento conta anche i metadati: sono la parte lenta, e lasciare la
  // barra a zero mentre il server scava su MUBI sembra un blocco.
  const metaDone = job.metaDone.length;

  return {
    id: job.id,
    state: job.state as CommitState,
    phase: job.phase as CommitPhase,
    step: job.step,
    done: done + metaDone,
    total: job.total + job.filmTotal,
    created,
    errors: [...asErrors(job.errors), ...itemErrors],
    startedAt: job.startedAt.getTime(),
    finishedAt: job.finishedAt?.getTime(),
    pending,
  };
}

/** Il lavoro non ancora concluso più recente per una sala, se c'è. */
export async function findOpenJob(seatingPlanId: number): Promise<string | null> {
  const job = await prisma.planningCommitJob.findFirst({
    where: { seatingPlanId, state: { in: ['pending', 'running'] } },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });
  return job?.id ?? null;
}

export async function patchJob(
  id: string,
  patch: { state?: CommitState; phase?: CommitPhase; step?: string; metaDone?: string[] }
): Promise<void> {
  const data: Record<string, unknown> = { ...patch };
  if (patch.state === 'done' || patch.state === 'error') data.finishedAt = new Date();
  await prisma.planningCommitJob.update({ where: { id }, data }).catch(() => null);
}

/** Aggiunge un errore che non appartiene a nessuno spettacolo in particolare. */
export async function addJobError(id: string, error: CommitError): Promise<void> {
  const job = await prisma.planningCommitJob.findUnique({ where: { id }, select: { errors: true } });
  if (!job) return;
  const errors = [...asErrors(job.errors), error];
  await prisma.planningCommitJob.update({ where: { id }, data: { errors: errors as object } }).catch(() => null);
}

export async function getJobHead(id: string) {
  return prisma.planningCommitJob.findUnique({
    where: { id },
    select: { id: true, seatingPlanId: true, state: true, phase: true, metaDone: true, total: true },
  });
}

/** I film distinti del lavoro, nell'ordine in cui compaiono. */
export async function jobFilmIds(id: string): Promise<string[]> {
  const rows = await prisma.planningCommitItem.findMany({
    where: { jobId: id },
    select: { tmdbId: true },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });
  return [...new Set(rows.map((r) => r.tmdbId))];
}

/** Tutte le righe del lavoro: servono per calcolare i conflitti fra loro. */
export async function jobItems(id: string) {
  return prisma.planningCommitItem.findMany({
    where: { jobId: id },
    select: { key: true, tmdbId: true, date: true, time: true, runtime: true, state: true, title: true },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });
}

/**
 * Prende in carico il prossimo lotto di spettacoli da creare.
 *
 * Le righe rimaste appese da un tick che non è mai tornato — l'istanza
 * congelata, il wifi caduto — tornano disponibili da sole quando la loro
 * prenotazione scade: è l'unico modo perché un lavoro interrotto possa
 * ripartire senza che nessuno debba accorgersene.
 */
export async function claimBatch(jobId: string, size: number): Promise<CommitItemRow[]> {
  const now = new Date();

  // Le righe rimaste appese tornano disponibili — tranne quelle che hanno già
  // esaurito i tentativi: quelle diventano fallite. Senza questa distinzione
  // resterebbero per sempre `todo` senza poter essere riprese (il filtro qui
  // sotto le scarta), e il lavoro non arriverebbe mai alla fine.
  await prisma.planningCommitItem.updateMany({
    where: { jobId, state: 'running', leaseUntil: { lt: now }, attempts: { lt: MAX_ATTEMPTS } },
    data: { state: 'todo', lease: null, leaseUntil: null },
  });
  await prisma.planningCommitItem.updateMany({
    where: {
      jobId,
      state: 'running',
      leaseUntil: { lt: now },
      attempts: { gte: MAX_ATTEMPTS },
      pretixId: null,
    },
    data: {
      state: 'failed',
      lease: null,
      leaseUntil: null,
      error: 'Interrotto troppe volte senza arrivare in fondo: riprova a mano.',
    },
  });

  const candidates = await prisma.planningCommitItem.findMany({
    where: { jobId, state: 'todo', pretixId: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
    take: size,
    select: { id: true },
  });
  if (candidates.length === 0) return [];

  const lease = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await prisma.planningCommitItem.updateMany({
    where: { id: { in: candidates.map((c) => c.id) }, state: 'todo' },
    data: {
      state: 'running',
      lease,
      leaseUntil: new Date(Date.now() + LEASE_MS),
      attempts: { increment: 1 },
    },
  });

  // Si rileggono solo quelle che abbiamo davvero preso: se un altro tick ci ha
  // preceduto, la sua prenotazione vince e noi non la tocchiamo.
  const mine = await prisma.planningCommitItem.findMany({
    where: { jobId, lease },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });

  return mine.map((it) => ({
    id: it.id,
    key: it.key,
    tmdbId: it.tmdbId,
    date: it.date,
    time: it.time,
    title: it.title,
    runtime: it.runtime,
    payload: (it.payload ?? {}) as CommitItemRow['payload'],
    attempts: it.attempts,
  }));
}

/**
 * Restituisce le righe prese in carico ma non lavorate.
 *
 * Un tick si ferma quando finisce il suo tempo, e ciò che aveva prenotato
 * resterebbe bloccato fino alla scadenza della prenotazione — un minuto e mezzo
 * in cui il tick successivo non può farci niente e gira a vuoto. Restituirle
 * subito, col tentativo non contato, è la differenza fra una creazione che
 * avanza e una che singhiozza.
 */
export async function releaseUnworked(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await prisma.planningCommitItem
    .updateMany({
      where: { id: { in: itemIds }, state: 'running' },
      data: { state: 'todo', lease: null, leaseUntil: null, attempts: { decrement: 1 } },
    })
    .catch(() => null);
}

export async function markCreated(itemId: string, pretixId: number): Promise<void> {
  await prisma.planningCommitItem
    .update({
      where: { id: itemId },
      data: { state: 'done', pretixId, error: null, lease: null, leaseUntil: null },
    })
    .catch(() => null);
}

/**
 * Segna un tentativo andato male.
 *
 * `retryable` distingue l'inciampo dal rifiuto: un 429 di Pretix o una rete
 * che cade meritano un altro giro, un conflitto d'orario o un film senza
 * durata no — riprovarli darebbe lo stesso esito tre volte e basta.
 */
export async function markFailed(
  itemId: string,
  error: string,
  retryable: boolean
): Promise<void> {
  const item = await prisma.planningCommitItem.findUnique({
    where: { id: itemId },
    select: { attempts: true },
  });
  const exhausted = !retryable || (item?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS;
  await prisma.planningCommitItem
    .update({
      where: { id: itemId },
      data: {
        state: exhausted ? 'failed' : 'todo',
        error,
        lease: null,
        leaseUntil: null,
      },
    })
    .catch(() => null);
}

/** Rimette in gioco i falliti: è il "riprova" dopo aver letto cos'era andato storto. */
export async function retryFailed(jobId: string): Promise<number> {
  const res = await prisma.planningCommitItem.updateMany({
    where: { jobId, state: 'failed', pretixId: null },
    data: { state: 'todo', attempts: 0, error: null, lease: null, leaseUntil: null },
  });
  if (res.count > 0) {
    await prisma.planningCommitJob.update({
      where: { id: jobId },
      data: { state: 'running', phase: 'shows', step: 'Riprovo gli spettacoli falliti', finishedAt: null },
    }).catch(() => null);
  }
  return res.count;
}

/** I sub-eventi nati da questo lavoro, per il sync finale. */
export async function jobCreatedIds(jobId: string): Promise<number[]> {
  const rows = await prisma.planningCommitItem.findMany({
    where: { jobId, pretixId: { not: null } },
    select: { pretixId: true, payload: true },
  });
  return rows.map((r) => r.pretixId!).filter((id): id is number => id != null);
}

/** Le specifiche di proiezione da posare dopo il sync, spettacolo per spettacolo. */
export async function jobSpecsToWrite(
  jobId: string
): Promise<{ pretixId: number; specs: string[]; note: string | null }[]> {
  const rows = await prisma.planningCommitItem.findMany({
    where: { jobId, pretixId: { not: null } },
    select: { pretixId: true, payload: true },
  });
  return rows
    .map((r) => {
      const p = (r.payload ?? {}) as CommitItemRow['payload'];
      return {
        pretixId: r.pretixId!,
        specs: Array.isArray(p.specs) ? p.specs : [],
        note: typeof p.specsNote === 'string' && p.specsNote.trim() ? p.specsNote.trim() : null,
      };
    })
    .filter((x) => x.specs.length > 0 || x.note);
}

/** I lavori vecchi si dimenticano: il registro non è un archivio. */
async function sweep(): Promise<void> {
  await prisma.planningCommitJob
    .deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - TTL_MS) } } })
    .catch(() => null);
}
