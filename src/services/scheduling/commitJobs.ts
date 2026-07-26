/**
 * Registro dei lavori di creazione spettacoli.
 *
 * PERCHÉ ESISTE — creare trenta sub-eventi su Pretix richiede minuti: ogni
 * creazione rilegge l'occupazione della sala e configura le quote, e va fatta
 * in sequenza perché due creazioni in volo insieme non si vedono a vicenda.
 * Una singola richiesta HTTP non può restare aperta così a lungo, quindi
 * `POST /commit` avvia il lavoro e risponde subito con un `jobId`; il client
 * poi chiede come sta andando.
 *
 * LIMITE DA CONOSCERE — il registro sta in memoria. Su Vercel ogni istanza
 * serverless ha la sua, e un'istanza può sparire: se il polling finisce su
 * un'altra istanza, il job risulta sconosciuto. È accettabile perché
 * l'operazione o è già finita o è comunque tracciata su Pretix, ma l'app deve
 * trattare un 404 come "non lo so", non come "è fallito" — e non deve mai
 * rilanciare il commit, o creerebbe doppioni.
 */

export type CommitState = 'pending' | 'running' | 'done' | 'error';

export interface CommitError {
  /** Identifica lo spettacolo fallito: `tmdbId@YYYY-MM-DDTHH:mm`. */
  key: string;
  label: string;
  error: string;
}

export interface CommitJob {
  id: string;
  state: CommitState;
  step: string;
  done: number;
  total: number;
  /** Id Pretix dei sub-eventi creati. */
  created: number[];
  errors: CommitError[];
  startedAt: number;
  finishedAt?: number;
}

/** Quanto si conserva un lavoro finito prima di essere dimenticato. */
const TTL_MS = 30 * 60 * 1000;

const jobs = new Map<string, CommitJob>();

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > TTL_MS) jobs.delete(id);
  }
}

export function createJob(total: number): CommitJob {
  sweep();
  const job: CommitJob = {
    id: `cj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    state: 'pending',
    step: 'In coda',
    done: 0,
    total,
    created: [],
    errors: [],
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): CommitJob | null {
  sweep();
  return jobs.get(id) ?? null;
}

export function updateJob(id: string, patch: Partial<CommitJob>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
  if ((patch.state === 'done' || patch.state === 'error') && !job.finishedAt) {
    job.finishedAt = Date.now();
  }
}
