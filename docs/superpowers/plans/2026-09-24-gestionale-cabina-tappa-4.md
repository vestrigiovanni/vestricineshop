# Gestionale Cabina — Tappa 4: Film e Catalogo

> Eseguita inline, senza fermarsi, su richiesta di Giovanni ("vai e non ti fermare"). Il piano qui registra
> compiti e decisioni; il codice sta nei file e nei commit. La logica pura ha i suoi test, scritti prima.

## Stanza Film (`/admin/film`, ex Torre di controllo / movies-control)

| Prima | Dopo |
|---|---|
| `page.tsx` da 862 righe, tutto in un file | `_film/`: `FilmRoom` (elenco + stato), `FilmEditor` (scheda), `form.ts` (logica pura, 8 test), `AssetField`, `MediaPicker`, `ToolsDialog`, `QuickLook` |
| `ImagePickerModal` + `TrailerPickerModal` | un solo `MediaPicker` (locandina, sfondo, logo, trailer) |
| `VisualControlCenter` + `VisualAssetCard` | `QuickLook` ("Colpo d'occhio"), stesso salvataggio automatico dei delta |
| Popolamento in due posti (header + estetica rapida, per due strade diverse) | uno solo, in Strumenti, con le due modalità dette chiaramente |
| 15 `alert`/`confirm` | avvisi e finestre Cabina |

Nuovo:
- Salva si accende solo con modifiche;
- cambiare film con modifiche aperte chiede prima;
- "Personalizzati" apre la scheda, non solo la cancella;
- si può scrivere il titolo del trailer anche dalla scheda, non solo dall'estetica rapida;
- `?tmdb=` apre subito la scheda.

## Stanza Catalogo (`/admin/catalogo`, ex finestra del Pannello)

Tutte le funzioni di `CatalogBrowser` + `CatalogPreview` in `_catalogo/`:
- ricerca e filtri: genere, decennio, regista, ordine, mai programmati, da verificare;
- Sorprendimi;
- aggiunta per id TMDB;
- importazione con avanzamento (CSV → TMDB → schede);
- anteprima laterale con "Sì, è lui", correzione dell'id TMDB, "Togli dal catalogo".

In più: "Programma" porta al tavolo con i posti accesi, e "Scheda film" porta a Film.

## Codice morto tolto

`TMDBSearch` ed `EventList` non erano importati da nessuno. `CatalogBrowser` sostituito dalla stanza.
