/**
 * La ricerca di ⌘K: pura, senza dipendenze, così si testa da sola.
 * Il punteggio preferisce ciò che si digita di solito, cioè l'inizio del nome,
 * ma perdona le abbreviazioni ("prgm" trova Programma).
 */
export type CommandKind = 'stanza' | 'azione' | 'film' | 'spettacolo';

export interface Command {
  id: string;
  label: string;
  kind: CommandKind;
  hint?: string;
  keywords?: string[];
  /** Dove porta: un indirizzo del gestionale, o uno esterno (si apre in una scheda nuova). */
  href?: string;
}

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
}

export function scoreCommand(query: string, cmd: Command): number {
  const q = normalize(query);
  if (!q) return 1;
  const label = normalize(cmd.label);
  const keywords = (cmd.keywords ?? []).map(normalize);

  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (label.includes(q)) return 40;
  if (keywords.some((k) => k.startsWith(q) || k.split(/\s+/).some((w) => w.startsWith(q)))) return 30;
  if (keywords.some((k) => k.includes(q))) return 20;
  if (isSubsequence(q, label)) return 10;
  return 0;
}

export function rankCommands(query: string, commands: Command[]): Command[] {
  return commands
    .map((cmd, index) => ({ cmd, index, score: scoreCommand(query, cmd) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.cmd);
}
