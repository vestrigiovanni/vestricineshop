/**
 * L'indirizzo di un'immagine nel gestionale: un percorso TMDB ("/abc.jpg")
 * nella misura chiesta, un indirizzo completo così com'è, niente per "none"
 * (il logo nascosto apposta: la Home scrive il titolo).
 */
export function immagineTmdb(percorso: string | null | undefined, misura = 'w342'): string | null {
  if (!percorso || percorso === 'none') return null;
  if (/^https?:\/\//.test(percorso) || percorso.startsWith('/api/') || percorso.startsWith('/speciali/')) return percorso;
  return `https://image.tmdb.org/t/p/${misura}${percorso.startsWith('/') ? '' : '/'}${percorso}`;
}

/** L'anteprima di un video YouTube da un link qualsiasi (o dall'id). */
export function anteprimaYouTube(link: string | null | undefined): string | null {
  const t = (link || '').trim();
  const id = /^[\w-]{11}$/.test(t) ? t : t.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)?.[1];
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

const GIORNO = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });
const ORA = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
const BREVE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });

export const giorno = (iso: string) => GIORNO.format(new Date(iso));
export const ora = (iso: string) => ORA.format(new Date(iso));
export const breve = (iso: string) => BREVE.format(new Date(iso));

/** «oggi 21:00» per gli spettacoli di oggi (ora di Roma), se no «28 nov». */
export function quando(iso: string, adesso = new Date()): string {
  return breve(iso) === breve(adesso.toISOString()) ? `oggi ${ora(iso)}` : breve(iso);
}
