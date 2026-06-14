import { describe, it, expect } from 'vitest';
import { parseCatalogCsv } from './catalogCsv';

describe('parseCatalogCsv', () => {
  it('parsa header e righe con delimitatore virgola', () => {
    const csv =
      'Title,Year,Duration (min),Director\n' +
      'Cuatro Lunas,2014,107,Sergio Tovar Velarde\n' +
      '"Good, Bad",1999,120,Sergio Leone\n';
    const rows = parseCatalogCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ title: 'Cuatro Lunas', year: 2014, durationMin: 107, director: 'Sergio Tovar Velarde' });
    expect(rows[1].title).toBe('Good, Bad'); // virgola dentro le virgolette preservata
  });

  it('rileva il delimitatore punto e virgola e ignora il BOM', () => {
    const csv = '﻿Title;Year;Duration (min);Director\nFilm X;2001;90;Tizio\n';
    const rows = parseCatalogCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ title: 'Film X', year: 2001, durationMin: 90, director: 'Tizio' });
  });

  it('salta righe vuote e gestisce campi mancanti', () => {
    const csv = 'Title,Year,Duration (min),Director\nSolo Titolo,,,\n\n';
    const rows = parseCatalogCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ title: 'Solo Titolo', year: null, durationMin: null, director: null });
  });
});
