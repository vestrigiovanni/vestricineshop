# Il display e i biglietti entrano in cabina

**Data:** 2026-09-26
**Stato:** approvato da Giovanni il 26 settembre 2026, da realizzare.
**Fa parte di:** restyling completo del sito, in quattro progetti:
1. fondamenta visive (fatto)
2. gestionale (fatto: `2026-09-24-gestionale-cabina-design.md`)
3. sito pubblico (fatto: `2026-09-25-sito-pubblico-cabina-design.md`)
4. **display e biglietti** (questa specifica, che chiude il restyling)

## Obiettivo

Restano fuori dalla Cabina tre cose che il pubblico vede e tocca:
- lo schermo all'ingresso (`/display-esterno`);
- il biglietto PDF che si scarica dopo la prenotazione;
- lo scontrino termico della cassa.

Resta anche il foglio di stile generale, `globals.css`, con il viola, il rosa e Playfair che nessuno usa più. Questa specifica li porta in Cabina e chiude il restyling. **Nessuna funzione esistente va persa:** le regole del display (preroll, conto finale, scambio, selettore) e la generazione di PDF e stampe restano quelle di oggi.

## Le scelte di Giovanni

Prese con i mockup, che si trovano in `.superpowers/brainstorm/12731-…/`:

| Domanda | Scelta |
|---|---|
| Il display | **C · Sipario**: fondale a tutto schermo, logo al centro, in basso il conto alla rovescia e "a seguire", la barra sul bordo. Via locandina e cast |
| Gli altri momenti del display | approvati come nel mockup: in attesa, preroll, "Buona visione", conto finale, niente in programma, selettore e preroll |
| Il biglietto PDF | **A · Il ricordo, in Cabina**: stessa struttura di oggi, caratteri e colori Cabina |
| Lo scontrino termico | **A · Lo stesso scontrino, in Cabina**: stesso ordine, JetBrains Mono e Fraunces, filetti pieni e tratteggiati |
| Dominio sul biglietto | `vestricinema.com`, non `.it` |

## 1. Il display: sipario

### Cosa si vede

- **Il palco.** Il fondale del film riempie lo schermo, con una vignettatura verso il nero caldo. Al centro:
  - l'etichetta in mono ambra ("● In sala adesso", oppure "Prossimo spettacolo · 23:40");
  - il **logo** del film, o il titolo in Fraunces quando manca;
  - sotto, "un film di …" in Fraunces corsivo, se c'è la regia.
- **La striscia in basso.** A sinistra il conto alla rovescia: l'etichetta ("Fine tra", "Inizio tra") in mono e il valore in mono ambra. A destra "A seguire", con orario in ambra e titolo in Fraunces. Sul bordo inferiore, la barra d'avanzamento sottile, solo mentre il film è in corso.
- **Il preroll.** Il titolo resta al centro, e sotto compare "Il film inizierà a breve" in mono ambra, che pulsa piano. Nell'ultimo minuto diventa "Buona visione".
- **Il conto finale.** Nell'ultimo minuto prima del preroll lo schermo diventa pieno e scuro, con i secondi enormi in mono ambra, "Inizio fra" sopra e il titolo sotto.
- **Niente in programma.** "Vestri Cinema" in Fraunces sulla grana, con "Prossimamente in sala".
- **Il selettore (S)** è un elenco di orari (mono ambra) e titoli (Fraunces), con lo spettacolo scelto acceso e il bottone "Torna in automatico".
- **La finestra del preroll (P)** è un pannello Cabina con −1 min, +1 min, −10 sec, +10 sec, i campi minuti e secondi, Conferma e Annulla.
- **Il caricamento** è una scritta in mono ("Caricamento display…"). Oggi usa classi Tailwind che il progetto non ha, quindi di fatto non ha stile.

Restano come oggi:
- i comandi da tastiera: F schermo intero, S selettore, Q nasconde "A seguire", P preroll, Esc per tornare indietro;
- il bottone dello schermo intero, che si vede solo col mouse;
- il clic su "A seguire" che scambia i due film, e il doppio clic che apre il selettore;
- il ritorno automatico al film in corso;
- la lettura dei dati ogni 30 secondi e l'orologio ogni secondo;
- il preroll letto da `?preroll=`.

Se ne vanno la locandina, il cast e il `RatingBadge` in alto a destra, come nella scelta C.

### Come si divide il codice

La pagina di oggi (489 righe) tiene insieme stato, calcoli e disegno. Si divide così:
- `src/app/display-esterno/displayState.ts`: **puro e testato**. Dato l'elenco degli spettacoli, l'ora e il preroll, restituisce il film in corso, il prossimo e quello dopo, lo stato del timer (tipo, etichetta, valore, avanzamento) e la durata scritta in parole ("1 ora e 12 minuti"). Le regole sono **copiate da quelle di oggi**, compresi il minuto di "Buona visione" e il minuto di conto finale.
- `page.tsx`: tiene lo stato (dati, orologio, preroll, scambio, selezione, finestre, tasti) e compone i pezzi.
- `DisplayStage.tsx`: il palco, cioè fondale, etichetta, logo o titolo e regia.
- `DisplayFooter.tsx`: la striscia in basso e la barra.
- `DisplayOverlays.tsx`: il conto finale, il selettore e la finestra del preroll.
- `DisplayEsterno.module.css`: riscritto.

La pagina si avvolge in `.cabina`, perché il display è fuori sia dal sito pubblico sia dal gestionale e ha bisogno delle variabili. Il footer pubblico è già nascosto su `/display-esterno`.

## 2. I biglietti

### Il PDF: il ricordo, in Cabina

`TicketPDF` tiene la struttura e le dimensioni di oggi (840×592) e la generazione con `html2canvas` e `jsPDF`. Il ritocco a `TicketPDF`:
- **caratteri:** i dati (sala, fila, posto, data, orari, durata, codice, avvisi) in JetBrains Mono; "un film di …" e la tagline in Fraunces, la tagline in corsivo; il titolo di ripiego in Fraunces. Georgia e il "A FILM BY" in inglese se ne vanno: diventa "Un film di …";
- **colori:** le sfumature del fondale verso il nero caldo, i dati color inchiostro, fila e posto in ambra, le etichette in grigio caldo; una grana leggera sopra il fondale;
- **restano** il logo del cinema (`/assets/logo_cliente.png`), il bollino del divieto, il QR nero su bianco e le perforazioni ai lati.

I font arrivano nel PDF perché l'area nascosta da cui nasce sta dentro una `.cabina` (nel cassetto e su `/success`). Il piano verifica che `html2canvas` li disegni. Se non li disegna, si precaricano prima di generare.

### Lo scontrino termico: lo stesso, in Cabina

`ThermalTicket` tiene l'ordine di oggi: logo o titolo, QR grande con codice, titolo, data, orario inizio → fine, sala, fila e posto grandi, prezzo, piede, avviso VM14 e VM18. Cambiano:
- **caratteri:** i dati in JetBrains Mono al posto del Courier; il titolo sotto il QR e il nome del cinema nel piede in Fraunces;
- **filetti:** pieni fra le sezioni, tratteggiati dentro le sezioni;
- **il piede:** "Vestri Cinema" a sinistra e la data di stampa a destra, al posto di "VESTRICINEMA.IT".

Stampa sempre in bianco e nero, a 57 mm, con la stessa rotta `/api/print/thermal`.

### Il dominio

Il sito è `vestricinema.com`. Diventano `.com`:
- il QR della stampa di prova in `CassaInterface` (`https://vestricinema.com`);
- il piede di `TicketRecovery` (`www.vestricinema.com`).

Le email interne `@vestricinema.it` (cassa, ospiti anonimi) **restano** come sono: sono indirizzi, non il sito.

## 3. Pulizia finale

- **`globals.css`** diventa la base Cabina:
  - `html` e `body` in nero caldo e inchiostro, testo in Inter (`--font-inter`), reset di link, bottoni e titoli;
  - si tolgono le variabili e le classi che nessun file usa più (`--primary`, `--accent`, `--glass-*`, `--font-apple`, `.glass-panel`, `.btn-primary`, `.btn-secondary`, `.btn-download`, `.movie-grid` e le altre). Ognuna si toglie **dopo** una ricerca nel codice;
  - `.pretix-button`, usato dal recupero biglietti in cassa, si riveste in ambra.
- **Playfair** esce da `app/layout.tsx`.
- `MovieAwards` usa `--font-outfit`, un carattere che il sito non carica: diventa JetBrains Mono.
- La variante `line` di `ProjectionSpecs`, senza più utenti, si toglie.

## 4. Tappe di lavoro

1. **Display:** `displayState.ts` con i test, la pagina divisa, il sipario.
2. **Biglietti:** PDF, termico, dominio.
3. **Pulizia:** `globals.css`, Playfair, `MovieAwards`, `ProjectionSpecs`; la specifica racconta com'è andata.

## 5. Verifica

- **vitest** per `displayState`: film in corso con il preroll, prossimo e quello dopo, "Inizio tra", conto finale, preroll, "Buona visione", "Fine tra" con l'avanzamento, nessuno spettacolo. I test esistenti restano verdi.
- **`tsc --noEmit`** a ogni tappa, e niente `next build` col dev server acceso.
- **Le prove le fa Giovanni.** Claude non avvia il dev server, non stampa e non prenota. A ogni tappa consegna cosa provare:
  - il display in ogni momento della serata (il preroll si può accorciare con P per vederli in fila);
  - un PDF scaricato;
  - una stampa di prova della cassa e un biglietto vero dal banco;
  - il QR letto dal lettore all'ingresso.

## Fuori da questa specifica

- Il display che non vede le quote di Pretix, e le letture di TMDB che fa a ogni aggiornamento.
- Il cookie e la password del gestionale scritti nel codice, e il registro delle sale in `/tmp`.
- Il ramo senza spettacolo di `BookingFlow.fetchSchedules`.
