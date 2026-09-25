# Sito pubblico in cabina — Tappa 1: fondamenta

> **Per chi esegue:** si esegue inline, un compito alla volta (Giovanni non vuole subagenti). I passi usano le caselle (`- [ ]`).

**Obiettivo:** le variabili, i caratteri e la grana di Cabina arrivano sulla home e su `/success`, e il footer si veste da Cabina, senza toccare il display esterno, il PDF e il gestionale.

**Architettura:**
- `cabina.css` separa i **gettoni** (le variabili) dal **guscio** (fondo, grana, altezza). Così anche il footer, che vive fuori dalle pagine, può leggere le variabili senza diventare una cabina alta quanto lo schermo.
- I due caratteri si dichiarano una volta sola in un modulo, e il layout radice li mette su `<body>`.
- Il sito pubblico usa `.cabina.pubblico`: la stessa cabina, con il corpo del testo a 16 px invece dei 14 px del gestionale, perché i componenti di oggi non cambino misura prima della loro tappa.

**Strumenti:** Next.js 16 (App Router), `next/font/google`, CSS Modules, vitest.

**Specifica:** `docs/superpowers/specs/2026-09-25-sito-pubblico-cabina-design.md`, sezione 1.

---

## Mappa dei file

| File | Cosa cambia |
|---|---|
| `src/components/cabina/cabina.css` | variabili su `.cabina, .cabina-tokens`; guscio solo su `.cabina`; nuova regola `.cabina.pubblico` |
| `src/components/cabina/fonts.ts` (nuovo) | dichiara Fraunces (tondo e corsivo) e JetBrains Mono |
| `src/app/layout.tsx` | importa `cabina.css` e i font, mette le due variabili su `<body>` |
| `src/app/admin/layout.tsx` | toglie i font dichiarati qui; resta `cabina` |
| `src/app/page.tsx` | `<main>` riceve `cabina pubblico` |
| `src/app/success/page.tsx` | il contenitore riceve `cabina pubblico` |
| `src/components/Footer.tsx`, `Footer.module.css` | footer in veste Cabina, con `cabina-tokens` |

Non si tocca: `globals.css` (viola, rosa e Playfair servono ancora al display e al PDF), `display-esterno`, `TicketPDF`, `Cassa`.

---

### Compito 1: leggere la guida dei font

**File:** nessuno.

- [ ] **Passo 1: leggere la guida di `next/font`**

```bash
ls node_modules/next/dist/docs/ | head -50
grep -rl "next/font" node_modules/next/dist/docs/ | head
```

Aprire la pagina sui font e controllare due cose:
- che `next/font/google` si possa chiamare in un modulo a parte (`fonts.ts`), a livello di modulo, e usare poi da più layout;
- che `style: ['normal', 'italic']` sia supportato per Fraunces.

Se la guida dice qualcosa di diverso da quello che assume questo piano, ci si ferma e si adegua il compito 3 prima di scrivere codice.

---

### Compito 2: separare gettoni e guscio in `cabina.css`

**File:**
- Modifica: `src/components/cabina/cabina.css` (il primo blocco `.cabina { … }`, righe 5–44 circa)

- [ ] **Passo 1: dividere il primo blocco**

Il blocco `.cabina { … }` oggi contiene sia le variabili sia le proprietà del guscio. Diventa due blocchi. Il commento in testa resta, aggiornato.

```css
/* L'identità di Cabina: nero caldo, ambra come la lampada del proiettore,
 * grana di pellicola. Le variabili valgono su `.cabina` e su `.cabina-tokens`:
 * la seconda serve a chi deve solo leggere i colori (il footer pubblico)
 * senza diventare una cabina a tutto schermo. Il display esterno e il PDF
 * del biglietto restano fuori fino al loro progetto.
 */
.cabina,
.cabina-tokens {
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
}

.cabina {
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
```

Prima di sostituire, confrontare le variabili con quelle che ci sono adesso nel file: devono essere **esattamente** le stesse, nessuna in più e nessuna in meno. Se il file ne ha altre oltre a quelle elencate qui, vanno spostate anche loro nel blocco delle variabili.

- [ ] **Passo 2: aggiungere la cabina pubblica, subito dopo il blocco `.cabina`**

```css
/* Il sito pubblico: la stessa cabina, ma il testo resta a 16 px. I componenti
 * della home misurano in em e in valori ereditati; a 14 px cambierebbero
 * misura prima della loro tappa del restyling. */
.cabina.pubblico {
  font-size: 16px;
  line-height: 1.5;
}
```

- [ ] **Passo 3: controllare che il gestionale non si accorga di niente**

```bash
npx tsc --noEmit && npm test
```

Atteso: nessun errore di tipi, tutti i test verdi. Le regole successive del file (`.cabina::after`, `::selection`, `:focus-visible`, riduzione del movimento) restano su `.cabina` e non cambiano.

---

### Compito 3: i caratteri in un modulo solo, applicati a tutto il sito

**File:**
- Crea: `src/components/cabina/fonts.ts`
- Modifica: `src/app/layout.tsx`
- Modifica: `src/app/admin/layout.tsx`

- [ ] **Passo 1: creare `fonts.ts`**

```ts
import { Fraunces, JetBrains_Mono } from 'next/font/google';

/**
 * I caratteri di Cabina, per il gestionale e per il sito pubblico.
 *
 * `preload: false` resta, per lo stesso motivo del Playfair in app/layout.tsx:
 * il manifest dei font elenca ogni font dell'app su ogni rotta, e con il
 * preload anche il display d'ingresso si caricherebbe in testa due famiglie
 * che non usa. Il prezzo è un attimo di Georgia o di monospace di sistema al
 * primo ingresso. Se sulla home l'attimo si vede troppo (tappa 2, orari
 * dell'hero), si riconsidera lì.
 *
 * Il corsivo di Fraunces serve alle citazioni del racconto (tappa 3).
 */
export const cabSerif = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-cab-serif',
  display: 'swap',
  preload: false,
});

export const cabMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-cab-mono',
  display: 'swap',
  preload: false,
});
```

- [ ] **Passo 2: il layout radice importa `cabina.css` e mette le variabili su `<body>`**

In `src/app/layout.tsx`, sotto `import './globals.css';`:

```ts
import '@/components/cabina/cabina.css';
import { cabSerif, cabMono } from '@/components/cabina/fonts';
```

E la riga di `<body>` diventa:

```tsx
<body className={`${inter.variable} ${playfair.variable} ${cabSerif.variable} ${cabMono.variable} antialiased`} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
```

`cabina.css` va importato **dopo** `globals.css`. Tutte le sue regole stanno sotto `.cabina` o `.cabina-tokens`, quindi non tocca le pagine che non hanno queste classi.

- [ ] **Passo 3: il gestionale smette di dichiarare i suoi font**

`src/app/admin/layout.tsx` diventa:

```tsx
import type { Metadata } from 'next';

// I caratteri e cabina.css arrivano dal layout radice: valgono anche per il
// sito pubblico.

export const metadata: Metadata = {
  title: { default: 'Cabina — Vestri Cinema', template: '%s — Cabina' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="cabina">{children}</div>;
}
```

Prima di salvare, controllare che il file non contenga altro oltre a quello letto nel passo di preparazione (righe 1–40). Se c'è dell'altro, per esempio un guscio o dei provider, si tiene.

- [ ] **Passo 4: controllare che nessun altro dichiari i font della cabina**

```bash
grep -rn "Fraunces\|JetBrains_Mono" src
```

Atteso: solo `src/components/cabina/fonts.ts`.

- [ ] **Passo 5: tipi e test**

```bash
npx tsc --noEmit && npm test
```

Atteso: nessun errore, tutti i test verdi.

- [ ] **Passo 6: commit**

```bash
git add src/components/cabina/cabina.css src/components/cabina/fonts.ts src/app/layout.tsx src/app/admin/layout.tsx
git commit -m "I caratteri della cabina valgono per tutto il sito

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 4: la home e la conferma entrano in cabina

**File:**
- Modifica: `src/app/page.tsx` (il `return` in fondo)
- Modifica: `src/app/success/page.tsx` (i due `<div className={styles.container}>`)

- [ ] **Passo 1: la home**

In `src/app/page.tsx`:

```tsx
<main className={`cabina pubblico ${styles.main}`}>
```

- [ ] **Passo 2: la conferma**

In `src/app/success/page.tsx` ci sono due contenitori: quello del caricamento e quello dell'ordine. Tutti e due diventano:

```tsx
<div className={`cabina pubblico ${styles.container}`}>
```

Il fondo a gradiente di `.container` in `success.module.css` per ora resta: vince sul fondo di `.cabina` o perde a seconda dell'ordine dei fogli, e in tutti e due i casi la tappa 5 lo riscrive. La cosa che conta in questa tappa è che la grana e le variabili ci siano.

- [ ] **Passo 3: controllare cosa resta viola o rosa sulle pagine pubbliche**

```bash
grep -rln "var(--primary\|var(--accent\|#8b5cf6\|#f43f5e\|#a78bfa" src/components src/app --include='*.css' | grep -v "admin\|Cassa\|display\|TicketPDF\|cabina"
```

Non si corregge niente qui: l'elenco va nel resoconto della tappa, e ogni file finisce nella tappa che lo riveste (hero 2, racconto 3, prenotazione 4, conferma 5).

- [ ] **Passo 4: tipi**

```bash
npx tsc --noEmit
```

Atteso: nessun errore.

- [ ] **Passo 5: commit**

```bash
git add src/app/page.tsx src/app/success/page.tsx
git commit -m "La home e la conferma entrano in cabina

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 5: il footer in veste Cabina

**File:**
- Modifica: `src/components/Footer.tsx`
- Modifica: `src/components/Footer.module.css`

- [ ] **Passo 1: il footer legge le variabili**

In `Footer.tsx`:

```tsx
<footer className={`cabina-tokens ${styles.footer}`}>
```

Il contenuto non cambia: copyright e link "Admin" a `/admin`, senza prefetch.

- [ ] **Passo 2: riscrivere `Footer.module.css`**

```css
.footer {
  position: relative;
  width: 100%;
  margin-top: auto;
  padding: 18px 0;
  background: var(--c-bg);
  border-top: 1px solid var(--c-line);
  color: var(--c-dim);
  font-family: var(--c-font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
  gap: 16px;
}

.container p {
  margin: 0;
}

/* L'ingresso al gestionale resta quasi invisibile, come oggi. */
.adminButton {
  color: var(--c-line-strong);
  text-decoration: none;
  padding: 4px;
  transition: color var(--c-fast);
}

.adminButton:hover,
.adminButton:focus-visible {
  color: var(--c-dim);
}
```

- [ ] **Passo 3: tipi e test**

```bash
npx tsc --noEmit && npm test
```

Atteso: nessun errore, tutti i test verdi.

- [ ] **Passo 4: commit**

```bash
git add src/components/Footer.tsx src/components/Footer.module.css
git commit -m "Il footer si veste da cabina

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Compito 6: resoconto per Giovanni

**File:** nessuno. Il dev server **non** si avvia.

- [ ] **Passo 1: ultimo controllo**

```bash
npx tsc --noEmit && npm test && git status --short
```

Atteso: nessun errore, test verdi, albero pulito.

- [ ] **Passo 2: cosa deve provare Giovanni sul suo dev server**

Da consegnare così:
- **Home:**
  - si vede la grana;
  - il testo normale è in Inter e non più in SF Pro;
  - l'hero, il racconto e la prenotazione **non devono cambiare misura**: se qualcosa si è rimpicciolito, è il 14 px che è passato e va segnalato;
  - i colori viola e rosa ci sono ancora: si tolgono nelle tappe dopo.
- **Footer:** nero caldo, riga sottile in alto, scritte in mono maiuscolo; il link "admin" quasi invisibile porta a `/admin`.
- **`/success`** dopo una prenotazione, oppure con un ordine salvato: la grana si vede e la pagina funziona come prima.
- **Gestionale:** caratteri, colori e grana identici a ieri, in tutte le stanze. È la prova che lo spostamento dei font non l'ha toccato.
- **Display esterno:** identico a ieri.
- Su Safari vecchio: la home si carica e i caratteri arrivano, anche se dopo un attimo.

- [ ] **Passo 3: l'elenco dei file ancora viola o rosa** (dal compito 4, passo 3), con accanto la tappa in cui verranno rivestiti.
