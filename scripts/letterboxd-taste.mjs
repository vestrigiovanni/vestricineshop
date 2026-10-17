#!/usr/bin/env node
/**
 * Il gusto della sala, da Letterboxd.
 *
 * Legge l'esportazione di Letterboxd (la cartella estratta, o lo zip così come
 * arriva) e scrive `src/data/gusto-sala.json`: voti, cuori, watchlist e le
 * liste che dicono qualcosa sulla programmazione. La programmazione automatica
 * lo usa per scegliere come sceglierebbe Gio, invece che per popolarità.
 *
 * Uso:
 *   node scripts/letterboxd-taste.mjs ~/Downloads/letterboxd-giovannivestri-….zip
 *
 * Si rilancia a ogni nuova esportazione: il file viene riscritto da capo.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('Uso: node scripts/letterboxd-taste.mjs <export.zip | cartella>');
  process.exit(1);
}

let dir = resolve(src);
if (dir.endsWith('.zip')) {
  const out = mkdtempSync(join(tmpdir(), 'letterboxd-'));
  execFileSync('unzip', ['-q', '-o', dir, '-d', out]);
  dir = out;
}

/** CSV con i campi fra virgolette, anche su più righe (le descrizioni delle liste). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}

/** Righe come oggetti, partendo dalla riga d'intestazione che contiene `Name`. */
function readTable(file) {
  const path = join(dir, file);
  if (!existsSync(path)) return [];
  const rows = parseCsv(readFileSync(path, 'utf8'));
  // Le liste hanno un preambolo (nome, data, descrizione) prima della tabella dei film.
  const start = rows.findIndex((r, i) => r.includes('Name') && r.includes('Year') && (i > 0 || !file.startsWith('lists/')));
  const header = rows[start === -1 ? 0 : start];
  const body = rows.slice((start === -1 ? 0 : start) + 1);
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const year = (v) => (Number.parseInt(v, 10) || null);
const key = (r) => `${r.Name}|${r.Year}`;

const liked = new Set(readTable('likes/films.csv').map(key));

const ratings = readTable('ratings.csv')
  .filter((r) => r.Name && r.Rating)
  .map((r) => [r.Name, year(r.Year), Number.parseFloat(r.Rating), liked.has(key(r)) ? 1 : 0]);

// I film col cuore ma senza stelle contano lo stesso: un cuore è un voto.
const rated = new Set(ratings.map(([n, y]) => `${n}|${y}`));
for (const k of liked) {
  if (rated.has(k)) continue;
  const [name, y] = k.split('|');
  ratings.push([name, year(y), null, 1]);
}

const watchlist = readTable('watchlist.csv').filter((r) => r.Name).map((r) => [r.Name, year(r.Year)]);

// Le liste: "VestriCinema" è il cartellone dei desideri della sala, "Storia del
// cinema" e "Storia del documentario" sono il canone da cui pescano le matinée.
const lists = {};
const listDir = join(dir, 'lists');
if (existsSync(listDir)) {
  for (const file of readdirSync(listDir)) {
    const name = file.replace(/\.csv$/, '');
    let tag = null;
    if (name.startsWith('vestricinema')) tag = 'sala';
    else if (name.startsWith('storia-del-')) tag = 'canone';
    if (!tag) continue;
    const films = readTable(`lists/${file}`).filter((r) => r.Name).map((r) => [r.Name, year(r.Year)]);
    lists[tag] = [...(lists[tag] ?? []), ...films];
  }
}

const out = {
  fonte: 'Esportazione Letterboxd di Gio',
  generato: new Date().toISOString().slice(0, 10),
  // [titolo, anno, stelle (0.5–5, null se solo cuore), cuore 0/1]
  ratings,
  watchlist,
  lists,
};

const target = resolve('src/data/gusto-sala.json');
writeFileSync(target, JSON.stringify(out) + '\n');
console.log(
  `Scritto ${target}: ${ratings.length} film votati, ${watchlist.length} in watchlist, ` +
    Object.entries(lists).map(([k, v]) => `${v.length} in "${k}"`).join(', ')
);
