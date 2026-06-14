// Parser CSV puro per il catalogo film. Auto-rileva il delimitatore, gestisce
// virgolette (RFC4180-ish), BOM e header con nomi flessibili.

export interface CatalogCsvRow {
  title: string;
  year: number | null;
  durationMin: number | null;
  director: string | null;
}

function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/)[0] || '';
  const counts: Record<string, number> = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function tokenize(text: string, delim: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

export function parseCatalogCsv(text: string): CatalogCsvRow[] {
  if (!text || !text.trim()) return [];
  const delim = detectDelimiter(text);
  const records = tokenize(text, delim);
  if (!records.length) return [];

  const header = records[0].map((h) => h.replace(/^﻿/, '').trim().toLowerCase());
  const idx = {
    title: header.findIndex((h) => h.includes('title') || h.includes('titolo')),
    year: header.findIndex((h) => h.includes('year') || h.includes('anno')),
    duration: header.findIndex((h) => h.includes('dur')),
    director: header.findIndex((h) => h.includes('director') || h.includes('regist')),
  };

  const rows: CatalogCsvRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    if (!r.length || r.every((c) => c.trim() === '')) continue;
    const title = ((idx.title >= 0 ? r[idx.title] : r[0]) || '').trim();
    if (!title) continue;
    rows.push({
      title,
      year: parseIntOrNull(idx.year >= 0 ? r[idx.year] : undefined),
      durationMin: parseIntOrNull(idx.duration >= 0 ? r[idx.duration] : undefined),
      director: ((idx.director >= 0 ? r[idx.director] : '') || '').trim() || null,
    });
  }
  return rows;
}
