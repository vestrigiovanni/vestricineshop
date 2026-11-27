import { describe, it, expect } from 'vitest';
import { idCartellaDrive, idFileDrive } from './distributori';

describe('link di Drive', () => {
  it('un file, anche col numero dell’account (/file/u/2/d/)', () => {
    // «Banner Web» di I Wonder per La ballata del re delle api: prima diventava «il link porta a una pagina».
    expect(idFileDrive('https://drive.google.com/file/u/2/d/1_jhtgRT8-_0dsg26rDaxZm56gyorxYEd/view?usp=sharing')).toBe('1_jhtgRT8-_0dsg26rDaxZm56gyorxYEd');
    expect(idFileDrive('https://drive.google.com/file/d/1bQ2lr-2JkmIE2YpBZzL5CoZwV766SaXJ/view?usp=sharing')).toBe('1bQ2lr-2JkmIE2YpBZzL5CoZwV766SaXJ');
    expect(idFileDrive('https://drive.google.com/open?id=1bQ2lr-2JkmIE2YpBZzL5CoZwV766SaXJ')).toBe('1bQ2lr-2JkmIE2YpBZzL5CoZwV766SaXJ');
  });
  it('una cartella non è un file', () => {
    const c = 'https://drive.google.com/drive/u/1/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz';
    expect(idFileDrive(c)).toBeNull();
    expect(idCartellaDrive(c)).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
  });
});
