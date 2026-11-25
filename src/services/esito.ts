/**
 * Errori leggibili per le azioni del gestionale (25 novembre 2026).
 *
 * In produzione Next non lascia passare il messaggio di un'eccezione lanciata
 * da un'azione del server: al suo posto arriva «An error occurred in the
 * Server Components render…». La guida di Next (Error handling → Server
 * Functions) dice di non lanciare per gli errori attesi ma di restituirli:
 * qui la forma `{ ok: true, … } | { ok: false, errore }` e l'involucro che la
 * produce. Niente rete e niente database: si prova coi test.
 */

/** Un errore che si sa spiegare: il suo messaggio arriva così com'è al gestionale. */
export class Spiegato extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'Spiegato';
  }
}

export type Esito<T extends object = object> = ({ ok: true } & T) | { ok: false; errore: string };

const nomeDi = (err: unknown) => (err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '');

/** Cosa dire al gestionale di un errore; `cosa` è l'azione («Riempire dal distributore»). */
export function messaggio(err: unknown, cosa: string): string {
  if (err instanceof Spiegato) return err.message;
  const nome = nomeDi(err);
  if (nome === 'TimeoutError' || nome === 'AbortError') return `${cosa}: un sito ci ha messo troppo a rispondere. Riprova fra poco.`;
  if (/^Prisma/.test(nome)) return `${cosa}: il database non ha risposto. Riprova fra un minuto.`;
  return `${cosa}: qualcosa è andato storto. Riprova; se si ripete, ricarica la pagina (il dettaglio è nei log di Vercel).`;
}

/**
 * Esegue un'azione e non lancia mai: gli errori spiegati tornano col loro
 * messaggio, gli altri finiscono nei log (console.error → Vercel) e al
 * gestionale arriva una frase in italiano.
 */
export async function esito<T extends object>(cosa: string, fai: () => Promise<T>): Promise<Esito<T>> {
  try {
    return { ok: true, ...(await fai()) };
  } catch (err) {
    if (!(err instanceof Spiegato)) console.error(`[gestionale] ${cosa}:`, err);
    return { ok: false, errore: messaggio(err, cosa) };
  }
}

/** Un lavoro con la scadenza: allo scadere lancia uno Spiegato con `testo` (il lavoro non si ferma, si smette di aspettarlo). */
export function entro<T>(lavoro: Promise<T>, ms: number, testo: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scade = new Promise<never>((_, no) => {
    timer = setTimeout(() => no(new Spiegato(testo)), Math.max(0, ms));
  });
  return Promise.race([lavoro, scade]).finally(() => clearTimeout(timer));
}

/** Un sito che risponde con un errore HTTP, detto in italiano. */
export function rispostaSito(host: string, stato: number): Spiegato {
  if (stato === 403 || stato === 401) return new Spiegato(`${host} risponde ${stato}: non lascia leggere la pagina a un programma (o chiede il login). Aprila e scarica a mano.`);
  if (stato === 429) return new Spiegato(`${host} risponde 429: troppe richieste. Riprova fra qualche minuto.`);
  if (stato === 404 || stato === 410) return new Spiegato(`${host} risponde ${stato}: la pagina non c’è (più). Controlla l’indirizzo.`);
  if (stato >= 500) return new Spiegato(`${host} risponde ${stato}: il sito ha un problema suo. Riprova più tardi.`);
  return new Spiegato(`${host} risponde ${stato}.`);
}

/** Un fetch verso `host` che non è arrivato a una risposta: scadenza o sito irraggiungibile. */
export function retePersa(host: string, err: unknown, secondi?: number): Spiegato {
  if (err instanceof Spiegato) return err;
  const nome = nomeDi(err);
  if (nome === 'TimeoutError' || nome === 'AbortError') {
    return new Spiegato(`${host} non ha risposto${secondi ? ` in ${secondi} secondi` : ' in tempo'}. Riprova fra poco.`);
  }
  return new Spiegato(`${host} non si raggiunge (${err instanceof Error ? err.message : String(err)}). Riprova fra poco.`);
}

/**
 * Quando la chiamata stessa all'azione fallisce (la funzione su Vercel è
 * scaduta, la connessione è caduta, il deploy è cambiato): il messaggio
 * originale è in inglese o generico, al gestionale si dice cosa fare.
 */
export const SENZA_RISPOSTA = 'Il server non ha risposto: forse ci ha messo troppo, o la connessione è caduta. Ricarica la pagina e riprova.';
