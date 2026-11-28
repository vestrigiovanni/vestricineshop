# Vestri Cinema — sito e biglietteria, v2

v1: `~/Desktop/code/VESTRICINEMASHOP` (si legge, non si tocca).
v2: `~/Desktop/code/VESTRICINEMASHOP v2` (alla fine prende il nome della v1). Online: vestricinema.com.

## Cosa fa
1. **Home a sette atti**: dal film più vicino al più lontano, con la luce del film, il trailer e tutto il programma.
2. **Proiezione speciale**: l'apertura, gli intermezzi e le frasi della critica.
3. **Prenotazione**: la sala, il posto e il biglietto con QR in PDF. I biglietti sono gratuiti e passano da Pretix.
4. **Gestionale — Programma e Oggi**: la settimana come una timeline e «Manda in sala» su Pretix.
5. **Gestionale — Film e Catalogo**: le schede, TMDB e la sync con Plex.
6. **Gestionale — Speciale**: le proiezioni speciali, «Riempi dal distributore», «Critica dal trailer» e «Chi ha le foto?».
7. **Il display d'ingresso** (`/display-esterno`, `/api/display`): gli spettacoli di oggi e dei prossimi giorni sullo schermo orizzontale. Entrato il 28/11/2026.

## Cosa resta fuori
La Cassa e la stampa termica (`/api/print`, `/api/cassa`: le fa il Botteghino), Sale, Display e Attrezzi come stanze, `debug-sync`, `clear-cache`, `admin/relatinize`.
Fuori anche gli avanzi: scratch, tmp, debug.html, subevents.json, YCSE, .reanimate, i vecchi worktree.

## Da portare dalla v1
- **Il database Neon così com'è**: gli stessi 9 modelli Prisma (MovieOverride, MovieAward, PretixSync, CatalogFilm, PlanningCommitJob, PlanningCommitItem, PlanningDraft, ProiezioneSpeciale, ImmagineSpeciale, CriticaTrailer). **Niente migrazioni**: lo leggono app iOS, Social, Gioco, Preroll e Sala 1.
- **Regole dei dati**:
  - i testi di Gio vincono su TMDB;
  - si mostrano solo le proiezioni future, dalla più vicina;
  - il colore del film si misura sui pixel del fondale (`tinta.ts`);
  - la divisione negli atti (`programma.ts`) e il trailer del giorno;
  - la sync con Pretix al massimo una volta al minuto, più il webhook e il cron delle 04:00;
  - le date della proiezione speciale lette dal programma.
- **Logica con i suoi test vitest**: `services/scheduling/*`, `services/stampa/*`, `catalogMatch`, `tmdbLoader`, `filmImagery`, `syncSwitch`, `proiezioneSpeciale`, `loghiStampa`, `linkData`, `metadati`, `_tavolo/*`, `buildOggi`, `plexMerge`, `critica/leggi`.
- **Il motore scroll-craft** (`src/vendor/scrollcraft`).
- **La compatibilità**: browserslist fino a Safari/iOS 15.4, perché sugli iPhone vecchi trailer e prenotazione restavano morti.
- **Dati e file**: `public/speciali` (8,8 MB), `public/loghi`, `public/assets/vestri-cinema.png`, `src/data/gusto-sala.json`, lo script Plex con il suo stato `.plex-sync-inviati.json`.
- **Le chiavi**: i nomi delle variabili sono in `.env.local`. Si copiano sul Mac e si impostano su Vercel.
- **I difetti da chiudere nella v2**:
  - password `121212` di riserva nel codice e `ADMIN_SESSION_SECRET` mancante;
  - chiave TMDB visibile nel browser (`TicketPDF`);
  - piante delle sale scritte in un file che su Vercel si perde;
  - il dominio `.it` in `CheckoutButton` e `pretix.ts`.

## Chi la usa da fuori (va tenuto identico)
- **App iOS**: tutta la famiglia `/api/planning/*` su vestricinema.com, e il webhook `/api/webhooks/pretix` su vestricinema.vercel.app.
- **VestriCinema Sala 1** (`speciale.py`, `viva.py`): `/api/speciale/*` e `public/speciali/ycse/banner-orizzontale.jpg`.
- **video/strumenti/prendi-dati.mjs**: `/api/schedule`, `/api/seating-plans`, `/api/seats`. Legge anche `package.json`, `vestri-cinema.png` e `tinta.ts` della v1 **per percorso**.
- **Pretix**: il webhook che punta al sito.
- **Plancia** (`strumenti.json`, riga 104), memoria (3 file), vault (13 file).

## Stack
Next.js 16 + Prisma sullo stesso Neon, su Vercel. Una sola libreria per le animazioni (`motion`) più scroll-craft. GSAP, html2canvas e swr si tolgono se non servono.
L'anteprima va su un progetto Vercel nuovo; vestricinema.com passa alla v2 solo quando lo dice Gio.

## Aspetto
Identità nuova: tema **Fornace** (Kiln di hallmark, scelto da Gio il 27/11/2026): nero profondo, inchiostro crema, Boska sopra Geist, pillole, un solo accento brace che diventa il colore del film. Token in `src/styles/tokens.css`. Vale per il sito e per il gestionale. La luce del film resta, come idea.

## Le fette
1. **Scheletro**: avvio a doppio clic, lo stesso database, una pagina con le proiezioni future vere. Anteprima su Vercel.
2. **Design**: tre temi con hallmark, Gio ne sceglie uno.
3. **Home**: gli atti, la luce del film, il trailer, tutto il programma. *Fatta il 27/11/2026: in `src/home`; «Più avanti» mostra 12 film e rimanda al programma.*
4. **Proiezione speciale**: apertura, intermezzi, critica, `/api/speciale/*`. *Fatta il 27/11/2026: in `src/speciale`; la speciale accesa nel database apre la Home ed esce dagli atti, i tre intermezzi stanno dopo Oggi, Prossimi e Più avanti; «Guarda il trailer» apre YouTube. `/api/speciale/critica` e `/api/speciale/immagine[/<id>]` identiche alla v1; il caricamento dal gestionale (cookie) arriva con la fetta 6, `/api/speciale/immagine/indirizzo` con la fetta 8 (la usa solo la stanza Speciale).*
5. **Prenotazione e biglietto**: Pretix, sync, webhook, cron, `/api/seats`, `/api/seating-plans`, `/api/schedule`. *Fatta il 27/11/2026: in `src/biglietteria`. Prenota apre la sala sopra la Home (anche `/?subevent=<id>`), conferma con o senza email, QR e «Scarica PDF» disegnato dal server (`/api/biglietto`, serve la chiave dell'ordine). Il browser parla solo con `/api/seats` e `/api/book`. Sync completa, leggera, webhook e cron come nella v1, ma senza TMDB: i film nuovi nascono «Caricamento...» fino alla fetta 6. Il cron non accetta più `?manual=true`. `/api/schedule` ora legge dal database. Fuori per ora: «Salva nelle Foto».*
6. **Gestionale**: guscio, login sicuro, Film e Catalogo, sync con Plex. *Fatta il 27/11/2026: in `src/gestionale`. Login senza chiave di riserva: senza `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET` (almeno 32 caratteri, da mettere anche su Vercel) il gestionale resta chiuso; cookie firmato di un anno, freno sui tentativi, ogni azione ricontrolla il cookie. Film: in sala o tutte le schede, la scheda di Gio vince su TMDB (`film/scheda.ts`), «Rileggi da TMDB», «Torna come su TMDB», premi da MUBI, salvando si aggiorna subito Pretix. Catalogo: libreria Plex, filtri, Sorprendimi, conferma e correzione dell'abbinamento, «Abbina a TMDB» (il CSV della v1 non c'è più). `/api/catalog/plex-sync` identica alla v1, script `npm run plex:sync` col suo stato. La sync da Pretix riempie i film nuovi da TMDB (stub solo se TMDB non risponde). Upload della speciale anche col cookie. `/admin` apre Film finché non c'è Oggi. Fuori per ora: il «Colpo d'occhio» e la latinizzazione dei nomi del cast.*
7. **Programma e Oggi**, più `/api/planning/*` per l'app. *Fatta il 27/11/2026: Oggi è la porta di `/admin` (`src/gestionale/oggi`: in sala adesso, la giornata con la sala di ogni spettacolo, i numeri, «Da guardare» con «Rileggi da Pretix»). Programma (`src/gestionale/programma`): la settimana di una sala come timeline (parte dalla sala con più spettacoli), la libreria accanto per accendere i posti dove un film ci sta o trascinarlo sul giorno, «Riempi i buchi» (Scelgo io dai poster o Scegli tu), «Rimescola», la bozza salvata in `PlanningDraft`, «Manda in sala» a lotti (`PlanningCommitJob`/`Item`, si riprende se resta a metà), sposta ed elimina con il controllo dei biglietti presi. Il motore della v1 sta in `src/programma/motore` con i suoi test (date-fns-tz sostituito da Intl); `src/programma/sala.ts` è l'unico posto che crea, sposta e cancella su Pretix; `planning.ts` è `planningActions` senza `'use server'` (le azioni del gestionale ricontrollano il cookie). `/api/planning/*` identiche alla v1, con la chiave `VESTRI_API_KEY` (da mettere sul progetto Vercel nuovo: senza, rispondono 503). Le sale sono quelle di Pretix in ordine di nome, senza preferiti (il registro della v1 stava in /tmp). Fuori per ora: la scheda «altre info» alla Netflix e gli scaffali della libreria.*
8. **Stanza Speciale**: Riempi dal distributore e Chi ha le foto. *Fatta il 27/11/2026: in `src/gestionale/speciale`. Elenco delle speciali (accendi, spegni, cambia, togli), l'editor con il film e le date come le scriverà il sito, la pagina d'apertura (regia, logo del distributore o di una casa TMDB, fotogrammi senza scritte), la critica («Critica dal trailer» col Mac, o trascinata), il materiale con il riquadro delle date su banner e locandina, foto di scena, trailer verticale, «Ritaglia e adatta». «Riempi dal distributore» e «Chi ha le foto?» con la logica della v1 e i suoi test (`stampa/*`, `esito.ts`). Nuova `/api/speciale/immagine/indirizzo` (solo col cookie). Niente arriva al sito senza «Salva».*
9. **Rifinitura, prova, cambio di dominio**. Poi via la v1. *28/11/2026: audit e polish (durate che non vanno a capo, la sala sotto l'orario nelle locandine, numeri dei posti a 11px); test, tipi e build verdi; «Da portare» spuntato; portati `scripts/critica-dal-trailer.mjs` con `scripts/critica/` (l'app «Critica dal trailer» ora sta in `~/Applications`, da rifare con `scripts/critica/installa.sh` quando la cartella cambia nome) e `scripts/letterboxd-taste.mjs`; il cron senza `CRON_SECRET` resta chiuso. API confrontate con vestricinema.com: stesse risposte (le `/api/planning/*` in locale dicono 503 perché manca `VESTRI_API_KEY`, come previsto).*
