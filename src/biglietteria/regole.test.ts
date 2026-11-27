import { describe, expect, it } from 'vitest';
import {
  ITEM_INTERO_ID, ITEM_VIP_ID, avvisoEta, commentoPerPretix, avvisoPostiPresi, disponibilitaDaQuote, divietoNormale, emailValida, file, motivoRifiuto, nomePosto,
  postiDaPretix, postoBreve, prenotabile, quotaEsaurita, quotaIntero, rigaDaSottoevento, tmdbIdDaCommento,
} from './regole';

describe('tmdbIdDaCommento', () => {
  it('legge il JSON di oggi e la vecchia scritta', () => {
    expect(tmdbIdDaCommento('{"tmdbId":1765072,"rating":"T"}')).toBe('1765072');
    expect(tmdbIdDaCommento('Proiezione TMDB_ID:550 sala 1')).toBe('550');
    expect(tmdbIdDaCommento('{"rating":"T"}')).toBeNull();
    expect(tmdbIdDaCommento('niente')).toBeNull();
    expect(tmdbIdDaCommento(null)).toBeNull();
  });
});

describe('rigaDaSottoevento', () => {
  it('scrive la riga di PretixSync con le ore di Roma e il nome della sala', () => {
    const r = rigaDaSottoevento({
      id: 1, name: { it: 'Magnolia' }, slug: 'magnolia', date_from: '2026-11-27T20:00:00Z', date_to: '2026-11-27T23:08:00Z',
      seating_plan: 5392, comment: '{"tmdbId":334}', active: true, meta_data: { lingua: 'Inglese', sottotitoli: 'Italiano' },
    }, { 5392: 'CA GRANDA' });
    expect(r).toMatchObject({ name: 'Magnolia', startTime: '21:00', endTime: '00:08', roomName: 'CA GRANDA', tmdbId: '334', metaLingua: 'Inglese', metaFormat: null });
  });
  it('senza pianta la sala è "Sala"', () => {
    expect(rigaDaSottoevento({ id: 2, name: 'X', date_from: '2026-11-27T20:00:00Z', active: true }, {}).roomName).toBe('Sala');
  });
});

describe('commentoPerPretix', () => {
  it('scrive i metadati con le chiavi della v1 e i valori di riserva', () => {
    const c = commentoPerPretix('334', { customLogoPath: 'none', awards: [{ type: 'cannes', details: 'Vincitore: Palma d’oro', year: 1999 }] });
    expect(c).toMatchObject({ tmdbId: '334', rating: 'T', runtime: 120, versionLanguage: 'ITA', subtitles: 'NESSUNO', logoPath: '', hasCannes: true, cannesDetails: 'Vincitore: Palma d’oro', hasOscar: false, awardYear: 1999 });
    expect(Object.keys(c)).toEqual(['tmdbId', 'rating', 'runtime', 'versionLanguage', 'subtitles', 'posterPath', 'backdropPath', 'logoPath', 'director', 'cast', 'hasOscar', 'oscarDetails', 'hasCannes', 'cannesDetails', 'hasVenice', 'veniceDetails', 'awardYear', 'awards', 'trailerUrl']);
  });
});

describe('quote', () => {
  it("trova la quota dell'intero per nome o per prodotto", () => {
    expect(quotaIntero([{ name: 'VIP', items: [ITEM_VIP_ID] }, { name: 'Quota Intero', items: [] }])?.name).toBe('Quota Intero');
    expect(quotaIntero([{ name: 'Altro', items: [ITEM_INTERO_ID] }])?.name).toBe('Altro');
    expect(quotaIntero([{ name: 'VIP', items: [ITEM_VIP_ID] }])).toBeNull();
  });
  it('esaurita a zero, mai se illimitata', () => {
    expect(quotaEsaurita({ available_number: 0 })).toBe(true);
    expect(quotaEsaurita({ available_number: 3 })).toBe(false);
    expect(quotaEsaurita({ available_number: null })).toBe(false);
  });
  it('prima della conferma somma intero e VIP; senza quote si va avanti', () => {
    expect(disponibilitaDaQuote([{ items: [ITEM_INTERO_ID], available_number: 0, available: false }, { items: [ITEM_VIP_ID], available_number: 0, available: false }])).toEqual({ esaurito: true, liberi: 0 });
    expect(disponibilitaDaQuote([{ items: [ITEM_INTERO_ID], available_number: 2, available: true }])).toEqual({ esaurito: false, liberi: 2 });
    expect(disponibilitaDaQuote([])).toEqual({ esaurito: false, liberi: null });
  });
});

describe('posti', () => {
  const grezzi = [
    { seat_guid: 'b2', row_name: 'B', seat_number: '2', available: true, orderposition: null, cartposition: null },
    { seat_guid: 'a10', row_name: 'A', seat_number: '10', available: true, orderposition: null, cartposition: null },
    { seat_guid: 'a2', row_name: 'A', seat_number: '2', available: false, orderposition: 5, cartposition: null },
    { seat_guid: 'VIP-1', row_name: 'A', seat_number: '1', available: true, orderposition: null, cartposition: null },
  ];
  it('ordina per fila e numero (10 dopo 2) e riconosce occupati e VIP', () => {
    const p = postiDaPretix(grezzi);
    expect(p.map(x => x.id)).toEqual(['VIP-1', 'a2', 'a10', 'b2']);
    expect(p.map(prenotabile)).toEqual([false, false, true, true]);
    expect(p[2].etichetta).toBe('Fila A - Posto 10');
  });
  it('un posto senza fila tiene il suo nome', () => {
    expect(postiDaPretix([{ id: 9, name: 'Divano' }])[0]).toMatchObject({ id: '9', etichetta: 'Divano', occupato: false });
  });
  it('raggruppa le file', () => {
    expect(file(postiDaPretix(grezzi)).map(f => [f.fila, f.posti.length])).toEqual([['A', 3], ['B', 1]]);
  });
});

describe('testi', () => {
  it('il divieto nelle sigle italiane', () => {
    expect(['VM18', '14', 'PG-13', '', 'T', '16', 'boh'].map(divietoNormale)).toEqual(['18+', '14+', '14+', 'T', 'T', '18+', 'T']);
  });
  it("l'avviso: solo il 18+ è un divieto", () => {
    expect(avvisoEta('18+')?.divieto).toBe(true);
    expect(avvisoEta('VM14')?.divieto).toBe(false);
    expect(avvisoEta('6+')?.testo).toContain('consigliata dai 6 anni');
    expect(avvisoEta('T')).toBeNull();
  });
  it('il posto del biglietto in italiano', () => {
    expect(nomePosto({ name: 'GATE 2, Row 10, Seat 10' })).toBe('Fila 10 - Posto 10');
    expect(nomePosto({ name: 'x', row_name: 'B', seat_number: '5' })).toBe('Fila B - Posto 5');
    expect(nomePosto({ name: 'Divano' })).toBe('Divano');
    expect(nomePosto(null)).toBe('Posto unico');
  });
  it('il posto in breve', () => {
    expect(postoBreve('Fila B - Posto 5')).toBe('B5');
    expect(postoBreve('Fila 12 - Posto 3')).toBe('12·3');
    expect(postoBreve('Divano')).toBe('Divano');
  });
  it('i posti presi da altri', () => {
    expect(avvisoPostiPresi(['B5'])).toContain('Il posto B5');
    expect(avvisoPostiPresi(['B5', 'B6'])).toContain('B5, B6');
  });
  it('il motivo di un ordine rifiutato, in italiano', () => {
    expect(motivoRifiuto({ positions: [{ seat: ['The selected seat "B5" is not available.'] }] })).toContain('non è più libero');
    expect(motivoRifiuto({ positions: [{}, { item: ['There is not enough quota available.'] }] })).toContain('finiti');
    expect(motivoRifiuto({ email: ['Enter a valid email address.'] })).toContain('email');
    expect(motivoRifiuto('boh')).toContain('Riprova');
  });
  it("l'email", () => {
    expect(emailValida('gio@esempio.it')).toBe(true);
    expect(emailValida('gio@esempio')).toBe(false);
  });
});
