# Design: Scrollytelling cinematografico in homepage ("CinematicStory")

**Data:** 2026-07-13
**Stato:** Approvato dal committente (Giovanni), in attesa di piano di implementazione

## Obiettivo

Oggi la homepage termina dopo hero (`MovieShowcase`) e calendario settimanale. Aggiungiamo un'esperienza di scroll in stile Apple che inizia sotto il carosello poster "In Programmazione": capitoli visivi alternati (slogan giganti, strisce backdrop+logo, mosaico poster) che presentano i film in programmazione, con il calendario settimanale integrato come capitolo della sequenza. Vale sia per desktop che per mobile. Le sezioni esistenti (hero, carosello) restano intoccate.

## Decisioni prese col committente

- **Posizione:** il calendario settimanale diventa un capitolo interno alla sequenza (non resta fuori).
- **"Categorie":** le sezioni si alternano per tipo di layout (slogan / striscia / mosaico), ognuna mostra film diversi a rotazione. Nessun raggruppamento per genere.
- **Interazione:** click su un film in qualunque capitolo → selezione del film nella hero + scroll in cima (stesso flusso dei poster attuali → prenotazione dagli orari in hero).
- **Slogan:** tagline TMDB con fallback IT → EN → omesso (nessun campo custom admin per ora).
- **Dispositivi:** desktop e mobile, layout adattato.
- **Architettura dati:** approccio "sync → DB → SSR" (approccio A). Nessuna chiamata TMDB a runtime dalla homepage.

## 1. Dati

### Schema Prisma

Due campi nuovi su `MovieOverride`:

```prisma
tagline        String?
extraBackdrops String[] @default([])
```

Migration Prisma dedicata.

### Arricchimento TMDB (sync)

- `getMovieDetails` (src/services/tmdb.ts) recupera già `tagline` con fallback IT→EN (righe ~371-372): nessuna nuova chiamata.
- `getEnrichedMovieMetadata` espone in più:
  - `tagline` (stringa o vuota);
  - `extraBackdrops`: fino a 3 `file_path` scelti da `details.images.backdrops`, escludendo il backdrop principale già in uso, preferendo quelli senza testo (`iso_639_1 === null`), ordinati per `vote_average`.
- Tutti i punti di scrittura che oggi popolano `customBackdropPath`/`customLogoPath` da metadata TMDB (sync.service.ts, db.service.ts) scrivono anche `tagline` ed `extraBackdrops`. Pattern invariato: non si sovrascrivono dati inseriti manualmente.

### Backfill

Il sync arricchisce solo film nuovi/stub: i record esistenti non riceverebbero mai i nuovi campi. Serve uno script one-off (in `scratch/` o come endpoint admin usa-e-getta) che, per ogni `MovieOverride` con proiezioni future, popola `tagline` ed `extraBackdrops` se vuoti. Output verificabile a console (film aggiornati / tagline trovate).

### Homepage (page.tsx)

`GroupedMovie` si estende con `tagline` ed `extraBackdrops`, valorizzati nella query/mappatura esistente. I dati arrivano al nuovo componente via props. La homepage resta 100% DB Neon.

## 2. Componente `CinematicStory`

Nuovo `src/components/CinematicStory/` (`CinematicStory.tsx` + `CinematicStory.module.css`), client component, framer-motion (già in dependencies), CSS Modules come il resto del sito.

In `src/app/page.tsx` sostituisce `<WeeklyCinemaCalendar>`: riceve `movies` (GroupedMovie[]) e `subEvents` e renderizza il calendario come capitolo interno, senza modificarlo.

### Sequenza capitoli

1. **Slogan gigante** — tagline a tutto schermo stile Apple, emerge con fade+blur allo scroll; titolo del film in piccolo sotto.
2. **Strisce backdrop+logo** — 2-3 bande full-width consecutive: backdrop alternativo in parallax + logo del film che scivola dentro; logo alternato sinistra/destra; film diversi per striscia.
3. **Calendario settimanale** — `WeeklyCinemaCalendar` esistente, introdotto da un titolo animato.
4. **Secondo slogan** — film diverso dal primo, per dare ritmo alla sequenza.
5. **Mosaico poster** — tutti i film in programmazione in griglia, colonne che scorrono a velocità diverse (parallax multi-rate).
6. **Chiusura** — messaggio "Ti aspettiamo al cinema" + dissolvenza.

### Distribuzione film

Rotazione automatica: ogni film appare almeno una volta tra slogan e strisce (compatibilmente con la disponibilità di tagline/backdrop); il mosaico li mostra tutti. Con pochi film la sequenza si accorcia (meno strisce, slogan singolo) senza capitoli vuoti.

## 3. Animazioni

- framer-motion: `whileInView` per i reveal (fade/slide/blur), `useScroll` + `useTransform` per parallax e scale scrub.
- Solo `transform`/`opacity` (composited, fluido su iPhone). Nessuna animazione di proprietà layout.
- `useReducedMotion` → versione statica per chi ha `prefers-reduced-motion`.
- Mobile: stessi capitoli, layout adattato (font in `clamp()`, strisce più basse, mosaico 2-3 colonne) con la convenzione esistente `@media (max-width: 768px)`.
- Immagini via `next/image` con `sizes` adeguati; tutto sotto la fold → lazy loading di default.

## 4. Click → prenotazione

- Click su un film in qualunque capitolo → `window.dispatchEvent(new CustomEvent('vestri:select-movie', { detail: { movieId } }))` + scroll smooth verso la hero.
- `MovieShowcase` aggiunge un listener sull'evento che invoca l'esistente `handleMovieSelect(movieId)`.
- Nessuna ristrutturazione dello stato: i due componenti restano fratelli sotto page.tsx.

## 5. Edge case ed errori

- Tagline assente → film escluso dai capitoli slogan; se nessun film ha tagline, capitoli slogan omessi.
- `extraBackdrops` vuoto → fallback a `customBackdropPath`; se anche quello manca, il film salta le strisce.
- Logo assente → striscia con solo titolo testuale al posto del logo.
- Nessun film in programmazione → `CinematicStory` non renderizza nulla (coerente con lo showcase).
- Fallimento TMDB durante sync/backfill → campi restano vuoti, la UI degrada come sopra; nessun errore bloccante.

## 6. Test e verifica

- `npm run build` + lint devono passare.
- Backfill: esecuzione con output verificabile (n. film aggiornati, tagline trovate).
- Verifica visiva a carico del committente sul suo ambiente (convenzione del progetto: niente dev server avviato dall'agente).
- Regressione: hero, carosello poster e calendario devono restare identici; il calendario cambia solo posizione nel DOM (dentro `CinematicStory`).

## Fuori scope

- Campo slogan custom nel pannello admin.
- Raggruppamenti per genere/tema.
- Modifiche a hero, carosello, booking flow.
