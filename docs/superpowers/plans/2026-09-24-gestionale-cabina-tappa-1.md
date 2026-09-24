# Gestionale Cabina — Tappa 1: fondamenta e casa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **In questo progetto si esegue inline** (Giovanni non vuole agenti delegati).

**Goal:** dare al gestionale una casa, `/admin`. Ha l'identità Cabina, una barra con le stanze, la ricerca ⌘K, un accesso solo e gli indirizzi vecchi ancora vivi. Nessuna funzione va persa.

**Architecture:**
- **Due layout annidati.**
  - `src/app/admin/layout.tsx` dà l'identità a tutto `/admin`, login compreso: variabili di colore, caratteri, grana.
  - Il gruppo di rotte `src/app/admin/(casa)/` aggiunge il guscio: barra, ⌘K, avvisi. Il login ne resta fuori.
- **Le pagine esistenti si spostano dentro il gruppo senza essere riscritte**, e prendono il nome della loro stanza.
- **I vecchi indirizzi** si reindirizzano con `redirects` in `next.config.ts`.
- **I pezzi riusabili** stanno in `src/components/cabina/`.
- **La logica pura è separata e testata:** stanza attiva e ricerca.

**Tech Stack:** Next 16.2 (App Router, `proxy.ts`), React 19, CSS Modules, `next/font/google`, lucide-react, vitest (ambiente node: si testa solo la logica pura).

**Spec:** `docs/superpowers/specs/2026-09-24-gestionale-cabina-design.md`

---

## Cosa succede alle stanze in questa tappa

Le stanze nuove non esistono ancora. Per questo la barra mostra **solo le stanze che hanno già una pagina**:

| Stanza | Pagina in questa tappa |
|---|---|
| **Oggi** (`/admin`) | ospita, provvisoriamente, il vecchio `AdminPanel`, che contiene ancora Sale, Display, Catalogo, Recupero biglietti e la lista Pretix. La tappa 2 lo sostituisce |
| **Programma** (`/admin/programma`) | il wizard di oggi, spostato |
| **Film** (`/admin/film`) | movies-control di oggi, spostato |
| **Cassa** (`/admin/cassa`) | la cassa di oggi, spostata, con la barra compatta |

Catalogo, Sale, Display e Attrezzi entrano nella barra quando nascono (tappe 4 e 6). Fino ad allora ⌘K porta a "Oggi" chi le cerca, perché le loro funzioni stanno ancora lì.

## Mappa dei file

| File | Azione | Responsabilità |
|---|---|---|
| `src/components/cabina/rooms.ts` | crea | elenco stanze, stanza attiva da un pathname, stanze compatte |
| `src/components/cabina/rooms.test.ts` | crea | test di `rooms.ts` |
| `src/components/cabina/commandIndex.ts` | crea | normalizzazione e punteggio della ricerca ⌘K (puro) |
| `src/components/cabina/commandIndex.test.ts` | crea | test della ricerca |
| `src/components/cabina/commands.ts` | crea | l'elenco dei comandi del gestionale (stanze + azioni) |
| `src/components/cabina/commands.test.ts` | crea | ogni stanza ha il suo comando, id unici |
| `src/config/adminRedirects.test.ts` | crea | i vecchi indirizzi portano alla stanza giusta |
| `next.config.ts` | modifica | `redirects()` |
| `src/components/cabina/cabina.css` | crea | variabili `.cabina`, grana, movimento ridotto |
| `src/app/admin/layout.tsx` | crea | caratteri + classe `.cabina` su tutto `/admin` |
| `src/components/cabina/Button.tsx` + `.module.css` | crea | bottone (piena, contorno, fantasma, allarme), anche come link |
| `src/components/cabina/Field.tsx` + `.module.css` | crea | campo con etichetta, aiuto, errore, elemento in coda |
| `src/components/cabina/Dialog.tsx` + `.module.css` | crea | finestra modale (centro, palette, foglio dal basso) |
| `src/components/cabina/Toast.tsx` + `.module.css` | crea | avvisi: `ToastProvider` e `useToast()` |
| `src/components/cabina/CommandPalette.tsx` + `.module.css` | crea | ⌘K |
| `src/components/cabina/AdminShell.tsx` + `.module.css` | crea | barra in alto, barra in basso sul telefono, "Altro", scorciatoia ⌘K |
| `src/app/admin/(casa)/layout.tsx` | crea | monta avvisi e guscio |
| `src/app/admin/(casa)/page.tsx` | crea | Oggi provvisorio (vecchio `AdminPanel`) |
| `src/app/admin/programmazione/` → `src/app/admin/(casa)/programma/` | sposta | — |
| `src/app/admin/movies-control/` → `src/app/admin/(casa)/film/` | sposta | — |
| `src/app/admin/cassa/` → `src/app/admin/(casa)/cassa/` | sposta | — |
| `src/app/admin/planner/` | elimina | sostituito da un redirect |
| `src/app/admin/login/page.tsx` + `login.module.css` | riscrive | login Cabina, ritorno predefinito a `/admin` |
| `src/components/Footer.tsx` + `Footer.module.css` | modifica | "Admin" diventa un link a `/admin`; via modale e overlay |
| `src/components/ClientFooter.tsx` | modifica | footer nascosto su tutto `/admin` |
| `src/components/Admin/AdminOverlay.tsx` + `.module.css` | elimina | non lo usa più nessuno |
| `src/components/Admin/AdminPanel.tsx` | modifica | link verso i nuovi indirizzi |
| `src/actions/adminActions.ts`, `src/services/sync.service.ts` | modifica | `revalidatePath('/admin/movies-control')` → `'/admin/film'` |

**Regole di esecuzione in questo progetto:**
- non avviare il dev server;
- non lanciare `next build`, perché Giovanni potrebbe avere il suo dev server acceso;
- le verifiche si fanno con `npx vitest run` e `npx tsc --noEmit`;
- messaggi di commit in italiano, nello stile del log (titolo che racconta, corpo che spiega il perché).

---

### Task 1: Le stanze e la stanza attiva

**Files:**
- Create: `src/components/cabina/rooms.ts`
- Test: `src/components/cabina/rooms.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// src/components/cabina/rooms.test.ts
import { describe, it, expect } from 'vitest';
import { ROOMS, activeRoom, isCompactRoom } from './rooms';

describe('activeRoom', () => {
  it('riconosce la home del gestionale, anche con la barra finale', () => {
    expect(activeRoom('/admin')).toBe('oggi');
    expect(activeRoom('/admin/')).toBe('oggi');
  });

  it('riconosce ogni stanza e le sue sottopagine', () => {
    expect(activeRoom('/admin/programma')).toBe('programma');
    expect(activeRoom('/admin/programma/qualcosa')).toBe('programma');
    expect(activeRoom('/admin/film')).toBe('film');
    expect(activeRoom('/admin/cassa')).toBe('cassa');
  });

  it('non confonde un prefisso con una stanza', () => {
    // "programmazione" comincia con "programma" ma non è quella stanza
    expect(activeRoom('/admin/programmazione')).toBeNull();
    expect(activeRoom('/admin/filmografia')).toBeNull();
  });

  it('fuori dalle stanze non accende niente', () => {
    expect(activeRoom('/admin/login')).toBeNull();
    expect(activeRoom('/')).toBeNull();
  });
});

describe('isCompactRoom', () => {
  it('la cassa usa la barra compatta, le altre no', () => {
    expect(isCompactRoom('/admin/cassa')).toBe(true);
    expect(isCompactRoom('/admin/programma')).toBe(false);
    expect(isCompactRoom('/admin')).toBe(false);
  });
});

describe('ROOMS', () => {
  it('ha chiavi e indirizzi unici, tutti sotto /admin', () => {
    const keys = ROOMS.map((r) => r.key);
    const hrefs = ROOMS.map((r) => r.href);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(h === '/admin' || h.startsWith('/admin/')).toBe(true);
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `npx vitest run src/components/cabina/rooms.test.ts`
Expected: FAIL, "Failed to resolve import './rooms'"

- [ ] **Step 3: Scrivi `rooms.ts`**

```ts
// src/components/cabina/rooms.ts

/**
 * Le stanze del gestionale.
 *
 * Nella barra compaiono solo le stanze che hanno già una pagina: Catalogo, Sale,
 * Display e Attrezzi entrano quando nascono (tappe 4 e 6 del restyling). Fino ad
 * allora le loro funzioni vivono nel vecchio pannello, che sta in "Oggi". Per questo
 * le loro parole chiave, per ora, puntano lì.
 */
export type RoomKey = 'oggi' | 'programma' | 'film' | 'cassa';

export interface Room {
  key: RoomKey;
  label: string;
  href: string;
  /** Sta nella barra in basso sul telefono. */
  mobile: boolean;
  /** Parole in più con cui ⌘K la trova. */
  keywords: string[];
  /** Schermata da banco: la barra del guscio si riduce. */
  compact?: boolean;
}

export const ROOMS: Room[] = [
  {
    key: 'oggi',
    label: 'Oggi',
    href: '/admin',
    mobile: true,
    keywords: ['home', 'pannello', 'sale', 'display', 'preroll', 'catalogo', 'recupero biglietti', 'pretix'],
  },
  {
    key: 'programma',
    label: 'Programma',
    href: '/admin/programma',
    mobile: true,
    keywords: ['programmazione', 'palinsesto', 'settimana', 'wizard', 'planner', 'spettacoli'],
  },
  {
    key: 'film',
    label: 'Film',
    href: '/admin/film',
    mobile: true,
    keywords: ['torre di controllo', 'override', 'trama', 'locandina', 'trailer', 'premi', 'lingua'],
  },
  {
    key: 'cassa',
    label: 'Cassa',
    href: '/admin/cassa',
    mobile: true,
    keywords: ['vendita', 'biglietti', 'stampa', 'banco'],
    compact: true,
  },
];

function clean(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function roomFor(pathname: string): Room | null {
  const path = clean(pathname);
  if (path === '/admin') return ROOMS.find((r) => r.href === '/admin') ?? null;
  return ROOMS.find((r) => r.href !== '/admin' && (path === r.href || path.startsWith(r.href + '/'))) ?? null;
}

export function activeRoom(pathname: string): RoomKey | null {
  return roomFor(pathname)?.key ?? null;
}

export function isCompactRoom(pathname: string): boolean {
  return roomFor(pathname)?.compact === true;
}
```

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `npx vitest run src/components/cabina/rooms.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/cabina/rooms.ts src/components/cabina/rooms.test.ts
git commit -m "Le stanze del gestionale hanno un elenco e un nome"
```

---

### Task 2: La ricerca di ⌘K

**Files:**
- Create: `src/components/cabina/commandIndex.ts`
- Test: `src/components/cabina/commandIndex.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// src/components/cabina/commandIndex.test.ts
import { describe, it, expect } from 'vitest';
import { normalize, scoreCommand, rankCommands, type Command } from './commandIndex';

const C = (id: string, label: string, keywords: string[] = []): Command => ({ id, label, kind: 'azione', keywords });

const commands: Command[] = [
  C('oggi', 'Oggi', ['sale', 'display']),
  C('programma', 'Programma', ['palinsesto']),
  C('cassa', 'Cassa'),
  C('cache', 'Svuota la cache'),
  C('citta', 'Città'),
];

describe('normalize', () => {
  it('toglie accenti, maiuscole e spazi ai bordi', () => {
    expect(normalize('  Città ')).toBe('citta');
    expect(normalize('PROGRAMMA')).toBe('programma');
  });
});

describe('scoreCommand', () => {
  it('ordina i tipi di corrispondenza dal più forte al più debole', () => {
    const exact = scoreCommand('cassa', C('a', 'Cassa'));
    const prefix = scoreCommand('cas', C('a', 'Cassa'));
    const word = scoreCommand('cac', C('a', 'Svuota la cache'));
    const inside = scoreCommand('ass', C('a', 'Cassa'));
    const keyword = scoreCommand('pal', C('a', 'Programma', ['palinsesto']));
    const subsequence = scoreCommand('prgm', C('a', 'Programma'));
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThan(0);
  });

  it('dà zero quando non c’entra niente', () => {
    expect(scoreCommand('zzz', C('a', 'Cassa'))).toBe(0);
  });
});

describe('rankCommands', () => {
  it('senza ricerca restituisce tutto, nell’ordine originale', () => {
    expect(rankCommands('', commands).map((c) => c.id)).toEqual(['oggi', 'programma', 'cassa', 'cache', 'citta']);
    expect(rankCommands('   ', commands)).toHaveLength(5);
  });

  it('mette prima l’inizio del nome e poi l’inizio di una parola', () => {
    expect(rankCommands('c', commands).map((c) => c.id).slice(0, 3)).toEqual(['cassa', 'citta', 'cache']);
  });

  it('trova per parola chiave e ignora gli accenti', () => {
    expect(rankCommands('sale', commands)[0].id).toBe('oggi');
    expect(rankCommands('citta', commands)[0].id).toBe('citta');
  });

  it('scarta ciò che non corrisponde', () => {
    expect(rankCommands('zzz', commands)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `npx vitest run src/components/cabina/commandIndex.test.ts`
Expected: FAIL, "Failed to resolve import './commandIndex'"

- [ ] **Step 3: Scrivi `commandIndex.ts`**

```ts
// src/components/cabina/commandIndex.ts

/**
 * La ricerca di ⌘K: pura, senza dipendenze, così si testa da sola.
 * Il punteggio preferisce ciò che si digita di solito, cioè l'inizio del nome,
 * ma perdona le abbreviazioni ("prgm" trova Programma).
 */
export type CommandKind = 'stanza' | 'azione';

export interface Command {
  id: string;
  label: string;
  kind: CommandKind;
  hint?: string;
  keywords?: string[];
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
```

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `npx vitest run src/components/cabina/commandIndex.test.ts`
Expected: PASS (7 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/cabina/commandIndex.ts src/components/cabina/commandIndex.test.ts
git commit -m "⌘K sa cercare: prima l'inizio del nome, poi le abbreviazioni"
```

---

### Task 3: I comandi del gestionale

**Files:**
- Create: `src/components/cabina/commands.ts`
- Test: `src/components/cabina/commands.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// src/components/cabina/commands.test.ts
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
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `npx vitest run src/components/cabina/commands.test.ts`
Expected: FAIL, "Failed to resolve import './commands'"

- [ ] **Step 3: Scrivi `commands.ts`**

```ts
// src/components/cabina/commands.ts
import type { Command } from './commandIndex';
import { ROOMS, type RoomKey } from './rooms';

/** Le azioni che ⌘K sa eseguire da qualunque stanza. Chi le esegue è CommandPalette. */
export type ActionId = 'azione:svuota-cache' | 'azione:display' | 'azione:sito' | 'azione:esci';

export function roomCommandId(key: RoomKey): string {
  return `stanza:${key}`;
}

export const ADMIN_COMMANDS: Command[] = [
  ...ROOMS.map((room) => ({
    id: roomCommandId(room.key),
    label: room.label,
    kind: 'stanza' as const,
    hint: 'Stanza',
    keywords: room.keywords,
  })),
  {
    id: 'azione:svuota-cache',
    label: 'Svuota la cache',
    kind: 'azione',
    hint: 'Rilegge Pretix alla prossima visita',
    keywords: ['cache', 'aggiorna', 'pretix', 'ricarica'],
  },
  {
    id: 'azione:display',
    label: 'Lancia il display d’ingresso',
    kind: 'azione',
    hint: 'Si apre in una nuova finestra',
    keywords: ['schermo', 'display', 'ingresso', 'info on screen'],
  },
  {
    id: 'azione:sito',
    label: 'Vai al sito pubblico',
    kind: 'azione',
    keywords: ['home', 'sito', 'pubblico'],
  },
  {
    id: 'azione:esci',
    label: 'Esci dal gestionale',
    kind: 'azione',
    keywords: ['logout', 'esci', 'disconnetti'],
  },
];
```

- [ ] **Step 4: Lancia il test e verifica che passi**

Run: `npx vitest run src/components/cabina/commands.test.ts`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/cabina/commands.ts src/components/cabina/commands.test.ts
git commit -m "I comandi di ⌘K: le stanze e quattro azioni"
```

---

### Task 4: Le stanze prendono il loro nome, gli indirizzi vecchi restano vivi

**Files:**
- Move: `src/app/admin/programmazione` → `src/app/admin/(casa)/programma`
- Move: `src/app/admin/movies-control` → `src/app/admin/(casa)/film`
- Move: `src/app/admin/cassa` → `src/app/admin/(casa)/cassa`
- Delete: `src/app/admin/planner/page.tsx`
- Modify: `next.config.ts`
- Modify: `src/components/Admin/AdminPanel.tsx` (righe 82, 341, 378, 395, 409, 614)
- Modify: `src/actions/adminActions.ts`, `src/services/sync.service.ts` (`revalidatePath`)
- Test: `src/config/adminRedirects.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// src/config/adminRedirects.test.ts
import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';
import { ROOMS } from '../components/cabina/rooms';

describe('redirects del gestionale', () => {
  it('portano ogni vecchio indirizzo alla sua stanza', async () => {
    const list = await nextConfig.redirects!();
    const map = Object.fromEntries(list.map((r) => [r.source, r.destination]));
    expect(map['/admin/programmazione']).toBe('/admin/programma');
    expect(map['/admin/planner']).toBe('/admin/programma');
    expect(map['/admin/movies-control']).toBe('/admin/film');
  });

  it('sono temporanei, così un domani si possono cambiare senza cache nei browser', async () => {
    const list = await nextConfig.redirects!();
    for (const r of list) expect(r.permanent).toBe(false);
  });

  it('puntano solo a stanze che esistono', async () => {
    const list = await nextConfig.redirects!();
    const hrefs = new Set(ROOMS.map((r) => r.href));
    for (const r of list) expect(hrefs.has(r.destination)).toBe(true);
  });
});
```

(Le query string passano da sole: la guida di Next 16, `redirects.md`, dice che *"any query values provided in the request will be passed through to the redirect destination"*. Così "Replica", che apre la programmazione con i parametri del film, continua a funzionare.)

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Run: `npx vitest run src/config/adminRedirects.test.ts`
Expected: FAIL, "nextConfig.redirects is not a function" (o un `TypeError` su `undefined`)

- [ ] **Step 3: Aggiungi `redirects` a `next.config.ts`**

Dentro `nextConfig`, dopo il blocco `images`:

```ts
  /**
   * Gli indirizzi di prima del gestionale-cabina restano vivi: sono nei
   * segnalibri e nella memoria delle dita. Temporanei (307) di proposito, così
   * i browser non li mettono in cache per sempre. Le query string passano da
   * sole: "Replica" apre la programmazione con il film già scelto.
   */
  async redirects() {
    return [
      { source: '/admin/programmazione', destination: '/admin/programma', permanent: false },
      { source: '/admin/planner', destination: '/admin/programma', permanent: false },
      { source: '/admin/movies-control', destination: '/admin/film', permanent: false },
    ];
  },
```

- [ ] **Step 4: Sposta le cartelle ed elimina il vecchio planner**

```bash
mkdir -p "src/app/admin/(casa)"
git mv src/app/admin/programmazione "src/app/admin/(casa)/programma"
git mv src/app/admin/movies-control "src/app/admin/(casa)/film"
git mv src/app/admin/cassa "src/app/admin/(casa)/cassa"
git rm -q src/app/admin/planner/page.tsx
```

Le cartelle spostate importano solo con `./` o `@/`, già verificato con `grep "from '\.\./"`, quindi non si rompe nessun import.

- [ ] **Step 5: Aggiorna i link del vecchio pannello e le `revalidatePath`**

```bash
sed -i '' 's#/admin/programmazione#/admin/programma#g; s#/admin/movies-control#/admin/film#g' src/components/Admin/AdminPanel.tsx
sed -i '' "s#revalidatePath('/admin/movies-control')#revalidatePath('/admin/film')#g" src/actions/adminActions.ts src/services/sync.service.ts
grep -rn "admin/programmazione\|admin/movies-control\|admin/planner" src
```

Expected: l'unica occorrenza rimasta è il test dei redirect, `src/config/adminRedirects.test.ts`.

- [ ] **Step 6: Nel cassa layout, il titolo si adatta al modello che arriva nel Task 6**

In `src/app/admin/(casa)/cassa/layout.tsx` sostituisci:

```ts
  title: 'CASSA — VESTRICINEMA',
```

con:

```ts
  title: 'Cassa',
```

- [ ] **Step 7: Lancia test e tipi**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tutti i test PASS (222 di prima + 19 nuovi = 241), `tsc` senza output

- [ ] **Step 8: Commit**

```bash
git add -A src/app/admin next.config.ts src/config/adminRedirects.test.ts src/components/Admin/AdminPanel.tsx src/actions/adminActions.ts src/services/sync.service.ts
git commit -m "Le stanze prendono il loro nome, e i vecchi indirizzi ci portano dentro"
```

---

### Task 5: L'identità Cabina

**Files:**
- Create: `src/components/cabina/cabina.css`

- [ ] **Step 1: Scrivi le variabili e la grana**

```css
/* src/components/cabina/cabina.css
 *
 * L'identità del gestionale: nero caldo, ambra come la lampada del proiettore,
 * grana di pellicola. Tutto vive sotto `.cabina` perché il sito pubblico non
 * cambi finché non arriva il suo turno nel restyling.
 */
.cabina {
  --c-bg: #100d0a;
  --c-bg-raised: #17130f;
  --c-bg-sunken: #0b0907;
  --c-line: #2a231c;
  --c-line-strong: #3a3128;
  --c-ink: #efe6d8;
  --c-dim: #8a7d6c;
  --c-amber: #e8a33d;
  --c-amber-soft: rgba(232, 163, 61, 0.12);
  --c-amber-ink: #1a130b;
  --c-alarm: #d4553a;
  --c-alarm-soft: rgba(212, 85, 58, 0.1);
  --c-ok: #9bb07a;
  --c-ok-soft: rgba(155, 176, 122, 0.12);

  --c-font-serif: var(--font-cab-serif), Georgia, serif;
  --c-font-mono: var(--font-cab-mono), ui-monospace, 'SF Mono', Menlo, monospace;
  --c-font-sans: var(--font-inter), system-ui, -apple-system, sans-serif;

  --c-radius: 6px;
  --c-radius-lg: 10px;
  --c-fast: 150ms cubic-bezier(0.2, 0, 0, 1);
  --c-slow: 250ms cubic-bezier(0.2, 0, 0, 1);
  --c-topbar-h: 52px;
  --c-bottombar-h: 64px;

  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--c-bg);
  color: var(--c-ink);
  font-family: var(--c-font-sans);
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  color-scheme: dark;
}

/* La grana: sopra tutto, sotto nessun clic. */
.cabina::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  opacity: 0.07;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.cabina ::selection {
  background: var(--c-amber);
  color: var(--c-amber-ink);
}

.cabina :focus-visible {
  outline: 2px solid var(--c-amber);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .cabina *,
  .cabina *::before,
  .cabina *::after {
    transition-duration: 0s !important;
    animation-duration: 0s !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/cabina/cabina.css
git commit -m "L'identità Cabina: nero caldo, ambra, grana"
```

---

### Task 6: Il layout di tutto `/admin`

**Files:**
- Create: `src/app/admin/layout.tsx`

- [ ] **Step 1: Scrivi il layout**

```tsx
// src/app/admin/layout.tsx
import type { Metadata } from 'next';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import '@/components/cabina/cabina.css';

/**
 * I caratteri della cabina. `preload: false` per lo stesso motivo del serif in
 * app/layout.tsx: il manifest dei font elenca ogni font dell'app su ogni rotta,
 * e senza questa riga anche la home pubblica si caricherebbe in testa i font
 * del gestionale. Qui il costo è un attimo di carattere di ripiego al primo
 * ingresso in cabina, e non pesa sul pubblico.
 */
const serif = Fraunces({
  subsets: ['latin'],
  variable: '--font-cab-serif',
  display: 'swap',
  preload: false,
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-cab-mono',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: { default: 'Cabina — Vestri Cinema', template: '%s — Cabina' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`cabina ${serif.variable} ${mono.variable}`}>{children}</div>;
}
```

- [ ] **Step 2: Controlla i tipi**

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "Tutto /admin entra in cabina: caratteri e colori propri"
```

---

### Task 7: I pezzi comuni — Button e Field

**Files:**
- Create: `src/components/cabina/Button.tsx`, `src/components/cabina/Button.module.css`
- Create: `src/components/cabina/Field.tsx`, `src/components/cabina/Field.module.css`

- [ ] **Step 1: Scrivi `Button`**

```tsx
// src/components/cabina/Button.tsx
import Link from 'next/link';
import styles from './Button.module.css';

type Variant = 'fill' | 'outline' | 'ghost' | 'alarm';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Con un href diventa un link, con lo stesso aspetto. */
  href?: string;
}

export default function Button({ variant = 'outline', href, className, children, ...rest }: Props) {
  const cls = [styles.btn, styles[variant], className].filter(Boolean).join(' ');
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button {...rest} type={rest.type ?? 'button'} className={cls}>
      {children}
    </button>
  );
}
```

```css
/* src/components/cabina/Button.module.css */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  min-height: 36px;
  padding: 0 14px;
  border-radius: var(--c-radius);
  border: 1px solid transparent;
  font-family: var(--c-font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--c-fast), color var(--c-fast), border-color var(--c-fast), opacity var(--c-fast);
}
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

.fill { background: var(--c-amber); color: var(--c-amber-ink); font-weight: 600; }
.fill:hover:not(:disabled) { background: #f0b457; }

.outline { border-color: var(--c-amber); color: var(--c-amber); background: transparent; }
.outline:hover:not(:disabled) { background: var(--c-amber-soft); }

.ghost { border-color: var(--c-line); color: var(--c-dim); background: transparent; }
.ghost:hover:not(:disabled) { color: var(--c-ink); border-color: var(--c-line-strong); }

.alarm { border-color: var(--c-alarm); color: var(--c-alarm); background: transparent; }
.alarm:hover:not(:disabled) { background: var(--c-alarm-soft); }
```

- [ ] **Step 2: Scrivi `Field`**

```tsx
// src/components/cabina/Field.tsx
'use client';

import { useId } from 'react';
import styles from './Field.module.css';

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Un elemento dentro il campo, a destra (es. mostra/nascondi password). */
  trailing?: React.ReactNode;
}

export default function Field({ label, hint, error, trailing, id, className, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-nota`;
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          id={inputId}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          {...rest}
        />
        {trailing && <span className={styles.trailing}>{trailing}</span>}
      </div>
      {error ? (
        <p id={noteId} className={styles.error}>{error}</p>
      ) : hint ? (
        <p id={noteId} className={styles.hint}>{hint}</p>
      ) : null}
    </div>
  );
}
```

```css
/* src/components/cabina/Field.module.css */
.field { display: grid; gap: 6px; }
.label {
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-dim);
}
.control { position: relative; display: flex; align-items: center; }
.input {
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  background: var(--c-bg-sunken);
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius);
  color: var(--c-ink);
  font: inherit;
  font-size: 15px;
  transition: border-color var(--c-fast);
}
.input::placeholder { color: var(--c-dim); opacity: 0.7; }
.input:focus { outline: none; border-color: var(--c-amber); }
.input[aria-invalid='true'] { border-color: var(--c-alarm); }
.control:has(.trailing) .input { padding-right: 44px; }
.trailing { position: absolute; right: 6px; display: flex; }
.hint, .error { margin: 0; font-size: 12px; }
.hint { color: var(--c-dim); }
.error { color: var(--c-alarm); }
```

- [ ] **Step 3: Controlla i tipi**

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 4: Commit**

```bash
git add src/components/cabina/Button.tsx src/components/cabina/Button.module.css src/components/cabina/Field.tsx src/components/cabina/Field.module.css
git commit -m "I primi pezzi comuni della cabina: bottone e campo"
```

---

### Task 8: I pezzi comuni — Dialog e Toast

**Files:**
- Create: `src/components/cabina/Dialog.tsx`, `src/components/cabina/Dialog.module.css`
- Create: `src/components/cabina/Toast.tsx`, `src/components/cabina/Toast.module.css`

- [ ] **Step 1: Scrivi `Dialog`**

```tsx
// src/components/cabina/Dialog.tsx
'use client';

import { useEffect, useRef } from 'react';
import styles from './Dialog.module.css';

type Variant = 'center' | 'palette' | 'sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Nome per i lettori di schermo; visibile solo se `showTitle`. */
  title: string;
  showTitle?: boolean;
  variant?: Variant;
  children: React.ReactNode;
}

const FOCUSABLE = 'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])';

export default function Dialog({ open, onClose, title, showTitle = false, variant = 'center', children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  // onClose arriva spesso come funzione nuova a ogni render: tenerla in un ref
  // evita che l'effetto riparta e rubi il fuoco mentre si scrive.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`${styles.backdrop} ${styles[`${variant}Backdrop`] ?? ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className={`${styles.panel} ${styles[variant]}`}>
        {showTitle && <h2 className={styles.title}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
```

```css
/* src/components/cabina/Dialog.module.css */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background: rgba(8, 6, 4, 0.72);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  animation: fade var(--c-fast);
}
.paletteBackdrop { align-items: flex-start; padding-top: 12vh; }
.sheetBackdrop { align-items: flex-end; padding: 0; }

.panel {
  width: 100%;
  background: var(--c-bg-raised);
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius-lg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
  animation: rise var(--c-slow);
}
.center { max-width: 440px; padding: 22px; }
.palette { max-width: 560px; overflow: hidden; }
.sheet {
  max-width: none;
  border-radius: 14px 14px 0 0;
  padding: 10px 8px calc(16px + env(safe-area-inset-bottom));
  animation-name: slideUp;
}

.title {
  margin: 0 0 12px;
  font-family: var(--c-font-serif);
  font-weight: 600;
  font-size: 20px;
}

@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(6px) scale(0.99); } }
@keyframes slideUp { from { transform: translateY(100%); } }
```

- [ ] **Step 2: Scrivi `Toast`**

```tsx
// src/components/cabina/Toast.tsx
'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import styles from './Toast.module.css';

export type ToastTone = 'info' | 'ok' | 'alarm';
type Push = (message: string, tone?: ToastTone) => void;

interface Item {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<Push>(() => {});

/** Gli avvisi della cabina: prendono il posto di alert(). Gli errori restano più a lungo. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(0);

  const push = useCallback<Push>((message, tone = 'info') => {
    const id = ++nextId.current;
    setItems((list) => [...list, { id, message, tone }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === 'alarm' ? 7000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.tone]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Push {
  return useContext(ToastContext);
}
```

```css
/* src/components/cabina/Toast.module.css */
.stack {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 1100;
  display: grid;
  gap: 8px;
  justify-items: end;
  pointer-events: none;
}
.toast {
  max-width: 360px;
  padding: 10px 14px;
  background: var(--c-bg-raised);
  border: 1px solid var(--c-line);
  border-left: 2px solid var(--c-amber);
  border-radius: var(--c-radius);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  font-size: 13px;
  animation: in var(--c-slow);
}
.ok { border-left-color: var(--c-ok); }
.alarm { border-left-color: var(--c-alarm); }

@media (max-width: 767px) {
  .stack { left: 16px; right: 16px; bottom: calc(var(--c-bottombar-h) + 12px); justify-items: stretch; }
  .toast { max-width: none; }
}

@keyframes in { from { opacity: 0; transform: translateY(8px); } }
```

- [ ] **Step 3: Controlla i tipi**

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 4: Commit**

```bash
git add src/components/cabina/Dialog.tsx src/components/cabina/Dialog.module.css src/components/cabina/Toast.tsx src/components/cabina/Toast.module.css
git commit -m "Finestre e avvisi della cabina, per non usare più quelli del browser"
```

---

### Task 9: ⌘K

**Files:**
- Create: `src/components/cabina/CommandPalette.tsx`, `src/components/cabina/CommandPalette.module.css`

- [ ] **Step 1: Scrivi `CommandPalette`**

```tsx
// src/components/cabina/CommandPalette.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminClearCache } from '@/actions/adminActions';
import { logoutAdmin } from '@/actions/authActions';
import Dialog from './Dialog';
import { useToast } from './Toast';
import { rankCommands, type Command } from './commandIndex';
import { ADMIN_COMMANDS } from './commands';
import { ROOMS } from './rooms';
import styles from './CommandPalette.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const results = useMemo(() => rankCommands(query, ADMIN_COMMANDS), [query]);
  const current = Math.min(selected, Math.max(results.length - 1, 0));

  const close = () => {
    setQuery('');
    setSelected(0);
    onClose();
  };

  const run = async (cmd: Command) => {
    close();
    if (cmd.kind === 'stanza') {
      const room = ROOMS.find((r) => `stanza:${r.key}` === cmd.id);
      if (room) router.push(room.href);
      return;
    }
    switch (cmd.id) {
      case 'azione:svuota-cache':
        try {
          await adminClearCache();
          toast('Cache svuotata: Pretix si rilegge alla prossima visita.', 'ok');
        } catch {
          toast('Non sono riuscito a svuotare la cache.', 'alarm');
        }
        break;
      case 'azione:display':
        window.open('/display-esterno', '_blank', 'noopener');
        break;
      case 'azione:sito':
        router.push('/');
        break;
      case 'azione:esci':
        await logoutAdmin();
        router.push('/admin/login');
        router.refresh();
        break;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((current + 1) % Math.max(results.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((current - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === 'Enter' && results[current]) {
      e.preventDefault();
      void run(results[current]);
    }
  };

  return (
    <Dialog open={open} onClose={close} title="Cerca o vai a…" variant="palette">
      <input
        className={styles.input}
        placeholder="Cerca una stanza o un'azione…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(0);
        }}
        onKeyDown={onKeyDown}
        aria-label="Cerca"
        aria-controls="cabina-palette-risultati"
        aria-activedescendant={results[current] ? `palette-${results[current].id}` : undefined}
      />
      <ul id="cabina-palette-risultati" role="listbox" className={styles.list}>
        {results.length === 0 && <li className={styles.empty}>Niente con questo nome.</li>}
        {results.map((cmd, i) => (
          <li
            key={cmd.id}
            id={`palette-${cmd.id}`}
            role="option"
            aria-selected={i === current}
            className={styles.item}
            onMouseEnter={() => setSelected(i)}
            onClick={() => void run(cmd)}
          >
            <span className={styles.label}>{cmd.label}</span>
            <span className={styles.hint}>{cmd.hint ?? (cmd.kind === 'stanza' ? 'Stanza' : 'Azione')}</span>
          </li>
        ))}
      </ul>
      <div className={styles.foot}>
        <span>↑↓ scegli</span>
        <span>↵ apri</span>
        <span>esc chiudi</span>
      </div>
    </Dialog>
  );
}
```

```css
/* src/components/cabina/CommandPalette.module.css */
.input {
  width: 100%;
  padding: 16px 18px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--c-line);
  color: var(--c-ink);
  font: inherit;
  font-size: 16px;
}
.input:focus { outline: none; }
.input::placeholder { color: var(--c-dim); }

.list { list-style: none; margin: 0; padding: 6px; max-height: 50vh; overflow-y: auto; }
.item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--c-radius);
  cursor: pointer;
}
.item[aria-selected='true'] { background: var(--c-amber-soft); box-shadow: inset 2px 0 0 var(--c-amber); }
.label { font-family: var(--c-font-serif); font-size: 15px; }
.hint { font-family: var(--c-font-mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--c-dim); }
.empty { padding: 14px 12px; color: var(--c-dim); }

.foot {
  display: flex;
  gap: 16px;
  padding: 9px 16px;
  border-top: 1px solid var(--c-line);
  font-family: var(--c-font-mono);
  font-size: 10px;
  color: var(--c-dim);
}
@media (max-width: 767px) { .foot { display: none; } }
```

- [ ] **Step 2: Controlla i tipi**

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 3: Commit**

```bash
git add src/components/cabina/CommandPalette.tsx src/components/cabina/CommandPalette.module.css
git commit -m "⌘K: scrivi dove vuoi andare o cosa vuoi fare"
```

---

### Task 10: Il guscio della casa

**Files:**
- Create: `src/components/cabina/AdminShell.tsx`, `src/components/cabina/AdminShell.module.css`
- Create: `src/app/admin/(casa)/layout.tsx`

- [ ] **Step 1: Scrivi `AdminShell`**

```tsx
// src/components/cabina/AdminShell.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarRange, Ellipsis, ExternalLink, Film, LogOut, Search, Sunrise, Ticket } from 'lucide-react';
import { logoutAdmin } from '@/actions/authActions';
import CommandPalette from './CommandPalette';
import Dialog from './Dialog';
import { ROOMS, activeRoom, isCompactRoom, type RoomKey } from './rooms';
import styles from './AdminShell.module.css';

const ICONS: Record<RoomKey, React.ComponentType<{ size?: number }>> = {
  oggi: Sunrise,
  programma: CalendarRange,
  film: Film,
  cassa: Ticket,
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const current = activeRoom(pathname);
  const compact = isCompactRoom(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [shortcut, setShortcut] = useState('⌘K');

  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.userAgent)) setShortcut('Ctrl K');
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const logout = async () => {
    setMoreOpen(false);
    await logoutAdmin();
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <div className={styles.shell} data-compact={compact || undefined}>
      <header className={styles.topbar}>
        <Link href="/admin" className={styles.brand}>
          Vestri Cinema<span className={styles.brandTag}>Cabina</span>
        </Link>
        <nav className={styles.tabs} aria-label="Stanze">
          {ROOMS.map((room) => (
            <Link
              key={room.key}
              href={room.href}
              className={styles.tab}
              aria-current={room.key === current ? 'page' : undefined}
            >
              {room.label}
            </Link>
          ))}
        </nav>
        <button type="button" className={styles.search} onClick={() => setPaletteOpen(true)}>
          <Search size={14} />
          <span className={styles.searchText}>Cerca o vai a…</span>
          <kbd className={styles.kbd}>{shortcut}</kbd>
        </button>
      </header>

      <div className={styles.body}>{children}</div>

      <nav className={styles.bottombar} aria-label="Stanze">
        {ROOMS.filter((r) => r.mobile).map((room) => {
          const Icon = ICONS[room.key];
          return (
            <Link
              key={room.key}
              href={room.href}
              className={styles.bottomItem}
              aria-current={room.key === current ? 'page' : undefined}
            >
              <Icon size={20} />
              {room.label}
            </Link>
          );
        })}
        <button type="button" className={styles.bottomItem} onClick={() => setMoreOpen(true)}>
          <Ellipsis size={20} />
          Altro
        </button>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Altro" variant="sheet">
        <div className={styles.more}>
          <button
            type="button"
            className={styles.moreItem}
            onClick={() => {
              setMoreOpen(false);
              setPaletteOpen(true);
            }}
          >
            <Search size={18} /> Cerca o vai a…
          </button>
          <Link href="/" className={styles.moreItem} onClick={() => setMoreOpen(false)}>
            <ExternalLink size={18} /> Vai al sito pubblico
          </Link>
          <button type="button" className={styles.moreItem} onClick={logout}>
            <LogOut size={18} /> Esci dal gestionale
          </button>
        </div>
      </Dialog>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
```

```css
/* src/components/cabina/AdminShell.module.css */
.shell { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }

.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 28px;
  height: var(--c-topbar-h);
  padding: 0 20px;
  background: color-mix(in srgb, var(--c-bg-raised) 92%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--c-line);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-family: var(--c-font-serif);
  font-size: 17px;
  font-weight: 600;
  color: var(--c-ink);
  text-decoration: none;
  white-space: nowrap;
}
.brandTag {
  font-family: var(--c-font-mono);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--c-amber);
}

.tabs { display: flex; gap: 22px; height: 100%; }
.tab {
  display: flex;
  align-items: center;
  height: 100%;
  color: var(--c-dim);
  text-decoration: none;
  font-size: 13.5px;
  box-shadow: inset 0 0 0 transparent;
  transition: color var(--c-fast), box-shadow var(--c-fast);
}
.tab:hover { color: var(--c-ink); }
.tab[aria-current='page'] { color: var(--c-ink); box-shadow: inset 0 -2px 0 var(--c-amber); }

.search {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px 0 10px;
  background: var(--c-bg-sunken);
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius);
  color: var(--c-dim);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: border-color var(--c-fast), color var(--c-fast);
}
.search:hover { border-color: var(--c-line-strong); color: var(--c-ink); }
.kbd {
  font-family: var(--c-font-mono);
  font-size: 10px;
  padding: 2px 6px;
  border: 1px solid var(--c-line);
  border-radius: 4px;
}

.body { flex: 1; min-width: 0; }

/* Cassa: al banco serve lo schermo, la barra si fa sottile. */
.shell[data-compact] .topbar { height: 38px; gap: 18px; }
.shell[data-compact] .brand { font-size: 14px; }
.shell[data-compact] .tab { font-size: 12.5px; }
.shell[data-compact] .searchText { display: none; }

.bottombar { display: none; }

@media (max-width: 767px) {
  .tabs, .searchText, .kbd { display: none; }
  .topbar { gap: 12px; padding: 0 16px; }
  .shell[data-compact] .bottombar { display: none; }

  .bottombar {
    position: sticky;
    bottom: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    height: calc(var(--c-bottombar-h) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--c-bg-raised);
    border-top: 1px solid var(--c-line);
  }
  .bottomItem {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 3px;
    background: none;
    border: 0;
    color: var(--c-dim);
    font: inherit;
    font-size: 10.5px;
    text-decoration: none;
    cursor: pointer;
  }
  .bottomItem[aria-current='page'] { color: var(--c-amber); }
}

.more { display: grid; }
.moreItem {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 14px;
  background: none;
  border: 0;
  border-radius: var(--c-radius);
  color: var(--c-ink);
  font: inherit;
  font-size: 15px;
  text-decoration: none;
  text-align: left;
  cursor: pointer;
}
.moreItem:hover { background: var(--c-amber-soft); }
```

- [ ] **Step 2: Scrivi il layout della casa**

```tsx
// src/app/admin/(casa)/layout.tsx
import AdminShell from '@/components/cabina/AdminShell';
import { ToastProvider } from '@/components/cabina/Toast';

/** Le stanze del gestionale: tutto /admin tranne il login. */
export default function CasaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AdminShell>{children}</AdminShell>
    </ToastProvider>
  );
}
```

- [ ] **Step 3: Controlla i tipi**

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 4: Commit**

```bash
git add src/components/cabina/AdminShell.tsx src/components/cabina/AdminShell.module.css "src/app/admin/(casa)/layout.tsx"
git commit -m "La casa del gestionale: barra delle stanze, ⌘K e, sul telefono, sotto il pollice"
```

---

### Task 11: Oggi, per ora con il vecchio pannello

**Files:**
- Create: `src/app/admin/(casa)/page.tsx`

- [ ] **Step 1: Scrivi la pagina**

```tsx
// src/app/admin/(casa)/page.tsx
'use client';

/**
 * "Oggi", versione provvisoria.
 *
 * Fino alla tappa 2 del restyling qui vive il vecchio pannello: contiene ancora
 * Sale, Display, Catalogo, Recupero biglietti e la lista di Pretix, che non
 * hanno una stanza loro. Prima stava in un overlay sopra la home pubblica;
 * adesso ha un indirizzo, e la X della programmazione non porta più a un 404.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { adminListEvents } from '@/actions/adminActions';

const AdminPanel = dynamic(() => import('@/components/Admin/AdminPanel'), { ssr: false });

type Events = Awaited<ReturnType<typeof adminListEvents>>;

export default function OggiProvvisorio() {
  const [events, setEvents] = useState<Events | null>(null);

  useEffect(() => {
    adminListEvents()
      .then((list) => setEvents(list ?? []))
      .catch((err) => {
        console.error(err);
        setEvents([]);
      });
  }, []);

  if (!events) {
    return (
      <p style={{ padding: '2rem', fontFamily: 'var(--c-font-mono)', fontSize: 12, color: 'var(--c-dim)' }}>
        Carico la programmazione…
      </p>
    );
  }
  return <AdminPanel initialEvents={events} />;
}
```

- [ ] **Step 2: Controlla i tipi**

Run: `npx tsc --noEmit`
Expected: nessun output. Se `AdminPanel` dichiara `initialEvents: any[]`, il tipo è compatibile. Se dà errore, usa il tipo esatto della prop `AdminDashboardProps['initialEvents']`, esportandolo da `AdminPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(casa)/page.tsx"
git commit -m "/admin esiste: per ora ci abita il vecchio pannello"
```

---

### Task 12: Il login della cabina

**Files:**
- Modify (riscrive): `src/app/admin/login/page.tsx`, `src/app/admin/login/login.module.css`

- [ ] **Step 1: Riscrivi la pagina**

```tsx
// src/app/admin/login/page.tsx
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { loginAdmin } from '@/actions/authActions';
import Button from '@/components/cabina/Button';
import Field from '@/components/cabina/Field';
import styles from './login.module.css';

/** Si torna solo dentro il sito: un `?redirect=` verso un altro dominio viene ignorato. */
function safeRedirect(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/admin';
}

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginAdmin(password);
      if (res.success) {
        router.push(safeRedirect(searchParams.get('redirect')));
        router.refresh();
      } else {
        setError(res.error || 'Password non corretta.');
      }
    } catch {
      setError('Connessione assente. Riprova fra un attimo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <Field
        label="Chiave"
        type={visible ? 'text' : 'password'}
        name="password"
        autoComplete="current-password"
        required
        autoFocus
        disabled={loading}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error || undefined}
        trailing={
          <button
            type="button"
            className={styles.eye}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Nascondi la chiave' : 'Mostra la chiave'}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        }
      />
      <Button type="submit" variant="fill" disabled={loading} className={styles.submit}>
        {loading ? 'Verifico…' : 'Entra in cabina'}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.beam} aria-hidden />
      <section className={styles.card}>
        <p className={styles.kicker}>Vestri Cinema · Cabina</p>
        <h1 className={styles.title}>Si entra in cabina</h1>
        <p className={styles.lead}>Il gestionale del cinema. Serve la chiave.</p>
        <Suspense fallback={<p className={styles.lead}>Un attimo…</p>}>
          <LoginForm />
        </Suspense>
        <a href="/" className={styles.back}>← Torna al sito</a>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Riscrivi il CSS**

```css
/* src/app/admin/login/login.module.css */
.page {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  overflow: hidden;
}

/* Il fascio del proiettore, dall'alto a sinistra: l'unica decorazione. */
.beam {
  position: absolute;
  inset: -20% auto auto -10%;
  width: 90vmax;
  height: 90vmax;
  background: radial-gradient(closest-side, rgba(232, 163, 61, 0.14), transparent 70%);
  pointer-events: none;
}

.card {
  position: relative;
  width: 100%;
  max-width: 380px;
  padding: 32px 28px 24px;
  background: var(--c-bg-raised);
  border: 1px solid var(--c-line);
  border-radius: var(--c-radius-lg);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
}

.kicker {
  margin: 0 0 10px;
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--c-amber);
}
.title {
  margin: 0;
  font-family: var(--c-font-serif);
  font-weight: 600;
  font-size: 30px;
  line-height: 1.05;
}
.lead { margin: 8px 0 24px; color: var(--c-dim); }

.form { display: grid; gap: 18px; }
.submit { width: 100%; min-height: 44px; }

.eye {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  background: none;
  border: 0;
  color: var(--c-dim);
  cursor: pointer;
}
.eye:hover { color: var(--c-ink); }

.back {
  display: inline-block;
  margin-top: 20px;
  font-size: 12.5px;
  color: var(--c-dim);
  text-decoration: none;
}
.back:hover { color: var(--c-ink); }
```

- [ ] **Step 3: Controlla i tipi**

Run: `npx tsc --noEmit`
Expected: nessun output

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/login/page.tsx src/app/admin/login/login.module.css
git commit -m "Il login si fa cabina, e dopo l'accesso si entra in /admin"
```

---

### Task 13: Un solo ingresso: il footer porta in cabina

**Files:**
- Modify: `src/components/Footer.tsx`
- Modify: `src/components/Footer.module.css` (via tutto da `.modalOverlay` alla fine del file)
- Modify: `src/components/ClientFooter.tsx`
- Delete: `src/components/Admin/AdminOverlay.tsx`, `src/components/Admin/AdminOverlay.module.css`

- [ ] **Step 1: Riscrivi `Footer.tsx`**

```tsx
// src/components/Footer.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import styles from './Footer.module.css';

/**
 * L'ingresso al gestionale è un link a /admin: se non c'è la sessione, ci
 * pensa il proxy a chiedere la chiave. Prima qui c'erano una seconda finestra
 * di login e un pannello in overlay sopra la home.
 */
export default function Footer() {
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        {mounted ? (
          <>
            <p suppressHydrationWarning>&copy; {new Date().getFullYear()} VESTRICINEMASHOP. Tutti i diritti riservati.</p>
            <Link href="/admin" className={styles.adminButton} prefetch={false}>
              Admin
            </Link>
          </>
        ) : (
          <p>&copy; VESTRICINEMASHOP. Tutti i diritti riservati.</p>
        )}
      </div>
    </footer>
  );
}
```

`prefetch={false}` serve perché altrimenti il sito pubblico precaricherebbe, per ogni visitatore, una pagina protetta che rimanda al login.

- [ ] **Step 2: Togli dal CSS le classi della modale**

Nel file `src/components/Footer.module.css` elimina tutto da `.modalOverlay {` (riga 36) alla fine del file: `.modalOverlay`, `.modalContent`, `.input`, `.error`, `.actions`, `.cancelButton`, `.submitButton` e i loro `:hover`/`:focus`. Poi aggiungi `text-decoration: none;` a `.adminButton`, perché adesso è un link.

- [ ] **Step 3: Nascondi il footer in tutto `/admin`**

In `src/components/ClientFooter.tsx` sostituisci:

```ts
  // Suppress footer on isolated full-screen pages
  const isHidden = pathname === '/display-esterno' || pathname.startsWith('/admin/cassa');
```

con:

```ts
  // Il footer pubblico non entra in cabina né sullo schermo d'ingresso.
  const isHidden = pathname === '/display-esterno' || pathname.startsWith('/admin');
```

- [ ] **Step 4: Elimina l'overlay, dopo aver controllato che nessuno lo usi**

```bash
grep -rn "AdminOverlay" src
```

Expected: solo le righe dentro `src/components/Admin/AdminOverlay.tsx`.

```bash
git rm -q src/components/Admin/AdminOverlay.tsx src/components/Admin/AdminOverlay.module.css
```

- [ ] **Step 5: Test e tipi**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tutti i test PASS, `tsc` senza output

- [ ] **Step 6: Commit**

```bash
git add -A src/components/Footer.tsx src/components/Footer.module.css src/components/ClientFooter.tsx src/components/Admin
git commit -m "Un solo ingresso al gestionale: dal footer si va in cabina"
```

---

### Task 14: Verifica finale e consegna a Giovanni

- [ ] **Step 1: Tutto verde**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/components/cabina "src/app/admin"`
Expected: test PASS, `tsc` senza output. `eslint` senza errori nei file nuovi; gli avvisi preesistenti nei file spostati non si toccano.

- [ ] **Step 2: Nessun riferimento orfano**

```bash
grep -rn "admin/programmazione\|admin/movies-control\|admin/planner\|AdminOverlay" src
```

Expected: solo `src/config/adminRedirects.test.ts`.

- [ ] **Step 3: Consegna a Giovanni la lista di cosa provare** (nel browser, con il suo dev server)

1. Dal sito pubblico, clic su "admin" nel footer. Senza sessione compare il login Cabina; con la chiave giusta si entra in `/admin`.
2. Con una chiave sbagliata, l'errore compare sotto il campo, in rosso ruggine.
3. Da `/admin`: la barra con Oggi · Programma · Film · Cassa e la linguetta attiva sottolineata in ambra.
4. ⌘K (o Ctrl K): scrivi "prog" + Invio e si apre la programmazione. "sale" porta a Oggi. "svuota" + Invio fa comparire l'avviso "Cache svuotata".
5. Esc chiude ⌘K. Il clic fuori pure.
6. `/admin/programmazione`, `/admin/planner` e `/admin/movies-control` portano alle stanze nuove. Anche "Replica" dal vecchio pannello apre la programmazione con il film scelto.
7. La X "Torna all'admin" della programmazione adesso porta a `/admin`, non più a un errore.
8. In Cassa la barra è sottile e la vendita funziona come prima.
9. Sul telefono: barra in basso con Oggi, Programma, Film, Cassa, Altro. "Altro" apre il foglio con Cerca, Sito ed Esci.
10. "Esci" riporta al login, e dopo non si rientra in `/admin` senza chiave.
11. Il sito pubblico è identico a prima, footer compreso: solo "admin" adesso è un link.

- [ ] **Step 4: Proponi l'aggiornamento della scheda nel vault** (`Vestri Cinema — sito e biglietteria.md`): "Stile" e "La parte di gestione". Solo con l'ok di Giovanni.
