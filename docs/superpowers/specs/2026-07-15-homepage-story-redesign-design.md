# Redesign della storia cinematica in homepage

**Data:** 2026-07-15
**Stato:** approvato da Giovanni (conversazione del 15 luglio 2026)

## Obiettivo

La homepage (hero `MovieShowcase` + scrollytelling `CinematicStory`) è bella ma ripetitiva:
3-4 capitoli su 13 sono frasi centrate su sfondo nero quasi invisibile, la stessa riga di
metadati (bollino, anno, durata, generi) compare identica in 6 sezioni, la sezione weekend
è un accordion di card poco elegante, il calendario settimanale ha un design datato e la
sezione premi è centrata sui film invece che sui festival. Il redesign aumenta varietà,
eleganza e "sogno" (più backdrop, dissolvenze, film che si rivelano) senza toccare ciò che
funziona: hero, strisce backdrop, numeri animati, mosaico parallax, marquee.

## Non-obiettivi

- Nessuna modifica alla hero (`MovieShowcase`), al flusso di prenotazione (`BookingDrawer`),
  alle API, al sync Pretix o allo schema dati.
- Nessun nuovo dato richiesto: si usano campi già presenti (`extraBackdrops`, `logo_path`,
  `awards`, `subevents`).

## Nuova sequenza dei capitoli

Da (attuale):
`tagline → stripes A → stats → logos(8) → weekend → calendar → quote → awards → tagline → stripes B → mosaic → marquee → tagline/quote di chiusura`

A (nuova):
`quote apertura → stripes A → stats → logos (tutti) → weekend filmstrip → reveal (nuovo) → calendar (redesign) → festival → stripes B → mosaic → marquee → quote chiusura`

Le due tagline centrali e la quote di metà pagina spariscono. La rotazione a seed
(`seededShuffle` con `storySeed` da `page.tsx`) e la logica "capitoli vuoti omessi" restano
identiche. I test in `storyBuilder.test.ts` vanno aggiornati alla nuova sequenza.

## 1. Citazioni: due sole, cinematografiche

- Solo **apertura** (subito dopo la hero) e **chiusura** (ultimo capitolo).
- Contenuto: tagline del film se presente, altrimenti excerpt della trama
  (`excerptOverview`, invariato). Preferire per la chiusura un film premiato, come oggi.
- **Font serif dedicato**: Playfair Display (corsivo incluso) caricato via
  `next/font/google`, esposto come variabile CSS `--font-serif-display` con fallback
  Georgia/serif. Peso medio, corsivo, non più il bold sans.
- **Backdrop visibile**: opacità ~0.4 (oggi 0.16), con vignettatura che lo fonde nel nero.
  Animazione d'ingresso: il backdrop emerge dal nero in dissolvenza lenta (opacity + leggero
  scale), la frase appare sopra con fade ritardato — effetto "titoli di testa".
- Sotto la frase: solo titolo film e regista. **Nessuna MetaRow.**
- Il backdrop usato resta un indice alto di `extraBackdrops` con fallback, per non ripetere
  quelli di hero e strisce.

## 2. Strisce backdrop: fix dimensione loghi

- `.stripeLogo` riceve un tetto d'altezza: `max-height` ~clamp(90px, 13vh, 140px) su
  desktop, più basso su mobile, con `width: auto` e `object-fit: contain`.
- I loghi orizzontali (larghi e bassi) restano visivamente come oggi; quelli alti/quadrati
  (es. Ultimo Tango a Parigi) smettono di dominare la striscia.
- Nella striscia la MetaRow sparisce: restano logo/titolo e "un film di {regista}".

## 3. Muro loghi: tutti i film

- Rimosso il limite `MAX_LOGOS = 8`: entrano tutti i film in programmazione con
  `logo_path`.
- Griglia 4 colonne desktop / 2 mobile (come oggi) che cresce in righe; stagger d'ingresso
  invariato.

## 4. Weekend: filmstrip full-bleed

Sostituisce integralmente le tre card Ven/Sab/Dom.

- I dati arrivano invariati da `buildWeekend()` (raggruppamento Ven/Sab/Dom, timezone
  Europe/Rome, dedup orari): cambia solo la presentazione.
- Per ogni giorno: intestazione centrata e ariosa — kicker piccolo (data estesa) + nome del
  giorno grande.
- Sotto, **una striscia full-bleed per ogni film** del giorno: backdrop con parallax (riuso
  del linguaggio visivo di `Stripe`), logo del film (o titolo testuale se manca), e gli
  orari come **chip grandi e leggibili**; sold-out barrati con `title` esplicativo.
- Metadati qui SÌ: bollino classificazione + durata accanto agli orari (è il punto dove si
  decide cosa vedere).
- Ogni striscia usa un backdrop diverso da quelli delle sezioni stripes (altro indice di
  `extraBackdrops`, con fallback) quando disponibile.
- Click sulla striscia → `selectMovie(id)` (comportamento invariato).
- Mobile: strisce più basse, logo ridotto, chip orari a capo.

## 5. Nuovo capitolo "Reveal" (dissolvenze)

Capitolo nuovo tra weekend e calendario, pensato per "far sognare".

- Contenitore **sticky a viewport pieno** (`position: sticky` + wrapper alto ~n × 100vh):
  mentre si scrolla, **3-4 backdrop si dissolvono uno nell'altro** (crossfade guidato da
  `useScroll`/`useTransform` di framer-motion) con lento zoom Ken Burns.
- Per ogni film, il **logo emerge dal buio** (fade + blur→0) e svanisce prima del
  crossfade successivo. Senza logo si usa il titolo nel nuovo serif.
- Selezione film: 3-4 film dalla rotazione a seed non già protagonisti dei capitoli
  precedenti, che abbiano backdrop inediti disponibili (indici alti di `extraBackdrops`,
  fallback sugli altri).
- Click → `selectMovie(id)`.
- `prefers-reduced-motion`: niente sticky né crossfade — fallback a una singola immagine
  statica con logo visibile.
- Capitolo omesso se meno di 2 film hanno materiale visivo sufficiente.

## 6. Programmazione settimanale: redesign completo

`WeeklyCinemaCalendar` viene ridisegnato ("cartellone di sala"), mantenendo intatti dati,
availability live via SWR e apertura del `BookingDrawer`.

- **Giorni come tab eleganti**: pillole con nome giorno + numero, riga orizzontale;
  navigazione settimana ← → mantenuta. Un solo giorno visibile per volta (su desktop e
  mobile: sparisce la griglia a 7 colonne).
- Le proiezioni del giorno: **righe raffinate** con poster piccolo, titolo, orario grande
  in `tabular-nums`, sala, badge lingua e bollino. Sold-out evidente. Metadati completi
  qui SÌ.
- **Nuovo dato necessario**: `enrichedSubEvents` in `src/app/page.tsx` viene arricchito con
  `tmdbId` e `posterPath` (da `MovieOverride.customPosterPath`) così il calendario può
  mostrare i poster. La prop del componente estende l'interfaccia `SubEvent` in modo
  retrocompatibile (campi opzionali).
- La regola lingua per-proiezione resta quella attuale (`metaLingua` da PretixSync).

## 7. Sezione festival: ribaltata

Non più card per-film, ma **un blocco per festival**.

- Raggruppamento: per ogni film in programmazione con `awards`, ogni award viene risolto al
  suo festival via `getFestivalConfig(a.type)`; i film vengono raggruppati per festival
  (chiave: `config.src`). Un film premiato a più festival appare in più blocchi.
- Ogni blocco: **logo del festival grande, protagonista** + nome esteso del festival
  (mappa nome per type: Cannes → "Festival di Cannes", venice → "Mostra di Venezia",
  berlin → "Berlinale", oscar → "Academy Awards", ecc.).
- Sotto il logo: **i poster dei film** (cliccabili → `selectMovie`), ciascuno con sotto il
  riconoscimento in testo discreto ("Palma d'Oro · 2024" da `label` + `year`).
- Ordine festival: numero di film decrescente, poi prestigio (cannes, venice, berlin,
  oscar, poi gli altri).
- Nessuna MetaRow. Blocchi senza film omessi; sezione omessa se nessun festival.
- I loghi festival esistono già in `/public/logos/` (nessun asset nuovo).

## 8. Metadati: dieta

- `MetaRow` (bollino + anno + durata + generi) rimossa da: citazioni, strisce, festival,
  overlay poster (mosaico/marquee restano come oggi: titolo + anno·genere in overlay hover,
  che non è una MetaRow).
- Resta (in forma piena) solo in: **weekend filmstrip** e **calendario settimanale**.
- Nelle sezioni narrative al massimo regista e/o genere come testo discreto.

## Architettura e file toccati

| File | Intervento |
|---|---|
| `src/components/CinematicStory/storyBuilder.ts` | Nuova sequenza capitoli; nuovo tipo `reveal`; rimozione tagline centrali; `MAX_LOGOS` via; selezione film per reveal e festival |
| `src/components/CinematicStory/storyBuilder.test.ts` | Test aggiornati alla nuova sequenza + nuovi casi (reveal, festival grouping) |
| `src/components/CinematicStory/CinematicStory.tsx` | Nuovi componenti capitolo (QuoteChapter unificato, WeekendFilmstrip, RevealChapter, FestivalChapter); rimozione MetaRow dalle sezioni narrative |
| `src/components/CinematicStory/CinematicStory.module.css` | Stili nuovi capitoli; fix `.stripeLogo`; nuovo font serif nelle citazioni |
| `src/components/WeeklyCinemaCalendar/WeeklyCinemaCalendar.tsx` + `.module.css` | Redesign completo UI (tab giorni + righe con poster); logica dati/booking invariata |
| `src/app/page.tsx` | `enrichedSubEvents` arricchito con `tmdbId` + `posterPath` |
| `src/app/layout.tsx` | Caricamento font serif via `next/font/google`, variabile `--font-serif-display` |

Il raggruppamento per festival è logica pura: vive in `storyBuilder.ts` (o modulo adiacente)
ed è testato unitariamente.

## Vincoli tecnici

- **SSR/hydration**: ogni scelta dipendente dal seed resta deterministica (nessun
  `Math.random()` nei componenti); date sempre valutate su `Europe/Rome`.
- **Convenzioni repo**: CSS Modules, framer-motion, `getTMDBImageUrl`, evento
  `vestri:select-movie`. Leggere le docs Next in `node_modules/next/dist/docs/` prima di
  usare `next/font` e `next/image` (versione con breaking changes).
- **Reduced motion**: ogni animazione nuova ha il suo fallback statico (pattern `reduced`
  già presente).
- **Mobile**: ogni nuova sezione ha il suo blocco `@media (max-width: 768px)`; il desktop
  viene ridisegnato come richiesto esplicitamente da Giovanni in questa sessione.

## Criteri di successo

- Nessuna frase su sfondo nero "vuoto": le due citazioni superstiti hanno backdrop visibile.
- Il logo di un film "alto" (es. Ultimo Tango a Parigi) non supera ~140px di altezza nelle strisce.
- Il muro loghi mostra tutti i film con logo (>8 quando disponibili).
- La sezione weekend non ha più card/accordion: backdrop + logo + orari full-bleed.
- Il calendario mostra poster e tab giorni; prenotazione funziona identica.
- La sezione festival mostra blocchi per festival con poster dei film sotto.
- Bollino/anno/durata compaiono solo in weekend e calendario.
- `npx vitest run` verde; nessun errore di hydration in console.
