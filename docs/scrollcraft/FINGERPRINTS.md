# Fingerprints

Every site you build with **scroll-craft** gets one row here, appended after it
ships. The registry exists so your next build can prove it is a different page
rather than a re-skin of one you already made.

This file is **yours**. It starts empty on purpose: the gate is about not
repeating *yourself*, so it has nothing to say until you have built something.

The rules and the gate live in the skill's
`references/uniqueness.md`. Short version:

**A new build must differ from EVERY row below on at least 4 of the 6
dimensions.** Four against each row individually, not four on average across the
table. If a planned build fails, change the plan. Never edit a row to make room
for it.

The six dimensions are: **grammar**, **nav treatment**, **hero device**,
**act-sequence shape**, **close pattern**, **signature move**.

Dimension 6 is free, because a signature move is unique by definition. So the
gate really asks for three more out of the remaining five, and a build that
changes only grammar and world will fail it.

---

## The registry

| Build | Grammar | Nav treatment | Hero device | Act-sequence shape | Close pattern | Signature move | World | Port |
|---|---|---|---|---|---|---|---|---|
| vestri-sala (home di Vestri Cinema, 26 ott 2026) | Galleria / catalogo, con la cadenza che accelera | Barra fissa stile Apple: nome della sala, film in vista (apre l'indice di tutti i film, che salta), Programma, Prenota del film in vista | Fondale che sale dal nero, a tre piani (fondale lontano che si chiude in cornice, locandina vicina più veloce, testo fermo) | pin a strati → pin a dissolvenza → pan di locandine → flow di silenzio → pin del trailer (il più lungo, 3.6) → fasce flow con tendine sempre più strette → flow del programma; 7 atti, ~19 schermi con 13 film (cresce coi film) | Il programma intero: tutte le locandine e la settimana a righe, ogni riga col suo Prenota; resta | La luce del film: la stanza (fondo, accento, Prenota, barra del browser, luce d'ambiente sfocata) prende il colore misurato sul fondale del film in vista; buio prima del trailer, tutti i colori in fondo | Metadati TMDB veri, nessun mondo generato | Next.js (`src/components/Home`) |

---

## What is taken

Add a bullet here whenever a build claims something a later build should avoid
reusing: a grammar, a nav treatment, a close pattern, a signature move, an
act-count-and-length band. The shared columns are what the next build inherits
as a constraint, so writing them down is the whole point.

- **Galleria / catalogo** come grammatica (vestri-sala).
- **La luce del film**: la stanza ricolorata dal colore misurato sull'immagine dell'oggetto in vista (vestri-sala).
- **Trailer YouTube muto che parte prima di arrivare, cresce da cornice a tutto schermo e si ferma** come picco (vestri-sala).
- **Barra Apple col Prenota dell'oggetto in vista** (vestri-sala).

---

## Appending a row

After shipping, add one line to the table and one bullet to **What is taken** if
the build claimed something new. Fill every column. Say what the build shares
with existing rows.

Rows are append-only. A build that has been superseded stays in the table,
because the space it occupies is still occupied.

---

## Worked example

The skill's author kept a registry of twelve builds across eight page grammars.
If you want to see what a filled-in table looks like, and which shapes tend to
collide, read `EXAMPLES.md` in the scroll-craft repository. Treat it as
illustration only: those rows are somebody else's builds and they do **not**
constrain yours.
