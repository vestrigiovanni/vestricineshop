# Programmazione V2 — un solo flusso, un solo cervello

Sostituisce i 5 percorsi di programmazione con un unico wizard, un motore di
scheduling puro e testabile, e un catalogo alimentato da Plex.

> **Stato: realizzato, e poi corretto dall'uso.** Tutte e sei le fasi sono state
> costruite. Le deviazioni dal piano iniziale — quasi tutte imposte dai dati
> veri — stanno nella sezione 9.
>
> **Poi è stato usato per una programmazione vera da due settimane, e si è
> rotto.** Cosa si è rotto e come è stato aggiustato sta nella sezione 11, che è
> la più importante del documento: contiene un errore di architettura che
> nessuna ottimizzazione avrebbe potuto salvare. Se leggi una sezione sola,
> leggi quella.

---

## 1. Da dove partiamo

Oggi programmare un film si può fare in cinque modi diversi, tutti a metà:

| # | Percorso | File | Limite |
|---|----------|------|--------|
| 1 | **PLANNER AUTO** | `src/app/admin/planner/page.tsx` | 100 film random, nessun filtro, il periodo si sceglie *dopo* i film, orari non eleganti, il piano si può solo sfoltire |
| 2 | **Cerca Film (TMDB)** → modale | `AdminPanel.tsx:1154-1480` | un film alla volta, nessuna visione d'insieme |
| 3 | **Programma dal catalogo** | `CatalogBrowser.tsx` | ottimi filtri, ma finisce nella stessa modale a un film per volta |
| 4 | **Slot settimanali / bulk** | `adminGetWeeklySlots`, `adminBulkScheduleMovie` | griglia di orari a mano, nessun bilanciamento |
| 5 | **3 helper "smart"** | `adminGetSmartSuggestion`, `adminCheckConflict`, `adminFindNearestSlots` | tre implementazioni sovrapposte della stessa domanda: "questo slot è libero?" |

Problemi trasversali:

- **La pausa tra film è incoerente.** `getBlockedIntervals` blocca 15′ dopo gli
  spettacoli esistenti, ma `adminGenerateAutoPlan` ne richiede solo 10′ per quello
  nuovo (`CLEANING_NEW`), e `adminGetWeeklySlots` pure. Risultato: il planner
  propone orari che poi la validazione tratta con regole diverse.
- **Il ritmo è la metà di quello vero.** L'intensità "normale" genera 3
  spettacoli al giorno; nella realtà ne programmi 5-8, incatenati dall'apertura
  a mezzanotte passata.
- **Gli orari non sono eleganti.** Il jitter è `±30′ a passi di 5′` sull'ancora,
  quindi escono 14:35, 16:05, 21:55.
- **Il catalogo non viene da Plex.** È `scratch/catalogo.csv` (913 righe,
  `Title,Year,Duration,Director`), importato una tantum e abbinato a TMDB con
  matching fuzzy. Nessun aggiornamento quando aggiungi film alla libreria.
- **Le proiezioni esistenti non si vedono** mentre scegli il periodo.

## 2. Dove arriviamo

Un bottone: **PROGRAMMA**. Poi quattro passi.

```
┌─ 1. LO SLOT ────────────────────────────────────────────────┐
│ Sala + periodo (1 giorno … 30 giorni, a scelta libera)      │
│ Ogni giorno mostra le proiezioni GIÀ presenti e quanto è    │
│ saturo. Vedi subito dove c'è spazio e dove no.              │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌─ 2. IL CATALOGO INTELLIGENTE ───────────────────────────────┐
│ Ricerca · filtri · corsie tematiche:                         │
│   Consigliati · Premiati dalla critica · Acclamati ·         │
│   Novità in libreria · Sorpresa · Perfetti per questo slot   │
│ Scegli quanti film vuoi. Per ognuno puoi dire quante         │
│ repliche e in che fascia preferisci.                         │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌─ 3. IL CALENDARIO GENERATO ─────────────────────────────────┐
│ Il motore propone. Tu correggi: repliche +/-, trascini uno   │
│ spettacolo, lo blocchi, lo elimini, ne aggiungi uno a mano.  │
│ Ogni modifica ricalcola il resto senza toccare ciò che hai   │
│ bloccato.                                                     │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌─ 4. IN SALA ────────────────────────────────────────────────┐
│ Metadati TMDB + premi MUBI → DB, sub-eventi su Pretix,       │
│ sync chirurgico. Con progresso reale e retry dei falliti.    │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Plex → catalogo

**Vincolo:** il sito gira su Vercel, il Plex sta in LAN. Vercel non lo raggiunge.
Quindi è il Mac del cinema a **spingere** i dati, non il server a tirarli.

### 3.1 Lo script locale

`scripts/plex-sync.mjs`, lanciato sul Mac del cinema con `npm run plex:sync`
(o da un'automazione, o dall'app Swift).

```
Plex (localhost:32400)
  GET /library/sections                    → trova le sezioni "Film" e "4K"
  GET /library/sections/{key}/all          → tutti i film, sezione per sezione
       ↓ normalizza
  { title, originalTitle, year, durationMin, director,
    tmdbId, imdbId, plexKey, addedAt, summary, contentRating, libraries }
       ↓ fonde le copie: un film in due librerie resta UNA riga
       ↓ POST  Authorization: Bearer CATALOG_SYNC_SECRET
https://vestricinema.com/api/catalog/plex-sync
```

Le librerie lette sono un **elenco esplicito** (`PLEX_LIBRARIES`, default
`Film,4K`): sul server ne convivono altre di servizio, e una libreria creata
domani non deve finire in catalogo solo perché è nata. La prima dell'elenco dà
l'identità alla riga quando lo stesso film sta in entrambe. La fusione vive in
`scripts/plexMerge.mjs` ed è testata (`scripts/plexMerge.test.mjs`): sbagliarla
riempie il catalogo di doppioni, e ce ne si accorgerebbe solo programmando.

Il pezzo prezioso è che Plex conosce già il **tmdbId** (`Guid[]` contiene
`tmdb://12345`): l'abbinamento fuzzy titolo→TMDB sparisce per tutti i film in cui
Plex ha già l'ID, e con lui spariscono i `verifyStatus: suspect`.

Variabili nuove in `.env.local` (solo sul Mac, per lo script):
`PLEX_URL`, `PLEX_TOKEN`, `PLEX_LIBRARIES`. Sul sito serve solo
`CATALOG_SYNC_SECRET`.

### 3.2 L'endpoint

`src/app/api/catalog/plex-sync/route.ts`

- verifica il bearer token
- upsert per `sourceKey` (invariato, così il catalogo CSV esistente non si
  duplica) valorizzando `plexKey`, `tmdbId`, `addedAt`, `inPlex: true`
- i film spariti dalla libreria vengono marcati `inPlex: false` — **mai
  cancellati**, perché potrebbero essere già programmati
- risponde con `{ received, created, updated, removedFromPlex, needEnrich }`

Il CSV resta come importatore di riserva (`catalogSeed`), non è più il canale
primario.

### 3.3 Campi nuovi su `CatalogFilm`

```prisma
model CatalogFilm {
  // … esistenti …
  plexKey          String?   @unique
  inPlex           Boolean   @default(true)
  addedAt          DateTime?          // "Novità in libreria"
  originalTitle    String?
  originalLanguage String?
  overview         String?
  backdropPath     String?
  voteAverage      Float?             // TMDB → corsia "Acclamati"
  voteCount        Int?
  popularity       Float?
  awardLabels      String[]  @default([])  // MUBI → "Premiati dalla critica"
  awardsCheckedAt  DateTime?

  @@index([inPlex])
  @@index([voteAverage])
  @@index([addedAt])
}
```

`voteAverage`/`voteCount`/`popularity`/`overview` si riempiono già durante
`enrichPendingFilms` (i dati arrivano dalla stessa chiamata TMDB, oggi vengono
buttati via).

**Premiati dalla critica** su 900 film non si può fare al volo: `fetchMubiAwards`
è uno scraping. Quindi arricchimento **graduale in background**: un'azione
`catalogEnrichAwards(limit = 25)` che parte dai film con `voteAverage` più alto e
`awardsCheckedAt: null`, li interroga e salva `awardLabels`. Si lancia dal
pannello catalogo o da un cron notturno. Finché un film non è stato controllato
finisce nella corsia "Acclamati" (voto TMDB), che è comunque un buon proxy.

---

## 4. Il motore di scheduling

Nuovo modulo **puro** (nessun I/O, nessun `'use server'`): `src/services/scheduling/`.
È l'unico posto dove esiste la logica degli orari. Testabile con vitest, che c'è già.

### 4.1 Orari eleganti

Le regole sono state **ricavate dalla programmazione reale** (settimane 2026-W18
e 2026-W24, solo i giorni a sala singola), non inventate a tavolino. Le prime
ipotesi di questo documento erano smentite dai dati e sono state corrette.

```ts
// src/services/scheduling/times.ts
export const ELEGANT_TIERS = [
  [0, 30],            // la stragrande maggioranza degli inizi reali
  [15, 45],
  [10, 20, 40, 50],
  [25, 35, 55, 5],    // solo quando la catena non lascia scelta
];
```

Non un insieme di orari ammessi ma una **classifica di preferenza**: nei dati
reali `:00` e `:30` dominano nettamente, ma compaiono anche `:35`, `:25` e `:55`,
mentre `:05` non appare mai. Un elenco chiuso avrebbe escluso orari che usi.

### 4.2 Regole

| Regola | Valore | Da dove viene |
|---|---|---|
| Pausa minima tra spettacoli | **10′** | minimo osservato su 68 intervalli reali; la mediana generata resta sui 30′ |
| Apertura | 10:00 | confermata dai dati post 9 giugno |
| Chiusura | il film **finisce** entro l'01:00 | reale: si arriva a finire alle 00:58. Le pulizie non contano, dopo l'ultimo spettacolo si chiude |
| Spettacoli al giorno | 6 feriali / 7 festivi (normale) | reale: 5-8 al giorno |
| Prima serata | 18:30 – 21:50 | ogni giornata ne ha una |
| Stesso film, stesso giorno | permesso | pratica reale: *Sirāt* alle 10:00 e alle 16:10 |
| Stesso film di fila | evitato | rilassato solo se la giornata resterebbe bucata |
| Fascia preferita | precedenza, non bonus | vedi 4.3 |
| Proiezioni esistenti | blocchi immutabili | lette da `getBlockedIntervals` |

### 4.3 Precedenze, non punteggi

Le preferenze non sono bonus numerici: un punteggio si può sempre perdere contro
qualcos'altro, e infatti nella prima stesura un film «solo di sera» finiva in
matinée. Il motore prova invece quattro giri, allentando un vincolo per volta:

1. nessuna replica ravvicinata, fascia rispettata
2. **replica ravvicinata accettata**, fascia rispettata
3. fascia concessa, nessuna replica ravvicinata
4. tutto concesso

L'ordine è una scelta: una replica ravvicinata è un difetto estetico, mandare un
film fuori dalla fascia che hai chiesto tradisce una richiesta esplicita.

### 4.3 API del motore

```ts
buildSchedule(input: {
  window:   { startDate: string; days: number; timezone: string };
  occupied: Interval[];                        // esistenti + bloccati dall'utente
  films:    { tmdbId, title, runtime, replicas?, preferredBand? }[];
  locked:   Show[];                            // 🔒 non toccare
  intensity: 'soft' | 'normal' | 'festival';
  seed?:    number;                            // rigenera con esito diverso ma riproducibile
}): { shows: Show[]; warnings: Warning[]; stats: … }
```

Il ricalcolo incrementale usa lo stesso identico ingresso: quando cambi le
repliche di un film o trascini uno spettacolo, la UI ricostruisce `locked` con
tutto ciò che non deve muoversi e richiama `buildSchedule`. **Una sola funzione,
nessun percorso alternativo**, quindi ciò che vedi in anteprima è esattamente ciò
che verrà creato.

### 4.4 Test (`engine.test.ts`)

Invarianti:

- ogni orario prodotto è un minuto ammesso, e oltre il 60% cade su `:00` o `:30`
- mai meno di 10′ tra la fine di uno e l'inizio del successivo
- nessuna sovrapposizione con `occupied`
- niente prima delle 10:00, nessun film che finisca dopo l'01:00
- gli spettacoli in `locked` restano identici
- stesso `seed` → stesso piano
- un film con `replicas: 3` compare 3 volte, o produce un avviso motivato

Somiglianza alla programmazione reale, come guardrail contro derive future:

- 5-8 spettacoli al giorno
- pause con mediana fra 15′ e 40′
- ogni giornata apre alle 10:00 e arriva a notte fonda
- ogni giornata ha la sua prima serata

---

## 5. Il wizard

Rotta nuova: `/admin/programmazione`. `/admin/planner` diventa un redirect.

### Passo 1 — Lo slot

- selettore sala (default da `localStorage.defaultSalaId`, come oggi)
- preset periodo: **Oggi · Weekend · 7 giorni · 10 giorni · 2 settimane ·
  Personalizzato** (dal → al, fino a 30 giorni)
- per ogni giorno del periodo, una colonna con:
  - le proiezioni già presenti (orario + titolo)
  - una barra di **saturazione** sulle 15 ore utili (10:00→01:00):
    verde < 40%, giallo 40-70%, rosso > 70%
  - i buchi liberi con la loro durata ("libero 3h20′ dalle 14:00")
- riepilogo: *"In questi 9 giorni ci sono già 14 proiezioni. Restano circa 62
  slot liberi."*

Azione nuova: `planningGetPeriodOccupancy(roomId, startDate, days)`.

### Passo 2 — Il catalogo intelligente

Griglia poster + corsie orizzontali. Filtri server-side, già quasi tutti
disponibili in `catalogList`:

- ricerca titolo/regista (debounce 350ms, come oggi)
- genere · decennio · regista · **durata** (<90′, 90-120′, 120-150′, >150′) · lingua
- "mai programmato" / "includi già programmati"

Corsie:

| Corsia | Criterio |
|---|---|
| **Perfetti per questo slot** | durata che incastra nei buchi liberi trovati al passo 1 — la corsia più utile, ed è possibile solo perché il periodo si sceglie *prima* |
| **Consigliati** | mai programmati, voto alto, generi diversi da quelli già in cartellone nel periodo |
| **Premiati dalla critica** | `awardLabels` non vuoto, ordinati per numero di premi |
| **Acclamati** | `voteAverage >= 7.5 && voteCount >= 500` |
| **Novità in libreria** | `addedAt` decrescente (arriva da Plex) |
| **Sorpresa** | random, ripescabile all'infinito (esiste già: `catalogRandomMany`) |

Selezionando un film: **repliche** (auto / 1-6) e **fascia preferita**
(indifferente / matinée / pomeriggio / prima serata / seconda serata).
Vassoio in basso con i selezionati, come oggi nel planner.

### Passo 3 — Il calendario

Vista a colonne-giorno con timeline verticale.

- gli spettacoli **nuovi** sono card colorate per film
- quelli **esistenti** sono grigi e non si toccano
- **trascina** una card → snap al minuto elegante libero più vicino
- **🔒 blocca** una card → i ricalcoli non la spostano più
- **+/− repliche** per film dal pannello laterale → ricalcolo immediato
- **elimina** / **aggiungi a mano** (sostituisce la vecchia modale)
- **rigenera** con seed nuovo
- avvisi live: conflitti, film senza prima serata, film rimasti fuori

### Passo 4 — Conferma

Identico nella sostanza a quello che il planner già fa bene oggi, con:

1. `adminPrepareMetadata(tmdbId)` una volta per film → TMDB arricchito + **premi
   MUBI** salvati in `MovieOverride` + `MovieAward`
2. `adminScheduleMovie(..., skipSync: true, enrichedMetadata)` **sequenziale**
   per ogni spettacolo (Pretix non ama il parallelo: `adminBulkScheduleMovie` oggi
   spara tutto in `Promise.all` ed è una delle fonti di errori)
3. `adminSyncNewlyCreatedEvents(createdIds)` — sync chirurgico
4. resoconto con **retry solo dei falliti**, senza ricreare i riusciti

---

## 6. API REST per l'app Swift

Guscio sottile sopra le stesse funzioni usate dal wizard. Auth: header
`Authorization: Bearer $VESTRI_API_KEY`.

| Metodo | Rotta | Body / query | Risposta |
|---|---|---|---|
| GET | `/api/planning/rooms` | — | `Room[]` |
| GET | `/api/planning/occupancy` | `room, start, days` | `DayOccupancy[]` |
| GET | `/api/planning/catalog` | `search, genre, decade, minRuntime, maxRuntime, rail, page` | `{ films, total, hasMore }` |
| POST | `/api/planning/generate` | `{ roomId, startDate, days, intensity, films[], locked[], seed? }` | `{ shows, warnings, stats }` |
| POST | `/api/planning/commit` | `{ roomId, shows[] }` | `{ jobId }` — registra, non crea |
| POST | `/api/planning/commit/{jobId}` | `{ retry? }` | fa avanzare di un lotto → `{ state, phase, done, total, step, created[], errors[], pending }` |
| GET | `/api/planning/commit/{jobId}` | — | lo stesso, ma **senza** far avanzare |

`commit` non crea niente: scrive il piano come righe su database. La creazione
avviene a lotti, un lotto per ogni POST sul jobId, e si ripete fino a `done`.
Vedi la sezione 11: è la correzione più importante fatta dopo il primo uso vero.

Ogni proiezione già in sala (`DayOccupancy.shows`, e `existing` dentro
`/slots`) porta con sé il suo `tmdbId`, quando si riesce a saperlo — sta nel
`comment` del sub-evento, quindi c'è solo per ciò che è nato dalla
programmazione. È il campo che permette di **spostare** uno spettacolo invece
di poterlo solo cancellare: spostarlo significa ricrearlo altrove, e per
ricrearlo bisogna sapere quale film è. Quando è `null` lo spettacolo si può
ancora eliminare, ma non spostare — indovinare il film dal titolo vuol dire,
prima o poi, programmare l'omonimo sbagliato.

Spostare ha la sua rotta, in due verbi sullo stesso indirizzo:

| Metodo | Rotta | Cosa fa |
|---|---|---|
| GET | `/api/planning/shows/{id}/move` | `room, day, time, from?` → `MoveCheck`. Non tocca niente. |
| POST | `/api/planning/shows/{id}/move` | `{ room, day, time, from?, replaces[], force?, allowOutsideHours? }` → `{ moved, deleted }`, oppure **409** con `{ error, deleted }`. |

Sono due chiamate e non una perché qui il pubblico c'è già: si guarda, si
decide, si scrive. Il pannello serve a far decidere l'utente e non è ciò su cui
il server si fida — al POST `planningMoveShow` ricontrolla tutto da capo, e se
nel frattempo la destinazione è cambiata si ferma invece di eliminare qualcosa
che non era nella decisione. Per questo `replaces` non è un'opzione ma una
dichiarazione: sono gli id che l'utente ha *visto*.

**Lo spettacolo non viene ricreato.** `adminUpdateEventDate` cambia la data al
sub-evento Pretix che esiste già, quindi chi ha comprato il biglietto se lo
tiene: gli cambia l'orario, non gli sparisce lo spettacolo. `force` riguarda
solo ciò che si elimina per liberare la destinazione, e `movingShowSoldTickets`
nel `MoveCheck` è informativo — dice quanta gente troverà un orario diverso da
quello che aveva letto, non un ostacolo. `null` lì significa «non sono riuscito
a contarli», e non va confuso con zero.

---

## 7. Cosa viene eliminato

| Da rimuovere | Righe ≈ | Sostituito da |
|---|---|---|
| Modale "Programma Spettacolo" in `AdminPanel.tsx` | ~500 | passo 3 + "aggiungi a mano" |
| `CatalogBrowser` come entry point | — | diventa il passo 2 (il componente si riusa) |
| `adminGetWeeklySlots` | 90 | motore |
| `adminBulkScheduleMovie` | 60 | passo 4 |
| `adminGetSmartSuggestion` | 70 | motore |
| `adminFindNearestSlots` | 55 | motore |
| `adminGenerateAutoPlan` | 180 | `buildSchedule` |
| `/admin/planner` | 561 | `/admin/programmazione` |

Restano intatti e riusati: `adminScheduleMovie`, `adminPrepareMetadata`,
`adminSyncNewlyCreatedEvents`, `getBlockedIntervals`, `adminCheckConflict`,
tutto `services/pretix.ts` e `services/mubi.ts`.

Saldo: circa **−1500 righe** di logica duplicata, **+900** di motore testato e UI.

---

## 8. Ordine dei lavori

| Fase | Contenuto | Verificabile con |
|---|---|---|
| **1** | Motore `scheduling/` + test | `npm run test` — nessuna UI toccata, zero rischio |
| **2** | Schema Plex + script + endpoint | `npm run plex:sync` dal Mac |
| **3** | Wizard passi 1-2 | si naviga, si seleziona, non crea nulla |
| **4** | Wizard passi 3-4 | prima programmazione vera su una sala di prova |
| **5** | Rimozione ridondanze | l'admin ha un bottone solo |
| **6** | API REST + app Swift | il prompt in `docs/PROMPT-SWIFT-VESTRICINEMA.md` |

Le fasi 1 e 2 sono indipendenti e non toccano niente di ciò che funziona oggi:
il sito continua a girare normalmente finché non si arriva alla fase 5.

---

## 9. Cosa è cambiato rispetto al piano

Il piano è stato scritto prima di leggere la libreria vera e la sala vera.
Queste sono le correzioni che la realtà ha imposto.

### 9.1 Il 98% dei film ha già l'id TMDB — e il restante 2% non sono film

Sulla libreria reale: **930 film, 910 con `tmdb://` già noto a Plex**. Il
matching fuzzy titolo→TMDB sparisce quasi del tutto, come previsto.

Ma i 20 senza id non erano film mancanti: erano **video di casa e lavori
propri** — cortometraggi, riprese, elaborati, tutti sotto l'ora. Solo 4 erano
lungometraggi veri che Plex non aveva riconosciuto.

Il piano prevedeva di darli tutti in pasto alla ricerca per titolo. Sarebbe
stato **peggio che ignorarli**: un video di tre minuti intitolato *"Il conto"*
avrebbe trovato un film vero e sarebbe finito fra quelli programmabili. Quindi
la regola è diventata: se Plex dichiara di non conoscerlo (`guid` `local://` o
agente `none`) **e** dura meno di 60 minuti, entra in catalogo come `missing` e
nessuno lo cerca su TMDB. I 4 lungometraggi veri passano dal matching normale.

### 9.2 `inPlex` nasce falso, non vero

Il piano diceva `@default(true)`. Ma prima del primo sync non sappiamo se un
film del CSV sia in libreria, e dire di sì sarebbe una bugia che l'interfaccia
mostrerebbe. Con `false` il filtro "solo in libreria" è vuoto finché il sync non
gira — il che è scomodo per dieci minuti, e vero per sempre.

### 9.3 Il token Plex non lo maneggia nessuno

Sul Mac del cinema il server Plex è locale, e il suo token è già nelle
preferenze di sistema. Lo script se lo legge da sé
(`defaults read com.plexapp.plexmediaserver PlexOnlineToken`): niente token in
`.env.local`, niente token in chat, niente token in un file in più.
`PLEX_TOKEN` resta come scavalco per gli altri casi.

### 9.4 La pausa era davvero incoerente, e nel verso peggiore

Confermato leggendo il codice: `getBlockedIntervals` imbottiva gli spettacoli
esistenti di **15 minuti**, mentre la creazione ne chiedeva **10**. Non è solo
inelegante: un piano che mettesse un film a 10 minuti da uno esistente sarebbe
stato generato come valido e poi **rifiutato al salvataggio**. Ora entrambi
leggono `MIN_GAP_MINUTES` dal motore, che vale 10 — il minimo osservato nella
programmazione reale.

### 9.5 Una copia della creazione in meno

Il piano metteva il commit asincrono solo sulle API REST, lasciando al wizard
web il suo ciclo lato client. Sarebbero state due implementazioni della stessa
sequenza — esattamente il difetto di `adminBulkScheduleMovie`. Ora esiste un
solo `commitRunner`: il wizard avvia un lavoro e ne segue l'avanzamento come
farebbe l'app Swift.

Il registro dei lavori viveva **in memoria**, ed è stato l'errore più costoso di
tutto il progetto: vedi la sezione 11. Ora sta su Postgres.

### 9.6 Cose che il modale sapeva fare e il wizard doveva imparare

Rimuovere le ~500 righe del modale avrebbe portato via due capacità:

- **cercare un film non ancora in catalogo** → ora il passo 2 propone "Cercalo
  su TMDB" quando la griglia è quasi vuota, e lo aggiunge al catalogo
- **replicare uno spettacolo esistente** → ora il pulsante apre
  `/admin/programmazione?tmdb=…&room=…`, con il film già scelto

### 9.7 Il difetto che i test hanno trovato nel motore

Con pochi film e molti slot, la regola "mai lo stesso film due volte nello
stesso giorno" lasciava **sempre vuote le 21:00** — la prima serata, la fascia
che vale di più. La varietà si stava mangiando l'incasso. Il motore ora fa due
giri: cerca varietà, e solo se lo slot resterebbe buio accetta una replica in
giornata, penalizzandola.

### 9.8 Una trappola di Next da ricordare

`export type { X }` dentro un file `'use server'` **rompe la build**: ogni
export di un modulo server viene registrato come riferimento a runtime, e un
tipo a runtime non esiste (`ReferenceError: FreeGap is not defined`). Il
typecheck non lo vede — l'ha trovato `npm run build`. I tipi condivisi vanno
importati dal modulo che li dichiara.

---

## 10. Configurazione

Variabili nuove.

| Variabile | Dove | A cosa serve |
|---|---|---|
| `PLEX_URL` | Mac del cinema | default `http://localhost:32400` |
| `PLEX_LIBRARY` | Mac del cinema | nome della libreria film (`Film`) |
| `PLEX_TOKEN` | Mac del cinema | facoltativa: se Plex è locale, lo script lo trova da sé |
| `CATALOG_SYNC_URL` | Mac del cinema | `https://…/api/catalog/plex-sync` |
| `CATALOG_SYNC_SECRET` | Mac **e** sito | segreto condiviso del sync |
| `VESTRI_API_KEY` | sito | chiave bearer per le API dell'app Swift |

Prima del primo avvio serve applicare lo schema:

```bash
npx prisma db push
```

Poi, dal Mac del cinema:

```bash
npm run plex:sync -- --dry   # prova: legge e non manda niente
npm run plex:sync            # sincronizza davvero
```

### 10.1 Riempire il catalogo storico

I ~900 film già in catalogo sono tutti `verifyStatus: ok`, quindi
`enrichPendingFilms` non li guarda: senza un recupero apposta resterebbero per
sempre senza voto e senza trama, e con loro resterebbero vuote le corsie che ci
si appoggiano.

Il pulsante **Importa/aggiorna catalogo** del pannello catalogo fa tutto:
CSV → abbinamento TMDB → `backfillFilmMetadata`, che completa le schede
mancanti. È ripetibile e riprende da dove era rimasto, quindi si può
interrompere chiudendo il pannello senza perdere il lavoro fatto.

### 10.2 Preparare l'app Swift

Il prompt da incollare in Claude Code sul progetto Xcode è
`docs/PROMPT-SWIFT-VESTRICINEMA.md`: è già completo, dominio incluso, e si
copia intero senza ritagliare niente.

```bash
pbcopy < docs/PROMPT-SWIFT-VESTRICINEMA.md
```

Prima però serve la chiave, e va **generata da te** — non deve passare per
nessun altro:

```bash
openssl rand -hex 32
```

L'output va messo su Vercel come `VESTRI_API_KEY` (Production), e poi
inserito nell'app dalla schermata impostazioni. Finché la variabile non c'è, le
rotte rispondono `503`: è deliberato, un endpoint che scrive su Pretix non deve
poter diventare pubblico per una dimenticanza.

Verifica che sia tutto a posto prima di far scrivere una riga all'app:

```bash
curl -s -H "Authorization: Bearer LA_TUA_CHIAVE" https://vestricinema.com/api/planning/rooms
```

Deve rispondere con l'elenco delle sale. `401` = chiave sbagliata,
`503` = variabile non configurata su Vercel.

### 10.3 I premi non si estraggono in blocco

La prima versione aveva un pulsante che interrogava MUBI per tutti e 900 i film.
È stato tolto, e la ragione vale più della funzione: **cercare i premi di film
che non hai ancora scelto è lavoro sprecato**. Sono centinaia di scraping per
riempire una corsia che consulterai per trenta secondi.

I premi si estraggono dove servono davvero: `adminPrepareMetadata` interroga
MUBI alla conferma del calendario, per i soli film che stai programmando. Da lì
vengono salvati **anche** in `CatalogFilm.awardLabels` — nella stessa
transazione, senza una chiamata in più. Il catalogo si arricchisce da sé man
mano che programmi.

Conseguenza da accettare: la corsia "Premiati dalla critica" all'inizio non
compare, e cresce con l'uso. Nel frattempo il lavoro lo fa "Acclamati"
(`voteAverage >= 7.5 && voteCount >= 500`), che è gratis perché il voto arriva
dalla stessa chiamata TMDB di tutto il resto.

---

## 11. Quello che si è rotto davvero, e come è stato aggiustato

Le sezioni sopra descrivono il sistema come era stato pensato. Questa descrive
cosa è successo usandolo per una programmazione vera da due settimane — cento e
passa spettacoli — e cosa è cambiato di conseguenza. È la parte più importante
del documento, perché contiene l'unica cosa che il piano aveva sbagliato in
modo grave.

### 11.1 Il lavoro in sottofondo che non esisteva

`startCommit` faceva così:

```ts
void run(job.id, input).catch(…);   // niente await: "il lavoro vive per conto suo"
return job.id;                      // e si risponde subito
```

Su un server con un processo che resta acceso, funziona. **Su Vercel no.**
L'istanza viene congelata appena la risposta è partita, e quella promessa muore
dove si trova. Sommato al fatto che il registro dei job stava in una `Map` di
processo — quindi spariva al cambio d'istanza — il risultato era esattamente
ciò che si vedeva:

- la creazione si fermava a metà senza dire perché;
- la pagina doveva restare aperta per ore, perché era il polling a tenere
  sveglia l'istanza — per caso, non per progetto;
- un wifi caduto portava via tutto, e non restava modo di sapere cosa fosse
  stato creato davvero;
- e la sola difesa possibile era «non rilanciare mai», perché rilanciare
  duplicava.

Non era un problema di prestazioni. Cento spettacoli creati uno alla volta non
entrano nella vita di una richiesta serverless, punto: nessuna ottimizzazione
avrebbe salvato quell'architettura.

**Ora** il lavoro è una riga (`PlanningCommitJob`) e ogni spettacolo da creare è
una riga sua (`PlanningCommitItem`). `POST /commit` scrive l'elenco e basta.
Ogni `POST /commit/{jobId}` prende un lotto di righe `todo`, le crea, ne scrive
l'esito e torna. Chi guarda la barra è anche chi fa avanzare il lavoro.

Le conseguenze sono tutte quelle che servivano:

| | Prima | Ora |
|---|---|---|
| Istanza che muore | lavoro perso a metà | le righe prenotate scadono e tornano disponibili |
| Wifi caduto / pagina chiusa | tutto perso | si riapre e si riprende da dove era |
| Riprovare | crea doppioni | una riga con `pretixId` non viene mai ripresa in mano |
| Due schede aperte | due creazioni in volo | le righe si prenotano: una sola lavora |
| Cosa è stato creato | ignoto | è scritto riga per riga |

### 11.2 La sequenzialità non serviva più da un pezzo

Gli spettacoli si creavano rigorosamente uno alla volta, con questa
motivazione: *«due creazioni in volo insieme non si vedono a vicenda»*. Vera
quando ogni creazione andava a rileggersi il palinsesto da sola.

Ma il piano è noto **per intero** prima di cominciare. Quindi: l'occupazione
della sala si legge una volta per lotto, e a ogni spettacolo si passa come
`knownBlocked` la sala **più tutti i suoi fratelli del piano, tranne sé stesso**.
Ogni creazione vede così più di quanto vedesse prima — anche gli spettacoli che
verranno dopo, non solo quelli già fatti — e il parallelismo diventa sicuro
senza allentare un solo controllo.

Cinque spettacoli per ondata, dieci per lotto. Il cancello delle richieste
verso Pretix è passato da 3 a 10, perché a tre era lui il collo di bottiglia; la
gestione del 429 resta dov'era e continua a fermare tutto quando serve.

### 11.3 I metadati non si perdono più fra un lotto e l'altro

Fra un tick e l'altro non sopravvive niente in memoria, e rifare lo scraping
MUBI a ogni lotto sarebbe assurdo. Ma `adminPrepareMetadata` ha già scritto
tutto su `MovieOverride`: `loadPreparedMetadata` rimette insieme da lì lo stesso
oggetto che la creazione si aspetta, senza una chiamata di rete.

I premi si fotografano **prima** del sync e si riscrivono dopo. Il codice
precedente li riscriveva da un oggetto tenuto in memoria; leggerli dopo il sync
avrebbe letto il vuoto, perché è il sync a ricreare le schede da TMDB e a
portarsi via i premi con la cascata.

Un film senza metadati non blocca più niente: c'è un tetto di venti secondi, e
scaduto quello lo spettacolo si crea comunque. I premi si recuperano dal
pannello film.

### 11.4 Scegliere i film era il vero costo

Il wizard chiedeva di spuntare venti titoli prima di mostrare un solo orario.
Non è difficile — è **lungo**, ed è lungo perché inventare da zero costa più che
correggere. Due aggiunte, entrambe pure e testate:

- **`autoPick`** (`services/scheduling/autoPick.ts`) sceglie *chi* va in sala e
  in che fascia; `buildSchedule` continua a decidere *quando*. Restano separati
  apposta: cambiare un film non deve rimettere in discussione gli orari.
  Il giro è **per fascia, non per film**: si guarda quanti spettacoli servono la
  mattina e si cerca chi ci sta bene, invece di prendere i venti film migliori e
  spalmarli — che è ciò che produceva matinée fatte di drammi da due ore e mezza.
  La prima serata si serve per prima, perché è la fascia che vale di più e i
  film forti non devono essere già stati spesi altrove.
- **Il tabellone**: cento locandine dalla libreria, si scelgono quelle che
  piacciono, si aggiorna e cambiano *tranne quelle scelte*. Si fanno più giri.

Il pulsante principale del passo 1 non è più «scegli i film» ma **«Programma
tu»**, che porta dritto al calendario pieno.

Il catalogo da cui si pesca è **solo `inPlex`**. Proporre un film che non hai
più in libreria significa scoprirlo la sera della proiezione.

### 11.5 Cambiare un film: due clic

Il ⇄ su una card del calendario apre le alternative **per quello slot**: non il
catalogo, ma i film che ci stanno davvero — durata compatibile con lo spazio
fino allo spettacolo successivo, ordinati per affinità con la fascia. Un clic e
il film è cambiato.

Di default cambia **tutti** gli spettacoli di quel film, perché chi apre quel
pannello di solito pensa «questo film non mi piace», non «questa replica delle
16:10 non mi piace». Il singolo resta a un clic di distanza.

I film scartati finiscono in un elenco che l'autoprogrammazione non ripropone:
una risposta già data non va richiesta due volte.

### 11.6 La bozza

`PlanningDraft`, una per sala, riscritta a ogni modifica con 1,2 secondi di
attesa. All'apertura, se c'è, si può riprendere. Non è un salvataggio di cui
fidarsi ciecamente — è una rete: se fallisce non succede niente e non lo si dice,
perché il lavoro vero prosegue lo stesso.

### 11.7 Un difetto trovato per strada

`adminScheduleMovie` faceva `details.genres?.map(g => g.name)` sia sui dettagli
grezzi di TMDB (dove i generi sono `{ id, name }`) sia sui metadati arricchiti
(dove sono già stringhe). Programmando a lotti — cioè sempre — il biglietto
souvenir riportava «undefined, undefined» al posto dei generi. Ora accetta
entrambe le forme.

### 11.8 Prima di usarlo

```bash
npx prisma db push
```

Le tabelle nuove sono tre: `PlanningCommitJob`, `PlanningCommitItem`,
`PlanningDraft`. Finché non esistono, la conferma non parte.
