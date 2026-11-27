# Vestri Cinema — sito e biglietteria, v2

v1: `~/Desktop/code/VestriCinema/VESTRICINEMASHOP` (si legge, non si tocca).
v2: `~/Desktop/code/VestriCinema/VESTRICINEMASHOP v2` (alla fine prende il nome della v1). Online: vestricinema.com.

## Cosa fa
1. **Home a sette atti**: dal film più vicino al più lontano, con la luce del film, il trailer e tutto il programma.
2. **Proiezione speciale**: l'apertura, gli intermezzi e le frasi della critica.
3. **Prenotazione**: la sala, il posto e il biglietto con QR in PDF. I biglietti sono gratuiti e passano da Pretix.
4. **Gestionale — Programma e Oggi**: la settimana come una timeline e «Manda in sala» su Pretix.
5. **Gestionale — Film e Catalogo**: le schede, TMDB e la sync con Plex.
6. **Gestionale — Speciale**: le proiezioni speciali, «Riempi dal distributore» e «Chi ha le foto?».

## Cosa resta fuori
Il display d'ingresso (`/display-esterno`), la Cassa e la stampa termica (`/api/print`, `/api/cassa`: le fa il Botteghino), Sale, Display e Attrezzi come stanze, `debug-sync`, `clear-cache`, `admin/relatinize`.
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
3. **Home**: gli atti, la luce del film, il trailer, tutto il programma.
4. **Proiezione speciale**: apertura, intermezzi, critica, `/api/speciale/*`.
5. **Prenotazione e biglietto**: Pretix, sync, webhook, cron, `/api/seats`, `/api/seating-plans`, `/api/schedule`.
6. **Gestionale**: guscio, login sicuro, Film e Catalogo, sync con Plex.
7. **Programma e Oggi**, più `/api/planning/*` per l'app.
8. **Stanza Speciale**: Riempi dal distributore e Chi ha le foto.
9. **Rifinitura, prova, cambio di dominio**. Poi via la v1.
