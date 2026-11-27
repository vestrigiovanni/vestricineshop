/**
 * I loghi ufficiali delle testate (bianchi su trasparente, alti 72 px), in
 * public/loghi/stampa: gli stessi di VestriCinema V2 (comune/loghi.ts), che li
 * aveva da VestriApp, più Vogue, Elle e Vanity Fair da Wikimedia Commons (25 novembre
 * 2026). Una testata che non è qui si scrive col suo nome.
 */
export const STAMPA = [
  'cahiers-du-cinema', 'chicago-sun-times', 'collider', 'elle', 'empire', 'entertainment-weekly', 'financial-times', 'ign',
  'indiewire', 'los-angeles-times', 'npr', 'rolling-stone', 'san-francisco-chronicle', 'screen-daily', 'screen-rant',
  'sight-and-sound', 'slant-magazine', 'the-a-v-club', 'the-atlantic', 'the-guardian', 'the-hollywood-reporter',
  'the-independent', 'the-irish-times', 'the-new-york-times', 'the-new-yorker', 'the-observer', 'the-playlist',
  'the-telegraph', 'the-washington-post', 'time', 'total-film', 'vanity-fair', 'variety', 'vogue', 'vulture',
] as const;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const chiave = (s: string) => norm(s.replace(/-/g, ' ')).replace(/\b(the|magazine|and|com|newspaper|online|daily)\b/g, ' ').replace(/\s+/g, '');
const PER_CHIAVE = new Map<string, string>(STAMPA.map(s => [chiave(s), s]));

/** Il logo di una testata, o null se non l'abbiamo. */
export function logoTestata(nome: string): string | null {
  const s = PER_CHIAVE.get(chiave(nome));
  return s ? `/loghi/stampa/${s}.png` : null;
}
