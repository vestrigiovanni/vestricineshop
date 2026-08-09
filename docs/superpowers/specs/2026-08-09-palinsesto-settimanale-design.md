# Il palinsesto: vedere la settimana, spostare, eliminare

**Data:** 2026-08-09
**Stato:** approvato da Giovanni (conversazione del 9 agosto 2026)

## Obiettivo

Oggi, dall'admin, non si vede *la settimana*: si vede un elenco di film da espandere uno
per uno. E ciò che è già in cartellone non si può né spostare né eliminare, se non
buttando via il film intero con tutte le sue repliche.

Questa specifica aggiunge una vista sola — **il palinsesto** — dove la settimana si legge
a colpo d'occhio e ogni singolo spettacolo si prende in mano: lo si trascina su un altro
giorno, gli si riscrive l'orario, lo si elimina. Con avvisi che spiegano cosa comporta,
non divieti che si mettono di traverso.

## Da dove partiamo

| Dove | Cosa fa oggi | Cosa manca |
|---|---|---|
| `AdminPanel.tsx:429` — "Programmazione Attuale (Pretix)" | elenco **raggruppato per titolo**, da espandere replica per replica; badge conflitto; quote e disponibilità | non è una settimana; l'unico "elimina" è il gruppo intero; si sposta solo accettando un suggerimento automatico, e solo se c'è già una sovrapposizione |
| `StepSlot.tsx` (passo 1 del wizard) | griglia a colonne-giorno con saturazione e buchi liberi | le proiezioni esistenti sono chip col lucchetto: informative, immobili |
| `StepCalendar.tsx` (passo 3) | trascinamento, orario a mano, elimina, blocca | vale **solo per gli spettacoli non ancora creati**; gli esistenti sono `.calExisting`, "non si tocca" |

Il motore invece c'è già tutto, ed è questo che rende il lavoro corto:

- `planningGetPeriodOccupancy` — i giorni con dentro le proiezioni, la saturazione, i buchi
- `checkSlot` (`services/scheduling/freeSlots`) — puro e testato: dice se un orario regge,
  cosa lo occupa, se sfora apertura o chiusura
- `planningDeleteShow` — elimina con la rete di sicurezza dei biglietti venduti
- `adminUpdateEventDate` — sposta il sub-evento su Pretix e aggiorna `PretixSync` in locale
- `countSoldTickets` — quante persone hanno già pagato per quello spettacolo

## Non-obiettivi

- **Non si crea niente da qui.** Un buco libero non offre "aggiungi qui": per creare c'è
  il wizard, che sa anche scegliere il film, i metadati e le repliche.
- **Non si spostano in blocco le repliche** di un film. Uno spettacolo per volta.
- Nessuna modifica al wizard esistente, al motore di scheduling, allo schema dati.

---

## 1. Dove vive

Terzo riquadro nella barra dei modi di `/admin/programmazione`, accanto a *Dal periodo* e
*Dal film*: **Il palinsesto**.

Non è un wizard: è una vista sola. Quando è attiva, `page.tsx` non mostra né la barra dei
passi né il footer. Restano i tre controlli che già esistono e già funzionano — sala, dal
giorno, per quanti giorni — perché sono esattamente quelli che servono anche qui.

```
mode: 'period' | 'film' | 'palinsesto'
```

`STEP_LABELS` non cambia: si consulta solo quando `mode !== 'palinsesto'`. Passando al
palinsesto lo stato del wizard non si azzera — si può tornare a *Dal periodo* e ritrovare
le proprie scelte.

## 2. Cosa si vede

La griglia a colonne-giorno del passo 1, riusata con le sue classi (`.dayCol`,
saturazione, `.gapChip`, weekend, giorni passati). La differenza è che ogni proiezione,
da chip, diventa una card che si può prendere in mano:

```
┌ giovedì 14 ──────────── 62% ┐
│ ⠿ 18:30  Perfect Days       │
│   124′ · fine 20:34    ✎ 🗑 │
│ ····· libero 1h20′ ·····    │
│ ⠿ 21:00  La Chimera         │
│   130′ · fine 23:10    ✎ 🗑 │
└─────────────────────────────┘
```

- **poster** a sinistra, se il film è in catalogo (vedi §5)
- **trascinamento** su un'altra colonna → stesso orario, giorno nuovo
- **clic sull'orario** → campo `HH:mm`, con la stessa regola del passo 3: un orario prima
  dell'apertura appartiene alla serata del giorno precedente
- **cestino** → elimina *quello* spettacolo
- i **buchi liberi** restano visibili tra una card e l'altra: sono la ragione per cui si
  guarda la settimana

I giorni passati si vedono ma non si toccano: niente trascinamento, niente cestino.

**Cosa non si vede nella griglia:** i biglietti venduti per ogni spettacolo. Contarli
costa una chiamata a Pretix per proiezione — una quarantina per una settimana — e la
vista deve aprirsi subito. Il conteggio si fa nel momento in cui conta davvero: quando
stai per spostare o eliminare.

## 3. Spostare: sempre a due tempi

Il rilascio del trascinamento, o l'invio dell'orario, **non salva niente**. Chiama
`planningCheckMove` e apre un pannello che dice cosa comporterebbe. Si scrive solo dopo
una conferma esplicita.

Il pannello ha quattro esiti:

**a) Libero.**
> giovedì 18:30 → sabato 21:00. Libero: 21:00–23:04.

→ *Sposta*

**b) Libero ma fuori orario.** Stessa regola già in uso in `planningCheckManualSlot`:
l'apertura e la chiusura sono una decisione di chi gestisce il cinema, non una legge di
natura. Si dice a che ora finirebbe e di quanto si sfora, e si lascia decidere.

→ *Sposta lo stesso*

**c) Occupato, e ciò che occupa si può togliere.** Si elencano gli spettacoli in mezzo,
ciascuno con orario e **biglietti venduti**.

> Alle 21:00 c'è «La Chimera», con 4 biglietti venduti. Sostituirlo lascia orfani ordini
> di gente che ha pagato: andranno rimborsati a mano da Pretix.

→ *Sposta ed elimina «La Chimera»*, che resta **spento** finché non si spunta una riga che
dice per esteso cosa si sta facendo. Senza biglietti venduti la spunta non serve: non c'è
nessuno da avvisare, e chiedere una conferma cerimoniale per niente insegna solo a
premere sì senza leggere.

**d) Occupato da qualcosa che non si può togliere.** Un conflitto **senza identificativo
Pretix** è un impegno di sala che il sito non governa: rimuoverlo alla cieca creerebbe una
sovrapposizione vera. È l'unico caso in cui la strada è chiusa, e il pannello dice perché.

**Un orario già passato** non è un esito con una via d'uscita: `checkSlot` lo respinge e il
pannello lo dice e basta. Apertura e chiusura sono una decisione di chi gestisce il cinema;
le 21:00 di ieri no.

**Se il conteggio dei biglietti fallisce**, la sostituzione non si propone affatto. Un
«nessuno resta a piedi» falso, detto proprio a chi sta per cancellare uno spettacolo, è la
bugia peggiore possibile: meglio "riprova". Stessa scelta già fatta in
`planningCheckManualSlot`.

**Avviso indipendente, che vale in tutti i casi:** se lo spettacolo *che stai spostando*
ha biglietti venduti, il pannello lo dice in grande. Chi ha pagato si presenterà
all'orario vecchio, e Pretix non lo avvisa da solo.

### Ordine delle operazioni

Quando la conferma arriva, il server fa in questo ordine:

1. **ricontrolla** la situazione (vedi sotto)
2. **elimina** gli spettacoli da sostituire, uno per uno
3. **sposta** il nostro

Prima l'eliminazione, poi lo spostamento — non il contrario. Se qualcosa si rompe a metà
strada, il peggio che resta è un buco in palinsesto. All'inverso resterebbero due film
sovrapposti, entrambi in vendita sulla stessa sala: un buco si riempie, un doppio
incasso sugli stessi posti no. È anche l'ordine che tiene già `commitRunner`.

### Il server ricontrolla prima di agire

Tra il momento in cui leggi il pannello e quello in cui premi possono passare minuti, e in
quei minuti si vendono biglietti. `planningMoveShow` rifà il controllo con i suoi occhi e
si ferma se la situazione non è più quella che ti era stata mostrata — se è comparso un
conflitto nuovo, o se su ciò che stavi per eliminare qualcuno ha comprato nel frattempo e
tu non avevi acconsentito a quello. Il pannello del client è ciò che ti fa decidere; non è
ciò su cui il server si fida.

## 4. Eliminare

`planningDeleteShow` così com'è, che già fa la cosa giusta: rifiuta se ci sono biglietti
venduti e dice quanti sono. Il pannello mostra quel numero e offre *Elimina lo stesso*
(`force`), spiegando che gli ordini restano orfani e si rimborsano a mano dal pannello
Pretix. L'eliminazione toglie il sub-evento da Pretix, la riga dal database e, se era
l'ultima proiezione di quel film, anche i metadati rimasti orfani.

## 5. Le due azioni nuove

Vivono in `src/actions/planningActions.ts`, accanto alle altre, e restano il guscio sottile
che quel file è: la matematica è di `checkSlot`, qui c'è solo il mondo esterno.

```ts
planningCheckMove(input: {
  seatingPlanId: number;
  pretixId: number;      // lo spettacolo che si muove
  day: string;           // 'YYYY-MM-DD', giorno di programmazione
  time: string;          // 'HH:mm'
  fromDate: string;      // origine dei minuti globali, come altrove
}): Promise<MoveCheck>
```

Legge la sala con `readRoomOccupancy`, **toglie dagli intervalli occupati lo spettacolo che
si sta muovendo** — senza, ogni spostamento di dieci minuti confliggerebbe con sé stesso —
e chiama `checkSlot` con la **durata vera di quello spettacolo**, quella che
`runtimeOfSubEvent` ha già ricavato dal commento JSON, dagli override o dalla distanza fra
`date_from` e `date_to`. Nessuna chiamata a TMDB: il film è già in sala, la sua durata è un
dato che abbiamo.

`MoveCheck` ricalca `ManualSlotCheck`, che la UI sa già leggere, più un campo:

```ts
{ usable, slot, conflicts: SlotConflict[], soldTickets,
  outsideHours, warning, message,
  movingShowSoldTickets: number }   // i biglietti venduti su ciò che si muove
```

```ts
planningMoveShow(input: {
  seatingPlanId: number;
  pretixId: number;
  day: string;
  time: string;
  fromDate: string;
  replaces?: number[];       // gli spettacoli da eliminare per fare spazio
  force?: boolean;           // eliminarli anche con biglietti venduti
  allowOutsideHours?: boolean;
}): Promise<{ moved: boolean; deleted: number[]; error?: string }>
```

Ricontrolla, elimina, sposta — nell'ordine di §3 — e delega lo spostamento vero a
`adminUpdateEventDate`, che sa già aggiornare Pretix *e* la riga `PretixSync` locale, così
la home riflette la modifica senza aspettare un sync.

### Un campo in più su `ExistingShow`

`readRoomOccupancy` calcola già `tmdbId` e poi lo butta via all'uscita di
`planningGetPeriodOccupancy`. Lo si conserva, e con esso arriva il poster: la query su
`CatalogFilm` che oggi legge i generi del periodo legge anche `tmdbId` e `posterPath`, e
li appoggia sulle proiezioni. Nessuna chiamata di rete in più — la query c'è già.

```ts
interface ExistingShow {
  …
  tmdbId: string | null;
  posterPath: string | null;   // dal catalogo, quando il film c'è
}
```

## 6. I file

| File | Cosa |
|---|---|
| `src/services/scheduling/move.ts` *(nuovo)* | `planMove`: puro. Giorno + orario → minuto globale, esclusione dello spettacolo che si muove, verdetto via `checkSlot` |
| `src/actions/planningActions.ts` | `planningCheckMove`, `planningMoveShow`, `MoveCheck`; `tmdbId` e `posterPath` su `ExistingShow` |
| `src/app/admin/programmazione/Palinsesto.tsx` *(nuovo)* | la vista: griglia, card, trascinamento, orario a mano |
| `src/app/admin/programmazione/MovePanel.tsx` *(nuovo)* | il pannello di conferma: i quattro esiti, la spunta consapevole, l'eliminazione |
| `src/app/admin/programmazione/page.tsx` | il terzo modo e il ramo che nasconde passi e footer |
| `src/app/admin/programmazione/Programmazione.module.css` | card del palinsesto, pannello, stati di trascinamento |
| `src/app/admin/programmazione/types.ts` | `PlanningMode` accoglie `'palinsesto'` |

Due componenti e non uno: la griglia e il pannello di conferma hanno due mestieri diversi
— uno disegna la settimana, l'altro conduce una decisione irreversibile — e tenerli
separati è ciò che permette di leggere il secondo senza scorrere il primo.

## 7. I test

Le due azioni nuove sono I/O e si verificano in sala (§8). Ciò che invece va isolato e
testato è il calcolo, e per questo vive in un modulo suo — `services/scheduling/move.ts`,
puro come tutto quello che gli sta accanto:

- **`move.test.ts`** — spostare di dieci minuti non deve confliggere **con sé stessi**
  (senza escludere lo spettacolo che si muove, ogni spostamento risulterebbe occupato);
  le `00:30` scritte nella colonna di sabato appartengono alla *nottata di sabato*, cioè
  alla data di calendario successiva ma alla stessa serata — è la regola di `commitTime`
  in `StepCalendar`, e l'unico punto dove un errore di un giorno intero passa inosservato;
  le `03:00` invece non sono la nottata, sono la mattina, e lì la risposta giusta è che il
  cinema apre alle 10:00.

## 8. Come si verifica che funziona

Da fare a mano, in questo ordine, su una sala di prova:

1. il palinsesto mostra la settimana con le proiezioni al posto giusto, poster inclusi
2. trascinare uno spettacolo su un giorno vuoto → pannello "libero" → sposta → la card è
   nel giorno nuovo, e ricaricando ci resta
3. riscrivere l'orario alle `00:30` → finisce nella serata del giorno prima
4. trascinare uno spettacolo sopra un altro **senza venduti** → il pannello offre la
   sostituzione senza spunta → conferma → il vecchio sparisce, il nuovo prende il posto
5. stessa cosa **con venduti** → il bottone è spento finché non si spunta la riga
6. eliminare uno spettacolo con biglietti venduti → rifiuta, dice quanti → *Elimina lo
   stesso* → sparisce
7. la home riflette spostamenti ed eliminazioni senza aspettare un sync
