# Il sito pubblico entra in cabina

**Data:** 2026-09-25
**Stato:** approvato da Giovanni il 25 settembre 2026, da realizzare.
**Fa parte di:** restyling completo del sito, in quattro progetti:
1. fondamenta visive (fatto, con il gestionale)
2. gestionale (fatto: `2026-09-24-gestionale-cabina-design.md`)
3. **sito pubblico** (questa specifica)
4. display e biglietti

## Obiettivo

Il gestionale veste già l'identità **Cabina**. Il sito pubblico invece è ancora viola e rosa, con Playfair per i titoli. Questa specifica lo porta in cabina: home, prenotazione e conferma.

**La struttura della home resta quella di oggi.** Resta l'hero che scorre fra i film, con sotto il racconto a capitoli, e la prenotazione si apre sopra la home. Cambiano la veste e, in alcuni punti precisi, la disposizione:
- gli orari dell'hero diventano una tabella;
- la prenotazione occupa tutto lo schermo;
- la conferma mostra il biglietto.

**Nessuna funzione esistente va persa**, tranne la pagina del film, che oggi nessun link raggiunge. Si toglie per scelta, e il suo indirizzo resta vivo.

## Le scelte di Giovanni

Prese con i mockup, che si trovano in `.superpowers/brainstorm/` (sessioni `89109-…`, `90707-…`, `5004-…`):

| Domanda | Scelta |
|---|---|
| Che cosa fa la home per prima cosa | **A · Sala buia**: resta l'hero che scorre fra i film, e sotto il racconto. Il "foglio di sala" e il "programma stampato" sono scartati |
| Come l'hero presenta il film | **A2 · Tabellone**, ma **con il logo del film** al posto del titolo. Quando il logo manca, il titolo in Fraunces |
| Capitoli del racconto | **tutti**. Le strisce e il muro di loghi **tengono i loghi**. Il "nastro di locandine" era descritto male nel mockup: è il muro di locandine in prospettiva (`DriftWall`), e il 25 settembre Giovanni ha deciso di tenerlo |
| Pagina del film | **si toglie** |
| Prenotazione | **B2 · La sala a tutto schermo** |
| Conferma | **C2 · Il biglietto è la pagina** |
| Barra in alto | **niente barra**, come oggi: l'hero parte dal bordo in alto |

## 1. Le fondamenta

### L'identità Cabina esce da `/admin`, ma non ovunque

- **Le pagine pubbliche**, cioè la home e `/success`, si avvolgono nella classe `.cabina`, come le stanze del gestionale. Le variabili, la grana e i caratteri sono gli stessi di `src/components/cabina/cabina.css`: nessun colore nuovo.
- **Il display esterno e il PDF del biglietto non cambiano:** sono del progetto 4. Per questo `.cabina` **non** va su `<body>` in `src/app/layout.tsx`.
- **Il viola e il rosa di `globals.css`** (`--primary`, `--accent` e compagni) restano dove sono, perché li usano ancora il display e il PDF. Il sito pubblico smette di usarli. Si tolgono nel progetto 4.
- **La grana è unica.** `.cabina::after` è `position: fixed` e copre già tutto: non si aggiungono altre grane.

### I caratteri

- **Fraunces e JetBrains Mono** oggi si caricano in `src/app/admin/layout.tsx`. Vanno spostati in `src/app/layout.tsx`, così valgono per tutto il sito. Il gestionale non deve accorgersene: le variabili `--font-cab-serif` e `--font-cab-mono` restano con lo stesso nome.
- **Playfair Display** resta caricato finché lo usano il display e il PDF.
- Prima di spostare i font va letta la guida di `next/font` in `node_modules/next/dist/docs/`, come chiede `AGENTS.md`. Va letto anche il commento in `layout.tsx` sui font nel chunk condiviso.

### Il footer

`Footer.tsx` in veste Cabina: fondo `--c-bg`, riga `--c-line`, etichette in mono. Sul contenuto non cambia niente, e il link "Admin" continua a portare a `/admin`.

## 2. La home

### L'hero

Il componente resta `MovieShowcase`, che oggi è lungo 563 righe. Si divide in tre pezzi con un compito ciascuno:

- `MovieShowcase.tsx`: tiene lo stato (film attivo, scorrimento automatico, cassetto della prenotazione) e compone i pezzi;
- `ShowcaseHero.tsx`: fondale, logo o titolo, dati, trama, premi, trailer;
- `ShowtimeTable.tsx`: la tabella degli orari;
- `FilmStrip.tsx`: la striscia di locandine.

**Cosa si vede, dall'alto in basso:**
- **il fondale del film**, con la sfumatura verso il nero caldo a sinistra e in basso;
- **il premio principale**, come etichetta mono ambra ("● Palma d'oro · Cannes 2024"), quando c'è. La colonna dei premi di oggi (`MovieAwards`) si riveste, ma non scompare;
- **il logo del film** da TMDB, come oggi. Quando il logo manca, oppure vale `'none'`, compare il titolo in Fraunces, grande;
- **la riga dei dati** in mono maiuscolo spaziato: regia, anno, durata, lingua e sottotitoli, divieto;
- **la trama**, con "più ↓" come oggi, e il cast;
- **la tabella degli orari**, una riga per giorno:
  - a sinistra il giorno (`dayLabel`: "Oggi", "Ven 26"), a destra gli orari di quel giorno in mono ambra;
  - il prossimo spettacolo acquistabile è acceso, con fondo ambra e testo scuro;
  - gli esauriti sono barrati e spenti, e non si cliccano;
  - i bollini di proiezione che valgono solo per una replica (`specs` dello spettacolo, meno quelli comuni) stanno in piccolo accanto all'orario, come oggi;
  - un clic su un orario apre la prenotazione su quello spettacolo;
- **i bottoni:** "Prenota 21:15 →", pieno ambra, che apre il prossimo spettacolo acquistabile, e "▶ Trailer", fantasma. Se il film è tutto esaurito, il primo bottone diventa l'etichetta "Esaurito";
- **la striscia di locandine**, in fondo all'hero. Le locandine sono piccole, quella attiva è più grande e ha il bordo ambra, e a destra c'è "1 / 7 in sala". Un clic cambia il film attivo. **Sostituisce il carosello "In Programmazione"**, che si toglie.

**Sul telefono** la sfumatura del fondale va dal basso, l'hero occupa lo schermo e la tabella degli orari mostra i primi tre giorni, più "tutti gli orari ↓", che porta al calendario.

**Il movimento.** Il passaggio fra un film e l'altro resta una dissolvenza corta, fra 150 e 250 ms, con `prefers-reduced-motion` rispettato. Lo scorrimento automatico resta com'è oggi.

### Aprire la home su un film

La home accetta `?film=<tmdbId>`. Se quel film è in programmazione, l'hero parte da lui. Se non lo è, il parametro si ignora. Serve al reindirizzamento della vecchia pagina del film (sezione 5).

### Il racconto

`CinematicStory` e `storyBuilder` restano, con una modifica alla sequenza: **il calendario (`calendar`) sale al secondo posto**, subito dopo l'apertura (le prossime serate, oppure la citazione quando le serate sono meno di due). Tutti gli altri capitoli restano, compreso il muro di locandine in prospettiva (`marquee`, cioè `DriftWall`).

La sequenza nuova:
1. le prossime serate, oppure la citazione d'apertura;
2. il calendario della settimana;
3. strisce di fondali (prima serie);
4. i numeri;
5. il muro di loghi;
6. questo weekend;
7. le dissolvenze;
8. dai festival alla nostra sala;
9. strisce di fondali (seconda serie);
10. il muro di locandine in prospettiva;
11. la citazione di chiusura.

Restano anche i due pezzi che non sono capitoli di `storyBuilder`:
- **gli stacchi** fra un capitolo e l'altro: un titolo del cartellone scritto in grande, con un effetto diverso ogni volta (`TitleInterstitial`);
- **il tabellone split-flap** degli spettacoli di oggi, in fondo alla pagina (`TodayBoardChapter`).

**La veste di ogni capitolo:**
- **i titoli** in Fraunces, e le citazioni in Fraunces corsivo;
- **orari, numeri ed etichette** in JetBrains Mono. Gli orari sono ambra;
- **i loghi restano loghi** nelle strisce e nel muro di loghi;
- **i contatori** dei numeri in mono ambra;
- **i giorni** del calendario e del weekend usano le stesse linguette e le stesse righe della tabella dell'hero;
- **i festival**: il nome del festival come etichetta ambra, poi locandina, titolo e premio;
- **il muro di locandine** su fondo nero caldo;
- **gli stacchi** in Fraunces, oppure nell'effetto del giorno, con l'accento in ambra;
- **il tabellone**: palette nero caldo con lettere color inchiostro. Mentre girano, le palette passano per ambra, rosso allarme, salvia e inchiostro invece che per l'arcobaleno di oggi;
- **i bollini di lingua e di proiezione** (`LanguageBadge`, `ProjectionSpecs`), che il sito pubblico usa nel calendario e nella prenotazione, in mono: la lingua in ambra, le specifiche e i sottotitoli a contorno. `RatingBadge` tiene i suoi colori, perché li usano anche cassa, display e biglietto.

L'accento colorato che `StoryMood` calcola dal genere va sostituito dall'ambra: in Cabina l'accento è uno solo.

`StoryMood` e `buildMood` non hanno altri usi: si tolgono, insieme ai loro test. I test di `storyBuilder.test.ts` si aggiornano per la sequenza nuova. Il resto della logica (quali film entrano, rotazione col seed, capitoli vuoti omessi) non cambia.

## 3. La prenotazione: la sala a tutto schermo

Il contenitore resta `BookingDrawer`, uno per `MovieShowcase` e uno per `WeeklyCinemaCalendar`, come oggi. Non è più un cassetto: **copre tutta la pagina**, su ogni schermo.

`BookingFlow` (609 righe) si divide:
- `BookingFlow.tsx`: tiene lo stato (spettacoli, spettacolo scelto, posti, avvisi, checkout) e compone;
- `BookingRoom.tsx`: la sala, cioè schermo, mappa dei posti (`SeatMap`) e legenda;
- `BookingTicket.tsx`: la colonna.

**La sala, a sinistra:**
- in alto lo schermo è un arco ambra che fa luce verso il basso, con la scritta "schermo";
- i posti sono piccole poltrone. Quelli liberi hanno il contorno, quelli scelti sono pieni ambra, quelli occupati spenti;
- sotto c'è la legenda: libero, scelto, occupato.

La logica di `SeatMap` non cambia: lettura della pianta, stati dei posti, messaggi quando la pianta non si legge. Cambia solo la veste.

**La colonna, a destra:**
- in alto "‹ torna" e ✕, e anche Esc chiude;
- il logo del film, oppure il titolo in Fraunces; sala, lingua e sottotitoli;
- **Quando**: data e ora in mono ambra, con "cambia orario". Un clic apre dentro la colonna l'elenco degli altri spettacoli **di quel film**. Oggi, aprendo dalla home, l'orario non si può cambiare: il bottone esiste solo quando la prenotazione parte senza spettacolo. Gli spettacoli del film li passa al cassetto chi lo apre, cioè l'hero o il calendario, che li hanno già;
- **Posti**: i codici dei posti scelti, in mono;
- **Costo**: "Gratuito", come oggi;
- il bottone "Prenota N posti →", spento finché non c'è almeno un posto, con il suggerimento "Seleziona almeno un posto" come oggi;
- in piccolo, "La vendita chiude 2 minuti prima dell'inizio".

**Sul telefono** la sala occupa lo schermo. In alto c'è una riga con ‹, l'orario in ambra (che si tocca per cambiarlo) e ✕. In basso c'è una barra con i posti scelti e "Prenota →".

**Gli stati che esistono già**, cioè caricamento, orari non disponibili, posti esauriti e avviso sui posti, si rivestono dentro la colonna, con le stesse parole di oggi.

**La verifica dell'età.** `AgeVerificationModal` si riveste come `Dialog` di Cabina:
- l'etichetta in rosso allarme "Vietato ai minori di 18 anni" e il titolo "Hai compiuto 18 anni?";
- i bottoni "Annulla" e "Sì, confermo";
- il comportamento resta com'è: "Annulla" torna alla home.

Serve solo la conferma sì/no della maggiore età, e compare per gli spettacoli 18+ o VM18: vale la regola di oggi, `isVM18` in `utils/ratingUtils.ts`, che riconosce VM18, 18+ e 18. Sotto il titolo c'è una sola frase: "Per prenotare questo film serve la maggiore età." La frase del mockup sul documento all'ingresso **non entra**.

**La conferma avviene nella colonna, non su Pretix.** La specifica diceva "Pretix e ritorno su `/success`", ma non è così: dopo "Prenota N posti →" la colonna chiede l'email oppure "Continua senza email" (`CheckoutButton`), la prenotazione si chiude sul server (`finalizeBooking`) e il cassetto mostra il biglietto. `/success` si apre solo dal link "Vedi riepilogo dettagliato". In questa tappa:
- la richiesta dell'email si veste da Cabina, nella colonna, con la sala ancora visibile e i posti bloccati;
- si aggiunge "‹ Cambia posti", che oggi manca: una volta partita la conferma non si poteva tornare indietro;
- la logica della conferma non cambia.

Il biglietto mostrato dopo la conferma è della tappa 5 (sezione 4).

**Una piccola aggiunta sul server:** `getTrustedSubeventMetadata` restituisce anche il logo del film (`customLogoPath`), che serve alla colonna.

## 4. La conferma: il biglietto è la pagina

La conferma si vede in due posti: **nel cassetto, subito dopo "Conferma"**, ed è il momento vero, e **su `/success`**, il riepilogo che si apre dal link. Tutti e due usano lo stesso componente nuovo, `TicketCard`, così il biglietto è disegnato in un posto solo. Nel cassetto la sala sparisce e resta il biglietto.

`/success` si avvolge in `.cabina`, con il fondale del film sfumato.

**Cosa si vede:**
- in alto, in verde salvia, "✓ Prenotato · ordine" e il codice in mono ambra, poi il titolo "Ci vediamo in sala." in Fraunces;
- **il biglietto**, disegnato in HTML e non preso dal PDF:
  - a sinistra logo o titolo, Quando, Posto e Sala in mono, lingua e durata;
  - a destra, dopo la linea tratteggiata e le mezzelune dello strappo, il **QR** (lo stesso segreto di oggi, `ticket.secret`);
  - se i posti sono più di uno, "1 / 2 ›" sfoglia i biglietti;
- i bottoni **Scarica PDF** (pieno) e **‹ Home**;
- la nota, che segue `isAnonymous` come oggi:
  - anonimo: "Niente email: scarica il biglietto adesso.";
  - con email: "Ti arriva anche una copia via email.";
  - sempre: "All'ingresso mostra il QR."

**Cosa sparisce:** il bottone "Visualizza anteprima" e la sua finestra, in tutti e due i posti, perché l'anteprima adesso è il biglietto che si vede.

Il PDF si genera come oggi, da `TicketPDF` nascosto fuori schermo. **`TicketPDF` non cambia**: è del progetto 4.

Il QR si disegna con `QRCodeSVG` di `qrcode.react`, la libreria che usa già `TicketPDF`: nessuna dipendenza nuova.

## 5. La pagina del film si toglie

- `/movie/[id]` reindirizza a `/?film=[id]`. Se c'è `?subevent=`, si porta dietro anche quello, e la home apre subito la prenotazione su quello spettacolo, se è ancora in vendita.
- Il reindirizzamento va in `redirects` di `next.config.ts`, accanto a quelli del gestionale (`/admin/programmazione` → `/admin/programma`), temporaneo come quelli. Prima si rilegge la guida in `node_modules/next/dist/docs/` per confermare come passa la query string.
- Si eliminano `src/app/movie/[id]/page.module.css`, `MovieCard`, `MovieGallery` e i loro CSS. Ognuno solo **dopo** che una ricerca nel codice conferma che nessuno lo importa più.

## 6. Tappe di lavoro

Alla fine di ogni tappa il sito funziona per intero. Le parti non ancora rifatte restano quelle di oggi.

1. **Fondamenta:** font nel layout radice, `.cabina` su home e conferma, footer.
2. **Hero:** divisione di `MovieShowcase`, tabella degli orari, striscia al posto del carosello, `?film=`.
3. **Racconto:** capitoli, stacchi e tabellone in veste Cabina, calendario al secondo posto, bollini di lingua e proiezione, test aggiornati.
4. **Prenotazione:** sala a tutto schermo, divisione di `BookingFlow`, `SeatMap` e verifica dell'età rivestite.
5. **Conferma e pulizia:** `TicketCard` nel cassetto e su `/success`, reindirizzamento di `/movie/[id]`, eliminazione dei file che nessuno usa più, ultimi resti di viola e rosa sulle pagine pubbliche.

## 7. Verifica

- **Test automatici (vitest)** per la logica pura:
  - la sequenza del racconto (`storyBuilder`);
  - la scelta del prossimo spettacolo acquistabile, che accende la tabella e il bottone;
  - la lettura di `?film=` e `?subevent=`;
  - la mappa del reindirizzamento, con i parametri conservati.

  I test esistenti devono restare verdi.
- **Controllo dei tipi** (`tsc --noEmit`) a ogni tappa.
- **Non si lancia `next build` mentre il dev server di Giovanni è acceso.**
- **Prova nel browser: la fa Giovanni.** Claude non avvia il dev server, perché avviarlo fa partire il sync verso Pretix sul database vero. A ogni tappa consegna l'elenco di cosa provare:
  - computer e telefono, Safari anche vecchio;
  - un film senza logo;
  - un film vietato ai minori di 18 anni;
  - uno spettacolo esaurito e un film tutto esaurito;
  - un ordine con più posti e uno anonimo;
  - un vecchio link `/movie/…`;
  - `prefers-reduced-motion`.
- **Nessuna scrittura sui dati come effetto collaterale:** niente prenotazioni vere su Pretix e niente film aggiunti al catalogo, se non su richiesta esplicita.

## Fuori da questa specifica

- **Il display esterno, il PDF del biglietto e il biglietto termico:** sono del progetto 4. Nel progetto 4 si tolgono anche il viola, il rosa e Playfair da `globals.css` e dal layout.
- **Il sync in sottofondo della home** (`page.tsx`), che è una promessa lasciata correre. Resta com'è, segnalato come lavoro a parte. Lo stesso vale per il frammento di diagnosi su Anora, che scrive un file in `scratch/`: si può togliere nella tappa 2, perché sta nel file che si tocca, ma senza cambiare altro nel caricamento dei dati.
- **Il titolo della pagina** ("VESTRICINEMA | The Ultimate Cinema Experience") e i metadati: restano come sono, salvo richiesta di Giovanni.
- **Ogni modifica a Pretix, al checkout e alle azioni sul server.**
