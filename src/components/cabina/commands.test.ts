import { describe, it, expect } from 'vitest';
import { ADMIN_COMMANDS, roomCommandId } from './commands';
import { ROOMS } from './rooms';

describe('ADMIN_COMMANDS', () => {
  it('ha un comando per ogni stanza', () => {
    for (const room of ROOMS) {
      expect(ADMIN_COMMANDS.some((c) => c.id === roomCommandId(room.key))).toBe(true);
    }
  });

  it('non ha id ripetuti', () => {
    const ids = ADMIN_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('elenca prima le stanze e poi le azioni', () => {
    const kinds = ADMIN_COMMANDS.map((c) => c.kind);
    expect(kinds.lastIndexOf('stanza')).toBeLessThan(kinds.indexOf('azione'));
  });
});

describe('dynamicCommands', () => {
  it('ogni film in arrivo apre la sua scheda, ogni spettacolo dei prossimi giorni apre il tavolo su quel giorno', async () => {
    const { dynamicCommands } = await import('./commands');
    const now = Date.parse('2026-09-28T08:00:00Z'); // lunedì 28, 10:00 a Roma
    const cmds = dynamicCommands(
      [
        {
          tmdbId: '839',
          title: 'Duel',
          projections: [
            { pretixId: 1, dateFrom: '2026-09-27T14:30:00Z' }, // ieri: non conta
            { pretixId: 2, dateFrom: '2026-09-29T14:30:00Z' }, // martedì 16:30
            { pretixId: 3, dateFrom: '2026-10-01T22:30:00Z' }, // venerdì 00:30: coda di giovedì
            { pretixId: 4, dateFrom: '2026-10-30T18:00:00Z' }, // fra un mese: niente spettacolo, ma il film resta
          ],
        },
        { tmdbId: '1', title: 'Passato', projections: [{ pretixId: 9, dateFrom: '2026-09-01T18:00:00Z' }] },
      ],
      now,
    );
    expect(cmds.find((c) => c.id === 'film:839')).toMatchObject({ kind: 'film', href: '/admin/film?tmdb=839' });
    expect(cmds.find((c) => c.id === 'film:1')).toBeUndefined();
    expect(cmds.filter((c) => c.kind === 'spettacolo').map((c) => [c.label, c.href])).toEqual([
      ['Duel · mar 29 alle 16:30', '/admin/programma?from=2026-09-29&days=1'],
      ['Duel · gio 1 alle 00:30', '/admin/programma?from=2026-10-01&days=1'],
    ]);
  });
});
