# Il gestionale diventa una cabina

**Data:** 2026-09-24
**Stato:** approvato da Giovanni (conversazione del 24 settembre 2026)
**Fa parte di:** restyling completo del sito, in quattro progetti:
1. fondamenta visive
2. **gestionale** (questa specifica, che comprende anche le fondamenta)
3. sito pubblico
4. display e biglietti

## Obiettivo

Il gestionale funziona, ma è scomodo. Oggi:

- **non ha un indirizzo suo.** Ci si entra dal link "Admin" nel footer del sito pubblico, e si apre come overlay sopra la home (`Footer.tsx` → `AdminOverlay` → `AdminPanel.tsx`, 795 righe);
- **ogni funzione vive in un posto diverso e con uno stile diverso.** Alcune sono pagine separate (programmazione, movies-control, cassa), altre finestre dentro l'overlay (sale, display, catalogo, recupero biglietti, pulizia proiezioni);
- **molte cose esistono due volte:** accesso, vista della programmazione, catalogo, ricerca TMDB, biglietto termico;
- **la programmazione è una procedura con tre modi** (dal periodo, dal film, palinsesto) in un file da 1.304 righe. Ogni volta bisogna decidere "da dove parto";
- **la X "Torna all'admin" della programmazione punta a `/admin`**, che non esiste;
- **ci sono 72 `alert()` / `confirm()` nativi** fra admin e cassa.

Questa specifica rifà il gestionale da capo: una sola casa `/admin`, un'identità visiva sola, otto stanze e una programmazione che parte sempre dalla settimana. **Nessuna funzione esistente va persa.** Le azioni sul server restano quelle di oggi. Cambiano l'interfaccia, l'ordine e i doppioni.

## Le scelte di Giovanni

Prese con i mockup, che si trovano in `.superpowers/brainstorm/`:

| Domanda | Scelta |
|---|---|
| Identità | **A · Cabina**: nero caldo, grana di pellicola, ambra come la lampada del proiettore. Orari in carattere a macchina, titoli in serif morbido |
| Navigazione | **B · Barra in alto con linguette + ricerca rapida ⌘K**. Sul telefono, barra in basso |
| Programmazione | **A · Tavolo di montaggio**: Programma e Palinsesto diventano una stanza sola |
| Mappa delle stanze | approvata così com'è, qui sotto |

## 1. Le fondamenta: l'identità Cabina

### Colori e caratteri

I colori vivono come variabili CSS **dentro `.cabina`**, la classe del layout admin. Così il sito pubblico non cambia finché non tocca a lui (progetto 3).

| Variabile | Valore | Uso |
|---|---|---|
| `--c-bg` | `#100d0a` | fondo |
| `--c-bg-raised` | `#17130f` | barre, cassetti, superfici sollevate |
| `--c-line` | `#2a231c` | righe e bordi |
| `--c-ink` | `#efe6d8` | testo |
| `--c-dim` | `#8a7d6c` | testo secondario, etichette |
| `--c-amber` | `#e8a33d` | accento: orari, azioni, "adesso", bozza |
| `--c-alarm` | `#d4553a` | errori, azioni che non si annullano |
| `--c-ok` | `#9bb07a` (verde salvia, spento come il resto) | venduto, confermato |

- **Caratteri**, caricati con `next/font`: Fraunces per i titoli, JetBrains Mono per orari, numeri ed etichette maiuscole spaziate, Inter per il testo.
- **Grana**: un rumore SVG sopra tutto, con opacità intorno a 0,09, che non blocca i clic.
- **Movimento**: corto e funzionale, fra 150 e 250 ms. Niente animazioni decorative. Va rispettato `prefers-reduced-motion`.

### I pezzi comuni: `src/components/cabina/`

Sono i mattoni di ogni stanza. Una stanza non definisce stili propri per le cose che esistono già qui.

- `Button`, con le varianti piena, contorno, fantasma e allarme
- `Tabs`
- `Drawer`, il cassetto laterale
- `Dialog`, per le conferme
- `Field`, `Select`, `NumberField`
- `Toast`, gli avvisi
- `Badge` / `Pill`
- `Empty`, per lo stato vuoto
- `Skeleton`, per il caricamento
- `CommandPalette`, cioè ⌘K

**Addio agli `alert()` e ai `confirm()`.**
- Gli esiti diventano `Toast`.
- Le conferme diventano `Dialog`, e solo per le azioni che non si possono annullare: eliminare da Pretix, svuotare la bozza, eliminare un override.
- Un'azione annullabile non chiede conferma.

## 2. La casa `/admin`

### Struttura

- **`src/app/admin/layout.tsx`** è il guscio di tutte le stanze. Contiene:
  - la barra in alto con il nome, le linguette delle stanze e il campo ⌘K;
  - sul telefono, sotto i 768 px, una barra in basso con Oggi, Programma, Cassa, Film e "Altro";
  - il contenitore degli avvisi.
- **`/admin/login`** resta l'unico ingresso, nello stile Cabina.
  - Il link "Admin" del footer pubblico porta a `/admin`, e il proxy rimanda al login quando serve.
  - La modale di accesso nel footer sparisce, e con lei `AdminOverlay`.
- **La Cassa tiene il suo schermo pieno.** È la schermata che si usa al banco, quindi la barra del guscio si riduce a una striscia sottile con il ritorno alle altre stanze. Oggi il footer pubblico si nasconde già su `/admin/cassa`, e resta così.

### Le stanze, e dove va a finire ogni funzione di oggi

| Indirizzo | Stanza | Cosa contiene (tutto quello che esiste oggi) |
|---|---|---|
| `/admin` | **Oggi** | film in sala adesso con avanzamento; prossimi spettacoli con posti liberi/venduti; tre numeri (spettacoli oggi, venduti oggi, spettacoli della settimana); "Da guardare" (avvisi); scorciatoie "Apri cassa" e "+ Programma" |
| `/admin/programma` | **Programma** (tavolo) | wizard dal periodo, wizard dal film, palinsesto (vedi, sposta, scambia, replica, elimina), lista "Programmazione attuale (Pretix)" con disponibilità e quote, pulizia proiezioni vuote, link a Pretix |
| `/admin/film` | **Film** | tutto `movies-control`: override di titolo, trama, locandina, backdrop e logo scelti da TMDB, trailer, lingua, sottotitoli, tutto esaurito, premi MUBI (singolo e tutti), "estetica rapida", sync tutto esaurito da Pretix, popolamento totale, elimina override, ricarica da TMDB |
| `/admin/catalogo` | **Catalogo** | `CatalogBrowser`: ricerca, filtri, corsie, anteprima, verifica, correggi ID TMDB, aggiungi per ID TMDB, elimina, sync Plex |
| `/admin/cassa` | **Cassa** | tutto `CassaInterface`: giorno e navigazione, spettacoli, mappa posti, vendita, alternative, stampa termica, ultime vendite e ristampa, test di stampa, pulizia PDF. In più **Recupero biglietti** (per data, stampa a lotti), che oggi è un bottone nell'overlay |
| `/admin/sale` | **Sale** | `RoomManagementModal`: piante dei posti, crea pianta, dettaglio, preferita, nascondi (anche in blocco), metadati sala. In più **sala predefinita**, che oggi sta nella barra dell'overlay e in `localStorage` |
| `/admin/display` | **Display** | durata del preroll (minuti:secondi), anteprima di cosa mostrerebbe adesso lo schermo (`getDisplayData`), "Lancia display" → `/display-esterno?preroll=…` |
| `/admin/attrezzi` | **Attrezzi** | svuota cache, risincronizza Pretix (`adminSyncMirror`, `adminSyncNewlyCreatedEvents`), ricarica tutti i premi, sincronizza tutti i film, esci |

La barra in alto mostra le prime sette stanze. **Attrezzi** sta in fondo al menu "Altro" e in ⌘K.

**Cosa sono gli avvisi di "Da guardare".** Si calcolano dai dati che esistono già, e l'elenco si chiude qui:
- spettacoli futuri con i posti non ancora letti da Pretix (`availableSeats` nullo);
- proiezioni vuote vicine all'orario (`adminGetEmptyProjections`);
- film in programmazione senza lingua o senza trailer;
- buchi nella settimana corrente, calcolati con `planningGetPeriodOccupancy`;
- un lavoro di conferma rimasto aperto (`planningFindOpenCommit`), con il bottone "riprendi".

### ⌘K

Si apre con ⌘K, oppure Ctrl+K, oppure toccando il campo nella barra. Cerca in quattro cose:
- **stanze**: "cassa", "sale";
- **film in programmazione e in catalogo**: aprire il film porta alla sua scheda in Film;
- **spettacoli**: "Duel ven": si apre il tavolo su quel giorno con il blocco selezionato;
- **azioni**: "svuota cache", "riempi i buchi", "lancia display".

L'indice si costruisce sul client da dati già caricati o da una sola lettura leggera. Non si aggiunge nessun servizio di ricerca.

### Gli indirizzi vecchi restano vivi

| Vecchio | Nuovo |
|---|---|
| `/admin/programmazione` | `/admin/programma` |
| `/admin/planner` | `/admin/programma` (oggi punta a `/admin/programmazione`) |
| `/admin/movies-control` | `/admin/film` |

Le query string passano intatte, perché "replica questo film" usa parametri. Il modo esatto di fare i reindirizzamenti (pagina con `redirect()` o `redirects` in `next.config.ts`) si sceglie in implementazione, **dopo aver letto la guida in `node_modules/next/dist/docs/`**, come chiede `AGENTS.md`.

## 3. Programma: il tavolo di montaggio

### Cosa si vede

- **In alto**:
  - sala (con la predefinita già scelta);
  - periodo, con frecce ‹ › e il selettore Giorno / Settimana / 2 settimane / Mese (i giorni vanno da 1 a 30, come oggi);
  - il bottone **✦ Riempi i buchi**.
- **Al centro, la timeline.**
  - Una riga per giorno, con una scala oraria dall'apertura alla chiusura della sala.
  - Ogni spettacolo è un blocco largo quanto la sua durata, con orario (mono, ambra) e titolo (serif).
  - Quando la timeline non entra nello schermo si scorre in verticale.
- **Tre tipi di blocco:**
  - **pieno**: già in sala, su Pretix;
  - **tratteggiato ambra**: in bozza;
  - **righe diagonali tenui**: buco libero in cui ci sta almeno un film.
- **A destra, il cassetto Catalogo.** È lo stesso componente della stanza Catalogo, in formato stretto. Ha la ricerca, le corsie ("Stanno nel buco", "Premiati", "Novità Plex", "Sorpresa", più le corsie che `catalogGetRails` dà già) e le schede film trascinabili.
- **In basso, la barra della bozza.** Mostra quanti spettacoli sono in bozza, l'ora dell'ultimo salvataggio, i conflitti, e i bottoni **Annulla bozza** e **Manda in sala →**.

### Cosa si fa, e con quale azione che esiste già

| Gesto | Effetto | Azione sul server |
|---|---|---|
| Trascini un film su un giorno | il motore propone l'orario elegante più vicino al punto di rilascio. Se non ci sta, lo dice e indica il buco più vicino | `planningCheckManualSlot`, `planningSnapShow` |
| Selezioni un film nel cassetto | sulla timeline si accendono tutti i posti dove ci sta. Un clic su uno lo mette in bozza (il vecchio modo "Dal film") | `planningFindSlots`, `planningGetFilmInfo` |
| ✦ Riempi i buchi | scegli i film (o "consigliati") e l'intensità, e il motore li distribuisce nel periodo come bozza (il vecchio modo "Dal periodo") | `planningGenerate`, `planningAutoPlan`, `planningAlternatives` |
| Clic su un blocco in bozza | pannello: cambia orario, blocca, alternative, togli | come oggi in `StepCalendar` |
| Clic su un blocco in sala | pannello: disponibilità e quote, sposta, scambia, replica, elimina | `planningCheckMove`, `planningMoveShow`, lo scambio di `SwapPanel`, `planningDeleteShow`, `adminGetQuotaAvailability` |
| Trascini un blocco in sala | spostamento, con gli stessi avvisi di oggi (biglietti venduti, conflitti) | `planningCheckMove`, `planningMoveShow` |
| Pulizia | filtro "solo proiezioni vuote", poi elimina con conferma | `adminGetEmptyProjections`, `adminDeleteEvent` |
| Manda in sala | conferma a lotti che riprende da dove era rimasta. Barra di avanzamento, errori riga per riga, "riprova" | `planningCommitStart` / `Tick` / `Status` / `Retry` |

- **La bozza** si salva da sola a ogni modifica (`planningSaveDraft`) e si ricarica all'apertura (`planningLoadDraft`). "Annulla bozza" chiama `planningDropDraft`, dopo conferma.
- **Le regole del motore non cambiano:** apertura, chiusura, pause, orari eleganti, specifiche di proiezione, lingua dei trailer, override locali. Il tavolo è un'interfaccia nuova sugli stessi servizi (`services/scheduling`, `planningActions`).
- **Sul telefono** la timeline mostra un giorno alla volta, scorrendo in orizzontale fra i giorni. Il catalogo diventa un foglio che sale dal basso. Al posto del trascinamento si tocca: prima il film, poi il posto.

### Come si divide il codice

`src/app/admin/programmazione/page.tsx` e i suoi passi vengono sostituiti da file piccoli, ognuno con un compito solo:

- `programma/page.tsx`: carica sala, periodo e bozza, e monta il tavolo
- `programma/Timeline.tsx`: disegna le righe e i blocchi, e gestisce trascinamento e selezione
- `programma/timelineGeometry.ts`: pura e testata. Converte orario e durata in posizione, e posizione in orario proposto
- `programma/useDraft.ts`: stato della bozza, salvataggio automatico, conflitti
- `programma/BlockPanel.tsx`: pannello del blocco, per bozza e per spettacolo in sala
- `programma/FillDialog.tsx`: "Riempi i buchi"
- `programma/CommitBar.tsx`: barra della bozza e avanzamento della conferma

Si riusano, restilizzati, i pezzi che funzionano: la logica di `MovePanel`, `SwapPanel` e `Pager` e il tipo in `types.ts`.

## 4. Doppioni che spariscono

| Doppione | Resta | Se ne va |
|---|---|---|
| Accesso | `/admin/login` | la modale in `Footer.tsx` |
| Vista della programmazione | il tavolo | la lista in `AdminPanel`, `Palinsesto.tsx`, `EventList` se non serve più altrove |
| Catalogo | un solo componente (stanza + cassetto) | la finestra dell'overlay e `StepCatalog` |
| Ricerca TMDB | una sola `TmdbSearch` in `components/cabina/` o `components/admin/` | `Admin/TMDBSearch.tsx` e `programmazione/TmdbSearchModal.tsx` |
| Biglietto termico | uno solo | uno dei due `ThermalTicket.tsx` (`components/` e `components/Cassa/`). Prima di togliere si verifica quale usano cassa, recupero biglietti e `/api/print` |
| Pannello admin | le stanze | `AdminOverlay`, `AdminPanel` e i loro CSS |

Un file si elimina solo dopo che una ricerca nel codice conferma che nessuno lo importa più.

## 5. Tappe di lavoro

Alla fine di ogni tappa il gestionale funziona per intero. Le parti non ancora rifatte restano quelle di oggi, raggiungibili dal guscio nuovo.

1. **Fondamenta e casa:**
   - variabili Cabina, caratteri, grana e pezzi comuni;
   - `admin/layout.tsx` con barra e ⌘K (all'inizio solo stanze e azioni);
   - login restilizzato, link del footer verso `/admin`, reindirizzamenti.
   - Finché le stanze non esistono, le loro linguette portano alle pagine vecchie.
2. **Oggi.**
3. **Programma**, il tavolo.
4. **Film** e **Catalogo**, compresa la ricerca TMDB unica.
5. **Cassa**, compreso il recupero biglietti e il biglietto termico unico.
6. **Sale**, **Display** e **Attrezzi**.
7. **Pulizia:**
   - via overlay, `AdminPanel`, i passi del vecchio wizard e i doppioni;
   - via gli `alert` / `confirm` rimasti;
   - ⌘K completo di film e spettacoli.

## 6. Verifica

- **Test automatici (vitest)** per la logica pura:
  - `timelineGeometry`;
  - la mappa dei reindirizzamenti, con le query string preservate;
  - l'indice e il punteggio di ⌘K;
  - il calcolo degli avvisi di "Oggi".
  - I test esistenti (`services/scheduling`, catalogo, storyBuilder) devono restare verdi.
- **Controllo dei tipi** (`tsc --noEmit`) a ogni tappa.
- **Non si lancia `next build` mentre il dev server di Giovanni è acceso**, perché lo lascerebbe a servire moduli vecchi.
- **Prova nel browser: la fa Giovanni.** Claude non avvia il dev server. A ogni tappa consegna l'elenco di cosa provare: stanze, gesti e casi limite come un biglietto già venduto su uno spettacolo da spostare.
- **Nessuna scrittura sui dati come effetto collaterale:**
  - niente film aggiunti al catalogo;
  - niente spettacoli creati su Pretix durante lo sviluppo, se non su richiesta esplicita.

## Fuori da questa specifica

- **Il sito pubblico** (home, pagina film, prenotazione, conferma), **il display esterno** e **i biglietti termico e PDF**: hanno i loro progetti, dopo questo. Si cambia solo il link "Admin" del footer.
- **Il cookie di sessione admin**, che oggi è una stringa fissa nel codice (`src/proxy.ts`). Va sistemato, ma in un lavoro a parte.
- **Ogni modifica al motore di programmazione e alle azioni sul server**, salvo piccoli aggiustamenti che servono all'interfaccia nuova. Vanno segnalati nel piano.
