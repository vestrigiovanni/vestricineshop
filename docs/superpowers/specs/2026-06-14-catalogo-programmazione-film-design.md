# Catalogo Film per la Programmazione — Design

- **Data:** 2026-06-14
- **Stato:** Approvato (design), pronto per il piano di implementazione
- **Ambito dispositivi:** Solo desktop (pannello admin)

## 1. Contesto e problema

Oggi nell'admin (`src/components/Admin/AdminPanel.tsx`) la programmazione di un film
avviene cercando un titolo **su tutto TMDB in diretta** (`adminSearchMovies` →
`searchMovies`). Questo costringe a sapere già in anticipo cosa programmare.

L'utente possiede un **catalogo chiuso di 913 film** (un CSV) tra cui può scegliere,
ma resta a corto di idee. Vuole un pulsante nell'admin che gli faccia **sfogliare il
proprio catalogo** con poster e metadati TMDB in anteprima, così da scegliere con
sicurezza film "freschi" da programmare.

**Formato del catalogo (CSV), colonne:**

```
Title, Year, Duration (min), Director
```

- I **titoli sono in italiano** (distribuzione italiana).
- **Non esiste un id TMDB** nel file: va abbinato a TMDB all'import.
- La presenza di **Director** e **Duration (min)** è preziosa: il regista disambigua
  gli omonimi durante l'abbinamento; la durata serve già per i conflitti di
  programmazione.

## 2. Obiettivo

Un pannello admin **"Programma dal catalogo"** che:

1. Mostra i 913 film del catalogo come griglia di poster (live da TMDB).
2. Permette di **scoprire** film con filtri (genere, decennio, regista), un pulsante
   **"Sorprendimi"** (film casuale) e la consapevolezza dei **già programmati**.
3. Per ogni film mostra un'**anteprima live da TMDB** (poster, trama, regista, cast,
   durata) per confermare che sia il film giusto.
4. Da lì si **programma** riusando il flusso esistente (`adminScheduleMovie`).
5. Se l'abbinamento TMDB è sbagliato (omonimo), si **corregge e si salva** in modo
   permanente nel catalogo.

## 3. Non-obiettivi (YAGNI)

- Nessun supporto mobile per questo pannello (admin desktop-only).
- Nessuna modifica al sito pubblico / front-end utente.
- Nessuna gestione di diritti/licenze o finestre di disponibilità (il CSV non li ha).
- Nessuna re-implementazione del flusso di scheduling: si **riusa** quello esistente.
- Nessuna sincronizzazione automatica ricorrente del catalogo: l'import è un'azione
  manuale ri-eseguibile.

## 4. Architettura generale

```
CSV (scratch/catalogo.csv)
        │  import script (una tantum, ri-eseguibile)
        ▼
[ Tabella CatalogFilm ]  ──join tmdbId──►  [ PretixSync ]  (già programmato?)
        │
        │  catalogActions.ts (server actions)
        ▼
[ CatalogBrowser ]  (overlay desktop dentro l'admin)
        │  onSelectFilm(tmdbId, metadati)
        ▼
[ AdminPanel ]  → form scheduling esistente → adminScheduleMovie()
```

Tre unità isolate, con interfacce chiare:

- **Import script** — popola/aggiorna `CatalogFilm`. Dipende da: CSV + servizio TMDB.
- **`catalogActions.ts`** — query/scoperta/correzione sul catalogo. Dipende da: Prisma + TMDB.
- **`CatalogBrowser`** — UI di sfoglia/scoperta. Dipende da: `catalogActions`. Comunica
  con `AdminPanel` solo tramite una callback `onSelectFilm`. Non conosce i dettagli
  dello scheduling.

## 5. Modello dati: `CatalogFilm` (Prisma / Postgres)

```prisma
model CatalogFilm {
  id            Int      @id @default(autoincrement())

  // --- Dal CSV ---
  title         String   // "Title" (italiano)
  year          Int?     // "Year"
  durationMin   Int?     // "Duration (min)"  ← autorevole per i conflitti
  director      String?  // "Director"

  // --- Abbinati da TMDB (snapshot all'import) ---
  tmdbId        String?  // null finché non abbinato
  tmdbTitle     String?
  tmdbYear      Int?
  posterPath    String?
  genres        String[] @default([])
  runtime       Int?     // durata TMDB (fallback se manca durationMin)

  // --- Qualità del dato / verifica ---
  verifyStatus  String   @default("pending") // pending | ok | suspect | missing | fixed
  enrichedAt    DateTime?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([tmdbId])
  @@index([verifyStatus])
  @@unique([title, year])  // chiave naturale per upsert ri-eseguibile
}
```

Significato di `verifyStatus`:

- `pending` — importato dal CSV, non ancora abbinato a TMDB.
- `ok` — match TMDB sicuro (anno ±1 **e** regista coincidente).
- `suspect` — trovato un candidato ma regista non coincidente / più candidati plausibili
  / solo il titolo combacia. Da verificare a occhio col poster.
- `missing` — nessun risultato TMDB.
- `fixed` — id corretto manualmente dall'utente. **Le re-importazioni non lo toccano.**

> **Nota:** `PretixSync.tmdbId` e `MovieOverride.tmdbId` sono `String`. Manteniamo
> `CatalogFilm.tmdbId` come `String` per coerenza e per i join.

## 6. Import & abbinamento TMDB

Script ri-eseguibile (es. `src/scripts/importCatalog.ts`), eseguibile via `tsx`/`node`.

1. **Parsing CSV** da `scratch/catalogo.csv` (header: `Title, Year, Duration (min), Director`).
   Parsing robusto (virgole nei titoli, virgolette).
2. **Upsert** in `CatalogFilm` per chiave naturale `(title, year)`:
   - Se la riga esiste con `verifyStatus = "fixed"`, si **preservano** `tmdbId` e lo stato:
     non si riabbina.
   - Altrimenti si (ri)esegue l'abbinamento.
3. **Abbinamento TMDB** (riusa `searchMovies(title, false, 'it-IT')` + `getMovieDetails`):
   - Cerca per `Title` in `it-IT`, filtrando idealmente per `Year`.
   - Tra i candidati, sceglie quello con:
     - anno di uscita entro **±1** rispetto a `Year`, **e**
     - **regista coincidente** con `Director` (confronto normalizzato: minuscole,
       accenti rimossi, spazi compattati). Il regista TMDB si ottiene da
       `getDirector` / dai `credits.crew`.
   - Esiti:
     - candidato unico che soddisfa anno+regista → `ok`;
     - candidato trovato ma regista non coincide / più candidati / solo titolo → `suspect`;
     - nessun risultato → `missing`.
   - Quando l'abbinamento riesce, salva snapshot: `tmdbId, tmdbTitle, tmdbYear,
     posterPath, genres[], runtime`, `enrichedAt = now()`.
4. **Resilienza:** rate-limit gentile verso TMDB (concorrenza bassa, es. 5 in parallelo),
   retry sui fallimenti transitori, log riepilogativo finale (quanti `ok` / `suspect` /
   `missing`). I fallimenti tecnici lasciano `enrichedAt = null` per poter riprovare.

Risultato atteso: la grande maggioranza dei 913 film abbinata in automatico grazie al
regista; una minoranza marcata `suspect`/`missing` che l'utente rivede col poster.

## 7. Server actions — `src/actions/catalogActions.ts`

Tutte protette dallo stesso meccanismo di accesso admin già in uso per le altre
`adminActions` (vedi `src/actions/adminActions.ts` / login admin).

- `catalogList(params)` → lista paginata.
  `params`: `{ search?, genre?, decade?, director?, verifyStatus?, hideScheduled?, sort?, page?, pageSize? }`.
  `sort`: `listOrder | titleAsc | yearDesc | ...`. Restituisce i film **più** l'info
  "già programmato" (conteggio via join `CatalogFilm.tmdbId` ↔ `PretixSync.tmdbId`).
- `catalogRandom(params)` → uno (o pochi) film casuali tra quelli filtrati
  (default: verificati e non già programmati) per "Sorprendimi".
- `catalogGetFacets()` → valori distinti per i menu filtro: generi (da TMDB), registi
  (dal CSV), decenni (dal CSV).
- `catalogStats()` → contatori: totale, `ok`, `suspect`, `missing`, mai programmati.
- `catalogFixTmdbId(catalogId, newTmdbId)` → imposta il nuovo id, ri-arricchisce lo
  snapshot da TMDB, setta `verifyStatus = "fixed"`.

Il servizio TMDB viene **riusato** (`getMovieDetails`, `getDirector`,
`getEnrichedMovieMetadata`): nessun nuovo client TMDB.

## 8. UI — pannello "Programma dal catalogo"

### Entry point
Un pulsante **"📚 Programma dal catalogo"** in `AdminPanel.tsx`, accanto alla ricerca
TMDB attuale. Apre un **overlay a tutto schermo** (componente isolato
`src/components/Admin/CatalogBrowser/`).

### Layout del browser (desktop)
- **Barra strumenti (in alto):**
  ricerca testo · filtro **Genere** · filtro **Decennio** · filtro **Regista** ·
  toggle **"Nascondi già programmati"** · filtro **"Solo da verificare"** ·
  **ordina** (Classifica/Titolo/Anno) · pulsante **🎲 Sorprendimi** ·
  riga di stato con i contatori (`catalogStats`).
- **Griglia di card** con scroll infinito (blocchi ~50):
  - poster (live da TMDB via `posterPath`/`getTMDBImageUrl`), titolo, anno;
  - **badge**: `⚠️ da verificare` (suspect/missing), `✅ già programmato (×N)`.
  - Card senza poster (missing) mostrano un placeholder e il badge di verifica.

### Pannello anteprima (click su una card)
- Preview **live da TMDB** in grande: poster, trama, regista, cast, durata.
- Azioni:
  - **"Programma"** → chiude l'overlay e passa il film ad `AdminPanel` tramite
    `onSelectFilm(tmdbId, metadati)`; il **form di scheduling esistente** si pre-compila
    (titolo, poster, tmdbId) e si prosegue come oggi (data, sala, lingua) →
    `adminScheduleMovie` con i suoi controlli di conflitto. La **durata** usata per i
    conflitti è `durationMin` del CSV (fallback: `runtime` TMDB).
  - **"ID sbagliato? Correggi"** → mini-ricerca TMDB inline; scelto quello giusto →
    `catalogFixTmdbId` → `verifyStatus = "fixed"` e snapshot ri-arricchito.

### Interfaccia con AdminPanel
`CatalogBrowser` è autonomo e comunica **solo** via prop:
`{ onSelectFilm: (film) => void, onClose: () => void }`. Non conosce lo scheduling:
lo possiede `AdminPanel`. Questo mantiene i confini netti e i file focalizzati.

## 9. Filtri & scoperta

- **Genere:** dai `genres[]` snapshot TMDB.
- **Decennio / Anno:** dalla colonna `Year` del CSV (preciso, niente TMDB).
- **Regista:** dalla colonna `Director` del CSV (preciso, niente TMDB).
- **Già programmati:** join con `PretixSync.tmdbId`; toggle per evidenziare o nascondere.
- **Solo da verificare:** filtra `verifyStatus in (suspect, missing)` per ripulire il
  catalogo a sessioni.
- **Sorprendimi:** pesca casuale tra i filtrati (default verificati e mai programmati).
- **Ordina per classifica:** se serve un ordine "classifica", si usa `id`/ordine di
  inserimento del CSV (la posizione originale della lista).

## 10. Casi limite / error handling

- **Id TMDB morto** in fase di correzione → l'azione fallisce con messaggio chiaro,
  nessuna scrittura parziale.
- **Film `missing`/`suspect`** → comunque programmabili dopo correzione manuale; finché
  non abbinati non hanno poster ma restano in lista col badge.
- **Errori TMDB durante import** → retry; in caso di fallimento persistente il film
  resta `pending`/`enrichedAt null` per la run successiva.
- **Conflitti di programmazione** → gestiti dal flusso `adminScheduleMovie` esistente
  (nessuna logica nuova).
- **CSV malformato** → parser tollerante; righe non parsabili loggate e saltate, non
  bloccano l'import.

## 11. Sicurezza / accesso

Le nuove server actions stanno dietro lo stesso gate admin delle `adminActions`
esistenti. La chiave TMDB resta lato server (già com'è in `src/services/tmdb.ts`).

## 12. Verifica (come testiamo)

Il progetto non ha un framework di test configurato; la verifica sarà pragmatica:

- **Import:** dry-run su un campione del CSV; log riepilogativo `ok/suspect/missing`;
  ispezione manuale di alcuni `suspect` per validare la soglia di matching (regista/anno).
- **UI:** verifica nel browser di dev (filtri, scroll, badge "già programmato",
  "Sorprendimi", correzione id) e che "Programma" entri correttamente nel form esistente.
- **Regressione:** il flusso di scheduling attuale resta invariato.

## 13. Cosa serve dall'utente

- Mettere il CSV in **`scratch/catalogo.csv`** (header `Title, Year, Duration (min), Director`).

## 14. File nuovi / toccati (previsione)

**Nuovi**
- `prisma/schema.prisma` → modello `CatalogFilm` (+ migrazione).
- `src/scripts/importCatalog.ts` → import & abbinamento.
- `src/actions/catalogActions.ts` → server actions catalogo.
- `src/components/Admin/CatalogBrowser/` → overlay (componente + CSS module).

**Toccati**
- `src/components/Admin/AdminPanel.tsx` → pulsante "Programma dal catalogo" + callback
  `onSelectFilm` che pre-compila il form esistente.
