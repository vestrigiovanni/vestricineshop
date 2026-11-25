import { describe, it, expect, vi } from 'vitest';
import { entro, esito, messaggio, retePersa, rispostaSito, Spiegato } from './esito';

describe('esito', () => {
  it('riuscito: ok e i dati accanto', async () => {
    expect(await esito('Salvare', async () => ({ id: 'x' }))).toEqual({ ok: true, id: 'x' });
  });

  it('errore spiegato: il suo messaggio, senza log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await esito('Riempire', async () => { throw new Spiegato('luckyred.it risponde 403'); });
    expect(r).toEqual({ ok: false, errore: 'luckyred.it risponde 403' });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('errore imprevisto: frase italiana al gestionale, dettaglio nei log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await esito('Salvare', async () => { throw new Error('Cannot read properties of undefined'); });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errore).toMatch(/^Salvare: qualcosa è andato storto/);
      expect(r.errore).not.toMatch(/Cannot read/);
    }
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe('messaggio', () => {
  it('scadenza di fetch', () => {
    const e = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    expect(messaggio(e, 'Riempire')).toMatch(/ci ha messo troppo/);
  });
  it('database', () => {
    const e = Object.assign(new Error('x'), { name: 'PrismaClientKnownRequestError' });
    expect(messaggio(e, 'Salvare')).toMatch(/database/);
  });
  it('anche cose che non sono Error', () => {
    expect(messaggio('boh', 'Salvare')).toMatch(/^Salvare: /);
    expect(messaggio(null, 'Salvare')).toMatch(/^Salvare: /);
  });
});

describe('rispostaSito e retePersa', () => {
  it('403 e 429 dicono cosa fare', () => {
    expect(rispostaSito('luckyred.it', 403).message).toMatch(/^luckyred\.it risponde 403: .*a mano/);
    expect(rispostaSito('bimfilm.com', 429).message).toMatch(/qualche minuto/);
    expect(rispostaSito('x.it', 404).message).toMatch(/non c’è/);
    expect(rispostaSito('x.it', 503)).toBeInstanceOf(Spiegato);
  });
  it('scadenza con i secondi, irraggiungibile col motivo', () => {
    expect(retePersa('bimfilm.com', new DOMException('t', 'TimeoutError'), 20).message).toBe('bimfilm.com non ha risposto in 20 secondi. Riprova fra poco.');
    expect(retePersa('x.it', new TypeError('fetch failed')).message).toMatch(/non si raggiunge \(fetch failed\)/);
  });
  it('uno Spiegato passa com’è', () => {
    const e = new Spiegato('già detto');
    expect(retePersa('x.it', e)).toBe(e);
  });
});

describe('entro', () => {
  it('arriva prima: il risultato', async () => {
    expect(await entro(Promise.resolve(3), 1000, 'tardi')).toBe(3);
  });
  it('scade: uno Spiegato col testo', async () => {
    const mai = new Promise<number>(() => {});
    await expect(entro(mai, 5, 'Il distributore è troppo lento')).rejects.toThrow(Spiegato);
    await expect(entro(mai, 5, 'Il distributore è troppo lento')).rejects.toThrow('troppo lento');
  });
});
