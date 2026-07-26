Devi aggiungere all'app VestriCinema una funzione per programmare i film del
cinema direttamente dall'iPhone/iPad.

## Contesto

Il cinema ha un sito Next.js (dominio: https://vestricinema.com) che è l'unico
cervello del sistema: conosce il catalogo film, calcola gli orari, parla con
Pretix (biglietteria) e con MUBI (premi). L'app NON deve reimplementare niente di
tutto questo e NON deve mai parlare direttamente con Pretix. L'app è un client:
chiama le API del sito, mostra i risultati, manda le scelte dell'utente.

L'unico utente è il gestore del cinema. Nessun login utente: l'autenticazione è
una API key personale salvata in Keychain.

## Prima di scrivere codice

1. Leggi la struttura del progetto e adegua ciò che segue alle sue convenzioni
   esistenti (architettura, naming, gestione dello stato, design system).
   Se l'app usa già un networking layer, un design system o un pattern di
   navigazione, USA QUELLI. Non introdurre dipendenze esterne.
2. Individua da dove si accede alle funzioni di gestione e aggiungi lì un solo
   punto d'ingresso: "Programma".
3. Se qualcosa nella struttura esistente contraddice queste istruzioni,
   segnalamelo invece di forzare.

## ⚠️ Stai lavorando contro il cinema vero

Non esiste un ambiente di prova. `https://vestricinema.com` è il sito in
produzione, e `POST /api/planning/commit` **crea davvero gli spettacoli sulla
biglietteria**: compaiono online, la gente può comprarci i biglietti.

Quindi, mentre sviluppi:

- Le chiamate in **lettura** (`/rooms`, `/occupancy`, `/catalog`) e `/generate`
  sono innocue: puoi usarle quanto vuoi, non scrivono niente.
- **Non chiamare mai `/commit`** di tua iniziativa, né per provare, né in un
  test automatico, né "solo una volta per vedere se funziona". Quando arrivi al
  punto in cui servirebbe, **fermati e chiedimelo**, e ti dirò io su quale sala
  e in che data provare.
- Non scrivere test che chiamino `/commit`. Se ti serve provare la schermata di
  avanzamento, usa una risposta finta.

## Le due idee da capire prima di scrivere il client

**1. Il tempo è ora di Roma, sempre.** Le date che arrivano e che mandi sono
etichette di orologio a muro (`"2026-08-01"`, `"20:30"`), non istanti. Non
convertirle mai in UTC, non riformattarle, non passarle per un `Date` prima di
rimandarle indietro. Se devi mostrarle, mostrale così come sono.

**2. Uno spettacolo ha due date, e servono a cose diverse.**
Uno spettacolo delle 00:30 appartiene alla *serata precedente*: è il giorno in
cui il pubblico dice di esserci andato.
- `day` = giorno di programmazione → usalo per **raggruppare** nel calendario
- `date` = data di calendario reale → usalo per **creare** lo spettacolo
Per uno spettacolo delle 00:30 del 2 agosto, `day` è `"2026-08-01"` e `date` è
`"2026-08-02"`. Confonderli sposta lo spettacolo di un giorno.

## Contratto API

Tutte le chiamate portano l'header:
    Authorization: Bearer <apiKey>
    Content-Type: application/json

Errori: HTTP non-2xx con body { "error": "messaggio leggibile in italiano" }.
Mostra sempre quel messaggio all'utente, mai un errore tecnico grezzo.
Un 503 significa che il server non ha la chiave configurata; un 401 che la tua
è sbagliata: sono due messaggi diversi per l'utente.

### GET /api/planning/rooms
→ { "rooms": [ { "id": 12, "name": "Sala grande", "isFavorite": true } ] }

### GET /api/planning/occupancy?room=12&start=2026-08-01&days=7
→ { "startDate": "2026-08-01",
    "days": 7,
    "totalShows": 14,
    "freeSlotsEstimate": 41,          // stima di quanti spettacoli ci stanno ancora
    "genresInSchedule": ["Drammatico", "Commedia"],
    "occupied": [ { "start": 1110, "end": 1250 } ],   // ignoralo: serve al motore
    "daysDetail": [
      { "date": "2026-08-01",
        "weekday": "sabato",
        "isWeekend": true,
        "isPast": false,
        "saturation": 0.42,           // 0…1 sulle 15 ore utili (10:00→01:00)
        "busyMinutes": 378,
        "shows": [ { "pretixId": 991, "title": "Perfect Days",
                     "time": "18:30", "endTime": "20:34", "runtime": 124,
                     "startMinute": 1110, "endMinute": 1234 } ],
        "gaps": [ { "from": "10:00", "to": "18:15", "minutes": 495,
                    "startMinute": 600 } ] } ] }

`startMinute`/`endMinute` sono minuti contati dalla mezzanotte del primo giorno
del periodo. Non ti servono per l'interfaccia: usa `time` e `endTime`.

### GET /api/planning/catalog
Parametri: `search`, `genre`, `decade`, `minRuntime`, `maxRuntime`,
`onlyInPlex=1`, `hideScheduled=0`, `page`, `pageSize` (max 100).
Aggiungi `rails=1` per avere anche le corsie tematiche, e con esso
`gaps=495,240` (i `minutes` dei buchi liberi del periodo scelto) e
`genresInSchedule=Drammatico,Commedia`.

→ { "films": [ { "id": 417, "tmdbId": "12345", "title": "Perfect Days",
                 "year": 2023, "runtime": 124, "durationMin": 124,
                 "director": "Wim Wenders", "posterPath": "/abc.jpg",
                 "genres": ["Drammatico"], "voteAverage": 7.9,
                 "awardLabels": ["Cannes — Miglior attore"],
                 "inPlex": true, "verifyStatus": "ok", "scheduledCount": 0 } ],
     "total": 913, "page": 1, "pageSize": 40, "hasMore": true,
     "rails": [ { "rail": "perfect", "label": "Perfetti per questo slot",
                  "films": [ /* stessa forma */ ] } ] }

Corsie: perfect | recommended | awarded | acclaimed | fresh | surprise.
"perfect" compare SOLO se hai passato `gaps`: è la corsia dei film la cui durata
incastra nei buchi liberi, e senza i buchi non ha senso.

La durata sta in `runtime` (da TMDB) oppure in `durationMin` (dalla libreria):
usa `runtime ?? durationMin`. Scarta i film con `tmdbId` nullo o
`verifyStatus == "missing"`: non sono programmabili.

Poster: https://image.tmdb.org/t/p/w342<posterPath>  (w780 per il dettaglio).
`posterPath` può essere null → usa un placeholder, non far crashare la cella.

### POST /api/planning/generate
{ "seatingPlanId": 12, "startDate": "2026-08-01", "days": 7,
  "intensity": "normal",                        // soft | normal | festival
  "films": [ { "tmdbId": "12345", "replicas": 3, "preferredBand": "evening" } ],
  "locked": [ /* Show[] che non devono spostarsi */ ],
  "seed": 42 }                                  // opzionale: rigenera diverso
→ { "shows": [ { "tmdbId": "12345", "title": "Perfect Days",
                 "runtime": 124, "posterPath": "/abc.jpg",
                 "day": "2026-08-01", "date": "2026-08-01",
                 "time": "20:30", "endTime": "22:34",
                 "startMinute": 1230, "endMinute": 1354,
                 "band": "evening", "locked": false } ],
    "warnings": [ "«Il film X» non ha nessuna prima serata." ],
    "stats": { "shows": 18, "films": 6, "daysUsed": 7,
               "slotsOffered": 44, "slotsFilled": 18 },
    "seed": 42,
    "existing": [ /* daysDetail, come in /occupancy */ ] }

Attenzione al nome: è `seatingPlanId`, non `roomId`.
`band` ∈ matinee | afternoon | evening | night.
`replicas` e `preferredBand` sono facoltativi: ometterli lascia decidere al
motore, ed è il caso normale.
Lo stesso `seed` con gli stessi ingressi produce lo stesso identico piano.
`existing` sono le proiezioni già in sala: mostrale nel calendario in grigio,
non si toccano e non vanno mai rimandate al server.

### POST /api/planning/commit
{ "seatingPlanId": 12,
  "shows": [ { "tmdbId": "12345", "date": "2026-08-01", "time": "20:30" } ] }
→ 202 { "jobId": "cj_m4k2p_a1b2c3" }

Manda `date` (la data di calendario), NON `day`. Manda solo gli spettacoli
nuovi, mai quelli che erano già in sala.

### GET /api/planning/commit/{jobId}
→ { "id": "cj_…", "state": "running",     // pending | running | done | error
    "step": "Spettacolo 7/22 · Perfect Days · 2026-08-01 20:30",
    "done": 7, "total": 29,
    "created": [ 991, 992 ],
    "errors": [ { "key": "12345@2026-08-01T20:30",
                  "label": "Perfect Days · 2026-08-01 20:30",
                  "error": "Conflitto rilevato: …" } ],
    "startedAt": 1785000000000 }

Il commit dura minuti (crea sub-eventi su Pretix uno per uno). Fai polling ogni
2 secondi finché `state` è `pending` o `running`.

TRE REGOLE SUL COMMIT, e sono quelle che evitano danni veri:

1. **Non rilanciare mai un commit già avviato.** Crea spettacoli doppi, e
   nessuno se ne accorge al posto tuo. Persisti il `jobId` appena lo ricevi.
2. **Un 404 sul job significa "non lo so", non "è fallito".** Il registro dei
   lavori vive in memoria e il server ha più istanze: il tuo polling può
   finire su una che non conosce quel job. In quel caso richiama
   `/occupancy` e mostra all'utente cosa risulta creato — non ricommittare.
3. **Il riprova manda SOLO gli spettacoli in errore**, ricostruiti dagli
   `errors[].key` (formato `tmdbId@YYYY-MM-DDTHH:mm`). Quelli riusciti sono già
   in sala.

## Flusso da realizzare — 4 schermate

### 1. Periodo
- selettore sala (default: l'ultima usata, salvata in UserDefaults)
- preset: Oggi · Weekend · 7 giorni · 10 giorni · 2 settimane · Personalizzato
- per ogni giorno: le proiezioni già presenti e una barra di saturazione
  (verde <40%, giallo 40-70%, rosso >70%); i giorni con `isPast` in grigio
- mostra i `gaps` come "libero 8h15′ dalle 10:00": è l'informazione che rende
  utile scegliere il periodo prima dei film
- riepilogo: "In questi 7 giorni ci sono già 14 proiezioni. Restano circa 41
  spettacoli di spazio."
- avanti → schermata 2

### 2. Catalogo
- barra di ricerca con debounce 350 ms
- corsie orizzontali scorrevoli, "Perfetti per questo slot" per prima; passa i
  `gaps` presi dalla schermata 1
- filtri in un foglio a parte: genere, decennio, durata, mai programmati
- tap su un poster → si seleziona
- tap sul badge → foglio con repliche (auto, 1-6) e fascia preferita
- vassoio fisso in basso con i selezionati e il conteggio
- "Genera programmazione" → POST /generate → schermata 3

### 3. Calendario
- lista raggruppata per `day`, ogni spettacolo mostra orario, fine, poster,
  titolo, fascia
- swipe per eliminare
- tap su uno spettacolo → 🔒 blocca / sblocca (bloccato = non si sposta più)
- pannello film in alto: stepper +/− repliche per ogni film
- QUALSIASI modifica (repliche, eliminazione) rilancia POST /generate mandando
  come `locked` tutti gli spettacoli bloccati. Non ricalcolare mai gli orari
  lato Swift: la matematica sta solo sul server, ed è ciò che garantisce che
  l'anteprima sia identica a quello che verrà creato.
- "Rigenera" → stesso /generate con `seed` nuovo (Int.random)
- gli avvisi (`warnings`) in un banner giallo, non bloccante
- "Conferma · crea N spettacoli" con alert di conferma esplicito → schermata 4

### 4. Esecuzione
- barra di avanzamento con `done/total` e il testo di `step`
- non permettere di uscire mentre è in corso senza un avviso
- a `done`: riepilogo creati/errori, con gli errori leggibili in lista
- se ci sono errori: "Riprova i falliti" (vedi le tre regole sopra)
- "Fine" torna alla home

## Requisiti tecnici

- SwiftUI, async/await, `URLSession`. Nessun package esterno.
- Un solo `PlanningAPIClient` (actor) con i metodi del contratto sopra e tipi
  `Codable` per ogni payload. Niente `[String: Any]`.
- Un `PlanningFlowModel` (`@Observable` o `ObservableObject`, coerente col resto
  dell'app) che tiene lo stato dei 4 passi. Le schermate sono stupide.
- API key in Keychain, con una schermata di impostazioni per inserirla e un
  controllo di validità (chiama /rooms).
- jobId del commit in corso persistito finché non è `done`, e ripreso al
  rientro in foreground.
- Tutte le stringhe visibili in italiano.
- Supporta Dynamic Type e Dark Mode.
- Stati di caricamento, vuoto ed errore per ogni schermata: mai una schermata
  bianca senza spiegazione.
- Poster caricati con `AsyncImage` e cache in memoria; nessuna libreria di
  imaging.

## Cosa NON fare

- Non parlare con Pretix, TMDB o MUBI direttamente.
- Non calcolare orari, pause o conflitti nell'app.
- Non salvare l'API key in UserDefaults o nel codice.
- Non chiamare /commit più di una volta per lo stesso piano.
- Non convertire le date in UTC.
- Non mandare in commit gli spettacoli di `existing`.

## Alla fine

Compila (`xcodebuild` o Cmd+B) e correggi gli errori. Poi elencami:
i file creati, dove hai messo il punto d'ingresso "Programma", e ogni punto in
cui hai dovuto discostarti da queste istruzioni per rispettare l'architettura
esistente.
