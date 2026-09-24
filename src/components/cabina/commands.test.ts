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
