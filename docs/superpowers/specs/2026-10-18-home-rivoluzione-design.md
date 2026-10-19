# La rivoluzione della home

**Data:** 2026-10-18
**Stato:** scelte e ordine fissati da Giovanni il 18 ottobre 2026; in costruzione.
**Ramo:** `home-rivoluzione`
**Materiale di partenza:**
- l'audit, `docs/redesign-home/01-audit.md`;
- i prototipi con i dati veri, in `docs/redesign-home/direzioni/`: `a-proiezione.html`, `b-foglio-di-sala.html`, `c-mosaico.html` e `opzioni.html`. Si aprono con la config `prototipi` di `.claude/launch.json`.

## Obiettivo

La home diventa una pagina **generata dai film in sala**. Composizione, fondali, premi e tecniche di movimento nascono dai dati del giorno. Due giorni diversi danno due pagine diverse, senza che nessuno tocchi niente.

**Le funzioni restano tutte:**
- prenotazione di ogni spettacolo con `BookingDrawer`;
- il link `?film=` / `?subevent=`;
- il trailer;
- lo stato esaurito;
- la disponibilità.

**Cambiano** layout, caratteri, movimento e il modo di mostrare i metadati.

## Le scelte di Giovanni

| Domanda | Scelta |
|---|---|
| Fondo | **sempre nero**. La direzione B (carta) è scartata |
| Base | **A · Proiezione**: il testo vive nelle bande nere, mai sopra un volto |
| Dalla A | la **pagina d'onore della Palma d'oro** (il premio più alto della settimana a tutto schermo) e l'**elenco dei film con il logo** al posto del titolo |
| Dalla B | la **pellicola che scorre** mentre scendi, su **almeno tre film**, a tutte le misure |
| Dalla C | la **parete dei premi** |
| Apertura | il fondale del film più vicino sale dal nero; poi logo, ora, sala e programmazione, con un'eleganza "alla Apple" |
| Idee in più (da `opzioni.html`) | **1** pellicola, **2** locandina che diventa fotogramma, **5** iride, **8** conto alla rovescia, **9** trailer muto nel fotogramma, **10** ventaglio di locandine, **11** doppio programma |
| Idee in più (da `opzioni-2.html`) | **A** il film in una striscia di colore (codice a barre dai fondali), **D** la giornata in sala (quadrante di 24 ore), **G** la sinossi in sottotitoli |
| Scartate | 3 titoli di testa, 4 torcia, 6 doppia esposizione, 7 durata come tempo, 12 logo scritto dalla luce, 13 aura; dalla seconda tornata B negativo, C fascio, E fuoco, F cambio rullo |
| Ordine dei pezzi | **fisso**, scelto con la prova `docs/redesign-home/direzioni/ordine.html` (punto 3). Cambiano ogni giorno i film dentro i pezzi |
| Carattere dei titoli | **Libre Caslon Display** (premi, orari grandi, titoli di sezione) |
| Carattere dei dati | **Hanken Grotesk**, maiuscolo spaziato (prova D di `opzioni.html`), al posto di JetBrains Mono, che Giovanni non sopporta |
| Più si scende | i film **più lontani nel tempo** compaiono più in basso, ognuno in un pezzo con una tecnica diversa |

## 1. Le fondamenta

### Caratteri
- **Titoli:** Libre Caslon Display, caricato con `next/font/google`. Ha un solo peso: niente grassetti finti.
- **Dati** (regista, orari piccoli, sala, lingua, specifiche): **Hanken Grotesk** 400, maiuscolo, spaziatura circa .22em, corpo 11–12 px, numeri tabellari.
- **Testo** (sinossi): Newsreader, salvo diversa scelta.
- **Loghi dei film:** restano le immagini TMDB. Quando il logo manca, il titolo va in Libre Caslon Display.
- **Fraunces** resta al gestionale. **JetBrains Mono** sparisce dalla home ma resta in admin. L'unica eccezione sono le cifre a palette del conto alla rovescia, che restano un oggetto da tabellone.
- Prima di toccare i font va letta la guida `next/font` in `node_modules/next/dist/docs/` (come chiede `AGENTS.md`).

### Colori
Si usano solo i token di `src/components/cabina/cabina.css`, più il nero pieno della sala:
- **nero** `#000` / `#0a0908` per il fondo;
- **carta** `#efe6d8` per il testo;
- **polvere** `#8a7d6c` per il testo secondario;
- **lampada** `#e8a33d` **solo** su Prenota.

La grana resta quella fissa di `.cabina::after`.

### Movimento
- **GSAP + ScrollTrigger** (`npm install gsap`), solo dentro componenti client.
- Con `prefers-reduced-motion` tutto compare già al suo posto, senza animazioni.
- Sul telefono valgono le stesse tecniche, con meno pezzi e immagini più piccole. Niente animazioni ricalcolate a ogni frame fuori da GSAP.

### Dati
- **Fondali extra:** `withExtraBackdrops` (fatto, in `src/services/filmImagery.ts`). Si leggono da TMDB lato server, con un giorno di cache e nessuna scrittura nel database.
- **Sala:** `roomName` / `customRoomName`, già nei subevent della home.
- **Trailer:** `trailerKeys`, già in `GroupedMovie`.
- **Premi:** `awards`, con `details` letti come "Vincitore: …", "Candidatura: …" o "Selezione ufficiale". Il peso dei premi (Palma d'oro, Leone d'oro, Orso d'oro, Oscar miglior film sopra tutto) passa da `docs/.../regia.js` a una funzione testata.
- **Modalità vetrina:** `VESTRI_SYNC_OFF=1` per guardare in locale senza toccare Pretix (fatto).

## 2. La regia del giorno

L'**ordine dei pezzi è fisso**: l'ha deciso Giovanni con la prova `ordine.html` il 18 ottobre 2026 (punto 3). Quello che cambia ogni giorno è **quali film** finiscono in ciascun pezzo, quali fondali, quali premi e quali spettacoli. Così ogni giorno la pagina è diversa ma il ritmo resta quello scelto.

Una funzione pura, `buildHomePlan(movies, today)` in `src/components/Home/regia.ts`, con i test, decide dai dati e da un **seme che è la data**:
- **il film d'apertura:** il primo spettacolo ancora da iniziare;
- **la pagina d'onore:** il film con il premio più pesante della settimana (Palma d'oro, Leone d'oro, Orso d'oro, Oscar miglior film sopra tutto);
- **i premi della parete:** solo quelli vinti, ordinati per peso;
- **i film dei pezzi "prossimi film"**, presi in ordine di data dopo quelli di oggi, con queste regole:
  1. **pellicola:** tre film di fila nello stesso pezzo, ognuno con la sua striscia, purché abbiano almeno 4 fondali (se non ce ne sono tre, quanti ce ne sono);
  2. **striscia di colore:** un film con almeno 4 fondali;
  3. **trailer muto:** un film con un trailer;
  4. **doppio programma:** due film dello stesso giorno;
  5. **ventaglio:** da 4 a 7 locandine dei film più lontani;
  6. **sottotitoli:** un film con una sinossi di almeno 250 caratteri e in lingua originale non italiana, se c'è;
  7. **locandina→fotogramma** e **iride:** un film ciascuno;
  8. un film non compare in due pezzi della stessa pagina, finché ce ne sono abbastanza. Fra più candidati sceglie il seme.

Un pezzo senza un film adatto si salta, e la pagina resta comunque in ordine. Stesso giorno, stessa pagina.

## 3. La pagina, dall'alto in basso

Ordine scelto da Giovanni:

1. **Apertura** (100svh). Il fondale del film d'apertura sale dal nero (opacità e leggero zoom, circa 3 s). Poi, in sequenza, a partire da circa 1,4 s:
   - il logo, che passa da sfocato a nitido;
   - "Oggi" o il giorno;
   - l'ora grande in Libre Caslon;
   - la sala;
   - la riga dei dati (regia · anno · durata · lingua · specifiche);
   - infine Prenota.

   Tutto il testo sta nella metà bassa, su un velo scuro, mai sopra i volti. L'animazione parte quando il fondale è caricato, e dopo 2,5 s parte comunque.
2. **Oggi, con i loghi.** Gli spettacoli di oggi: ora grande, **logo del film** al posto del titolo, regia · durata · lingua · specifiche, Prenota su ogni riga.
3. **Conto alla rovescia.** Quanto manca al prossimo spettacolo, con le cifre a palette, il logo e "giorno · ora · sala". Si nasconde se nella settimana non c'è più niente.
4. **Pagina d'onore.** Il logo del festival grande, che cresce scorrendo; il premio in Libre Caslon a tutta larghezza ("Palma d'oro"); il logo del film; "in sala giorno · ora".
5. **Parete dei premi.** Riquadri per festival: il logo in bianco, il premio, il film, e il suo fondale che sale dietro. Il primo riquadro è grande.
6. **Pellicola che scorre**, su tre film: i fotogrammi passano di lato mentre scendi, a tutte le misure.
7. **La giornata in sala.** Quadrante di 24 ore: ogni spettacolo di un giorno è un arco lungo quanto il film, e la lancetta segna l'ora vera. Toccando un arco si vede il film con "inizio → fine", regia, lingua e sala.
8. **Locandina → fotogramma.** Il poster si allarga fino al formato cinema e lascia il posto al fondale.
9. **Il film in una striscia di colore.** I fondali, letti colonna per colonna, diventano il codice a barre dei colori del film; passandoci sopra si vede il fotogramma.
10. **Iride.** Il film si apre da un cerchio di luce.
11. **Trailer muto.** Il trailer parte da solo, senza audio, tagliato in formato cinema.
12. **Doppio programma.** Due film dello stesso giorno dividono lo schermo, e la linea di luce si sposta mentre scendi.
13. **Ventaglio di locandine** dei film più lontani.
14. **Sinossi in sottotitoli.** La trama scorre una battuta alla volta sotto il fotogramma, con la lingua originale in alto.
15. **La settimana completa.** Il programma di tutti i giorni, ogni spettacolo con ora + logo + dati + Prenota. È il posto dove si prenota qualsiasi cosa.
16. Footer di oggi.

I pezzi dal 6 al 14 chiudono ciascuno con logo, giorno · ora · sala e Prenota.

## 4. Che cosa esce

Si tolgono dalla home:
- `CinematicStory`, con tutti i suoi capitoli: citazioni, serate, strisce, statistiche, muro di loghi, weekend, reveal, festival, marquee/DriftWall;
- `TextFlippingBoard` in coda;
- `WeeklyCinemaCalendar`, sostituito dalla settimana del punto 8;
- `MovieShowcase` (hero, `ShowtimeTable`, `FilmStrip`).

I file restano nel repository finché la nuova home non è approvata. Dopo si cancellano in una tappa a parte, controllando che display, `/success` e gestionale non li importino.

## 5. Tappe di lavoro

1. **Fondamenta.** Font, token, GSAP, `regia.ts` con i test (pesi dei premi, sequenza delle tecniche, seme).
2. **Apertura e conto alla rovescia**, con Prenota collegato a `BookingDrawer`.
3. **Oggi e la settimana** (elenchi con i loghi), con Prenota su ogni riga e `?film=` / `?subevent=` funzionanti.
4. **Pagina d'onore e parete dei premi.**
5. **I prossimi film:** pellicola, locandina→fotogramma, iride, codice a barre, sottotitoli, doppio programma, ventaglio, trailer muto; più **la giornata in sala**.
6. **Telefono, prestazioni, accessibilità:**
   - al massimo circa 25 immagini al primo caricamento;
   - `next/image` con `sizes`;
   - focus visibile, bersagli da 44 px;
   - contrasto dei loghi (lo schiarimento di quelli scuri, già nei prototipi).
7. **Pulizia:** si tolgono i componenti vecchi e si aggiorna la scheda nel vault, se Giovanni vuole.

Dopo ogni tappa: screenshot a 1440 e 390 px in modalità vetrina, e Giovanni prova sul suo server.

## 6. Verifica

- `tsc --noEmit` e `vitest` verdi (i test della regia sono nuovi).
- In vetrina:
  - nessuna richiesta a Pretix in sync;
  - la home a 1440, 1024 e 390 px;
  - nessuno scorrimento orizzontale sul telefono.
- Prenota apre la prenotazione giusta da ogni punto della pagina; `?film=` apre la home su quel film.
- Con `prefers-reduced-motion` la pagina è completa e ferma.
- Con `?giorno=` (solo in sviluppo) si vede la pagina di un altro giorno, per provare la regia.

## Fuori da questa specifica

- schema del database, Pretix, gestionale, display e biglietti;
- riempire tagline, generi e voto nel catalogo (strada A scartata: solo letture da TMDB);
- tradurre in italiano i premi scritti in inglese ("Best Leading Actress"): è un lavoro sui dati, da fare a parte.

## Com'è andata

Costruita il 18 ottobre 2026 sul ramo `home-rivoluzione`, tappe 1–7.

- **Dove vive:** `src/components/Home/`.
  - `regia.ts` (con i test) decide i pezzi;
  - `HomePage.tsx` li monta e gestisce disponibilità dal vivo e prenotazione;
  - `Apertura`, `Programma` (Oggi e settimana), `Conto`, `Premi` (pagina d'onore e parete) e `Pezzi` (pellicola, giornata, locandina, striscia di colore, iride, trailer muto, doppio programma, ventaglio, sottotitoli);
  - `shared.tsx` raccoglie logo del film, coda con Prenota, regia GSAP e caricamento delle immagini vicine.
- **Idratazione:** la regia gira con l'istante passato dal server (`nowIso`), così la pagina idratata è identica a quella del server. Le coordinate del quadrante sono arrotondate, perché server e browser non danno gli stessi decimali.
- **Striscia di colore:** legge i pixel dalle immagini servite da `/_next/image` (stessa origine). In Next 16 l'ottimizzatore accetta solo la qualità 75.
- **Immagini:** ogni pezzo chiede le sue solo quando è a circa uno schermo e mezzo di distanza (`Vicina`). Prima il telefono ne scaricava 63 al primo caricamento.
- **Il doppio programma** guarda prima ai giorni dopo il primo, per non ripetere i film di "Oggi".
- **Tolti:**
  - `MovieShowcase`, `CinematicStory`, `WeeklyCinemaCalendar`, `TextFlippingBoard`, `DriftWall`, `TextEffects`, `CustomVideoPlayer` e `AutoScrollContext`;
  - `festivals.ts` è passato in `Home`;
  - `languageLabel` e i link `?film=` / `?subevent=` sono in `Home/linkData.ts`.
- **Titolo della scheda:** "Vestri Cinema".
- **Ancora da vedere con Giovanni:**
  - la lunghezza della pagina (circa 32.000 px su desktop, per i nove pezzi fissati mentre si scorre);
  - se il trailer muto parte da solo sul suo browser;
  - il conto alla rovescia, che mostra lo stesso film dell'apertura.

## La ristrutturazione del 19 ottobre

Richiesta di Giovanni: "più film, più varietà", e un sito che sembri costruito da uno studio, sempre in questa direzione. Fatto sul ramo `home-rivoluzione`, guardando la vetrina a 1440 e 390 px.

- **Apertura che gira.** Dopo l'ingresso, ogni 7 secondi entra il prossimo film (fino a sei, diversi e prenotabili; il primo resta il primo spettacolo anche se è esaurito). In basso la fila degli orari, con la linea che si riempie; il giro si ferma fuori schermo, con la scheda nascosta e sotto il cursore. In alto il nome della sala e "Il programma ↓". Regia: `giroFrom` in `regia.ts`, con i test.
- **Nastro dei titoli** (`Nastro.tsx`, pezzo nuovo dopo l'apertura). Tutti i film in Libre Caslon con l'anno, su due righe in versi opposti; scorrendo accelerano, sotto il cursore la riga si ferma e compare la locandina. Un clic prenota.
- **Il cartellone** (`Cartellone.tsx`, pezzo nuovo dopo Oggi). "Trentadue film", e sotto quanti registi e da che anno a che anno (contati dai dati, niente testo inventato). Filtri per epoca e per lingua, con le locandine che si riordinano (GSAP Flip). Ogni locandina prenota il prossimo spettacolo.
- **Il programma** a schede: una fila di date che resta in alto, un giorno alla volta.
- **Oggi e programma**: passando su una riga dietro sale il fondale del film; gli spettacoli esauriti si ritirano.
- **Conto alla rovescia**: cifre in Hanken Grotesk su palette vere (niente più zero barrato del monospazio di sistema) e la fila "E poi" con i tre film seguenti.
- **Premi**: la parete si chiude sempre senza buchi; il premio della pagina d'onore sale lettera per lettera.
- **Pellicola**: un quadro solo con tre strisce che scorrono in versi opposti. Le corse dei pezzi fissati sono più corte: la pagina passa da circa 32.000 a 23.500 px su desktop.
- **Indice**: una capsula in basso (Oggi · I film · Premi · Programma) che compare dopo l'apertura e si ritira sul piede.
- **Movimento**: GSAP 3.15 (SplitText e Flip, ora gratuiti). Lo scorrimento resta quello del browser: vedi sotto.

### Lenis tolto, lo stesso giorno
Pubblicata la ristrutturazione, Giovanni ha trovato il sito "a scatti, soprattutto su Firefox". Misure:
- nel browser del pannello (Chromium) la pagina scorre a 60 fotogrammi al secondo dall'inizio alla fine;
- in un Firefox 158 separato, con profilo temporaneo, una pagina di prova della stessa origine faceva scorrere la home in un iframe e contava i fotogrammi pezzo per pezzo: 60 al secondo, 9 lenti su 3.600, tutti al primo caricamento delle immagini. Sfocature, maschere, nastro e cartellone non pesano.

Il disegno quindi regge; quello che cambiava era chi fa scorrere. Lenis rifà lo scorrimento in JavaScript a ogni fotogramma: con trackpad e mouse veri, estensioni e un disco quasi pieno, ogni intoppo del browser diventa uno scatto, mentre lo scorrimento nativo di Firefox gira fuori dal JavaScript e non si blocca. Lenis è stato tolto (`vaiA` usa lo scorrimento morbido del browser), i sette pezzi fissati hanno `anticipatePin: 1` (senza Lenis Firefox li aggancerebbe con un fotogramma di ritardo) e ScrollTrigger ignora la barra degli indirizzi che compare e sparisce sul telefono.
- **Titoli di sezione**: una testata comune (`Testata` in `shared.tsx`), occhiello in Hanken e titolo che sale riga per riga.
- **Piede**: "Vestri Cinema" in Libre Caslon a tutta larghezza, "Torna su", l'ingresso al gestionale quasi invisibile come prima. Al posto di "VESTRICINEMASHOP".
