# Specifiche di proiezione

7 agosto 2026

Come si vede e si sente uno spettacolo — 4K, Dolby Vision, Dolby Atmos, versione
IMAX — scelto in programmazione e mostrato al pubblico in home.

## La decisione che spiega tutto il resto

**Le specifiche non arrivano da Plex.** Leggere le tracce del file direbbe cosa
c'è sullo scaffale, non cosa esce dal proiettore: la sorgente è metà della
catena. Le spunta chi programma, che è l'unico a sapere com'è configurata la
sala quella sera.

Dalla libreria arriva una cosa sola: se il film esiste in 4K, la casella "4K"
parte spuntata. È una proposta, non un vincolo — si toglie con un clic.

**Vivono sul sito, non su Pretix.** Sono un fatto editoriale, non un dato di
biglietteria. Il giro attraverso Pretix — che è quello di lingua e sottotitoli —
avrebbe aggiunto un punto di rottura senza dare niente in cambio: una stringa
unica da serializzare e riparsare, meta property da dichiarare a mano
nell'organizer, e una chiamata di rete a ogni modifica.

⚠️ **La trappola da ricordare.** Il cron delle 04:00 riscrive ogni riga
`PretixSync` con `metaFormat: se.meta_data?.format || null`
([sync.service.ts](../src/services/sync.service.ts)). Qualunque specifica messa
in `metaFormat` sparirebbe la notte stessa. Le colonne nuove sopravvivono
**perché il sync non le nomina**: non vanno mai aggiunte a `syncData`.

## Il vocabolario

`src/constants/projectionSpecs.ts` è l'unico posto dove queste parole esistono.
Cambiare lì un'etichetta la cambia in home, nel calendario e sulle locandine.

| codice | in programmazione | al pubblico |
|---|---|---|
| `4K` | 4K | 4K |
| `DOLBY_VISION` | Dolby Vision | DOLBY VISION |
| `ATMOS` | Dolby Atmos | DOLBY ATMOS |
| `IMAX` | Versione IMAX | VERSIONE IMAX |

Più una **riga libera** (`projectionSpecsNote`, max 120 caratteri) per ciò che
il vocabolario non prevede: "copia 35mm restaurata".

Su IMAX: è un marchio registrato e indica una sala certificata. L'etichetta dice
"Versione IMAX" perché quella è la cosa vera — si proietta la versione IMAX del
film, col fotogramma più alto — senza promettere una sala che non c'è.

## Il percorso

```
programmazione (passo 3, pannello laterale)
  Pick.specs / Pick.specsNote          per film, valgono per tutte le sue repliche
       ↓ al commit, copiate su ogni spettacolo
  CommitShowInput.specs / specsNote
       ↓ commitRunner, DOPO il sync (prima le righe non esistono ancora)
  PretixSync.projectionSpecs / projectionSpecsNote
       ↓ app/page.tsx
  <ProjectionSpecs />   bollini sullo spettacolo · riga estesa sulla scheda film
```

I codici sconosciuti vengono **scartati in silenzio**
(`normalizeProjectionSpecs`): la fonte tipica è una riga vecchia in database o
un'app Swift più avanti del sito, e in nessuno dei due casi vale la pena
rifiutare uno spettacolo per un bollino che non sappiamo disegnare.

Se la scrittura delle specifiche fallisce, lo spettacolo resta creato e in
vendita: si segnala come errore riportabile, non si annulla niente.

## Film o spettacolo

Le specifiche stanno sullo **spettacolo**: lo stesso film può girare in Dolby
Vision la sera e in copia normale il pomeriggio.

Dove si parla del film e non della singola replica — la scheda in home, le
locandine — si mostra solo ciò che vale per **tutti** i suoi spettacoli
(`commonProjectionSpecs`). Una replica senza bollini azzera la promessa del
film. Promettere al pubblico una qualità che poi non trova in sala è il solo
errore che qui conta davvero.

## Le due librerie Plex

La sincronizzazione legge `Film` **e** `4K` (`PLEX_LIBRARIES`, elenco esplicito).
Lo stesso film nelle due librerie resta **una** riga di catalogo che si porta
dietro `plexLibraries: ["Film", "4K"]` — il catalogo elenca opere, non copie.

L'identità della riga (il `plexKey`) la dà sempre la libreria che viene prima
nell'elenco, anche quando è l'altra copia ad essere stata riconosciuta da Plex:
se ballasse, ballerebbe il collegamento con le proiezioni già programmate.

Dettagli e casi limite in [`scripts/plexMerge.test.mjs`](../scripts/plexMerge.test.mjs).

## Colonne aggiunte

```sql
-- scripts/sql/2026-08-07-projection-specs.sql
ALTER TABLE "PretixSync"  ADD COLUMN "projectionSpecs" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "PretixSync"  ADD COLUMN "projectionSpecsNote" text;
ALTER TABLE "CatalogFilm" ADD COLUMN "plexLibraries" text[] NOT NULL DEFAULT '{}';
```

## Cosa manca

Le specifiche si danno **alla creazione** dello spettacolo. Correggerle dopo —
"stasera l'Atmos non va" — oggi vuol dire rifare lo spettacolo. Il posto giusto
per aggiungerlo è il pannello admin della singola proiezione, accanto a lingua e
sottotitoli.
