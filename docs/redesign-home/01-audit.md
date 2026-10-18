# Rivoluzione della home — passo 2: l'audit

18 ottobre 2026, ramo `home-rivoluzione`. Home aperta in modalità vetrina (sync spento)
a 1440 × 900 e 390 × 844, dati veri di Neon letti in sola lettura.

## La visione di Gio, in sei regole

Dalle sue parole: caratteri eleganti; i loghi dei festival presenti e grandi quando
serve (la Palma d'oro); ogni metadato deve stupire per la sua bellezza, dal poster al
logo ai fondali; fondali che si animano scorrendo e compongono disegni sempre diversi,
cuciti sui film in sala; ogni giorno un sito diverso, perché cambiano i dati.

Tradotto in regole di progetto:

1. **Il sito è generativo, non impaginato.** La composizione nasce dai dati del giorno:
   quali film, quali premi, quanti posti, che colori hanno i loro fondali. Due giorni
   diversi devono dare due pagine diverse senza che nessuno tocchi niente.
2. **Il premio vero vince sul festival.** "Vincitore: Palma d'oro" merita il logo a tutto
   schermo; "Selezione ufficiale" merita una riga. La scala dipende dal peso del premio.
3. **Ogni dato ha una forma sua.** Il logo TMDB è un titolo di testa, la durata è un
   tempo, i posti liberi sono una sala che si riempie, le specifiche (4K, Atmos) sono
   una targhetta da cabina. Niente dato in un'etichetta grigia uguale alle altre.
4. **I fondali sono la materia.** Si muovono, si tagliano, si accostano mentre scorri.
   Mai testo sopra un volto.
5. **Un solo carattere elegante, usato con coraggio**, più il mono per i dati.
6. **Il telefono è il formato principale**, non la versione ridotta.

## I numeri di oggi

| | Desktop 1440 | Telefono 390 |
|---|---|---|
| Altezza pagina | 16.699 px (18,5 schermate) | 13.264 px (15,7 schermate) |
| Immagini nella pagina | 163 | 133 (12 caricate subito) |
| Caratteri in uso | Fraunces, Inter, JetBrains Mono | il testo corrente è in JetBrains Mono |

In programma da oggi al 24 ottobre: 23 film, 6 spettacoli al giorno.

## Cosa funziona già (da tenere)

- **I loghi TMDB dei film.** Sono la cosa più bella della pagina: *Drugstore Cowboy*,
  *Paranoid Park*, *Licorice Pizza*, *Beau Travail* hanno ciascuno la propria tipografia
  d'epoca. Il sito più "personalizzato sui film" nasce già da qui.
- **Il tabellone a palette** (`TextFlippingBoard`): un'idea con carattere.
- **Le strisce di fondali tagliati** (*Mysterious Skin* / *Paranoid Park*): la prima
  volta che i fondali compongono un disegno. È il seme della visione di Gio.
- **I premi nel database sono ricchi**: per *Anora* c'è scritto "Vincitore: Palma d'oro",
  per *Bones and All* "Silver Lion for Directing", per *Sirāt* "Premio della giuria".
- **I loghi dei festival** in `public/logos/` sono quasi tutti 2000 × 2000: reggono
  il formato gigante (David e Locarno sono 500 × 500, vanno bene fino a mezzo schermo).

## Cosa non funziona

### Gerarchia e ritmo
- **Troppo lunga.** 18 schermate su desktop. La stessa programmazione compare tre volte:
  tabellone nell'hero, calendario della settimana, tabellone a palette in fondo.
- **Capitoli che non dicono niente di nuovo.** Il muro di titoli in testo (*Brazil*,
  *Close*, *Die My Love*) ripete nomi già visti; le statistiche (23 · 45 · 47 · 85)
  sono numeri senza racconto.
- ***The Brown Bunny* occupa da solo circa 1.400 px di scroll** su un'unica immagine.

### Metadati che non stupiscono
- **I festival sono il punto più debole rispetto alla visione.** La sezione "Dai festival
  alla nostra sala" mostra il logo piccolo e una griglia di locandine minuscole. Una
  Palma d'oro e una "selezione ufficiale" hanno lo stesso peso visivo.
- **Il premio vero non si vede.** Nell'hero c'è solo "C.I.C.A.E. Award (Forum) · 1990"
  in mono piccolo; la Palma d'oro di *Anora* non compare in nessun punto grande.
- **I titoli dei film appaiono in tre caratteri diversi** (Fraunces, Inter, contorno
  oro su *Alpha*), mentre il logo TMDB vero è altrove. Il film ha già il suo carattere:
  il sito ne inventa altri.
- **Lingue mescolate nei premi:** "Best Leading Actress", "Silver Lion for Directing",
  "TFCA Award - Best Picture" accanto a "Miglior film".

### Leggibilità
- **Loghi che spariscono sul fondale:** *Drugstore Cowboy* viola su muro chiaro (telefono),
  *Sirāt* rosso su rosso (telefono), un logo nero sul nero del muro dei loghi (desktop).
- **Logo sopra il volto:** *Licorice Pizza* in mezzo a un volto, a tutto schermo
  sul telefono.
- **Fondali sgranati sul telefono:** il taglio verticale ingrandisce un'immagine
  orizzontale e si vede la compressione.
- **Il testo lungo in mono sul telefono** stanca: il mono va bene per i dati, non per
  le sinossi.

### Identità e generico
- **Inter** è il carattere più comune del web: va tolto.
- **Fraunces su nero con accento oro** è elegante ma è anche la combinazione che la
  ricerca indica come cliché delle interfacce fatte con l'IA. Decisione di gusto: tocca a Gio.
- Il titolo della scheda del browser è ancora «VESTRICINEMA | The Ultimate Cinema
  Experience».

## Inventario dei metadati (film in programma)

| Dato | Quanti film lo hanno | Nota |
|---|---|---|
| Logo TMDB | 23 / 23 | la risorsa più forte |
| Poster, fondale principale | 23 / 23 | |
| Premi con dettaglio | 23 / 23 | tipo, anno, "Vincitore: …" / "Candidatura: …" |
| Regia, cast, durata, anno | 23 / 23 | |
| Trailer | 23 / 23 | fino a 12 per film |
| Sinossi | 23 / 23 | da 180 a 930 caratteri |
| Lingua della proiezione | 23 / 23 | |
| Specifiche di proiezione (4K, Dolby Vision, Atmos) | 3 / 23 | |
| Posti liberi / totali | pochi, quasi tutti a zero | il sync li aggiorna a richiesta |
| **Fondali extra** | **0 / 23** | |
| **Tagline** | **0 / 23** | |
| **Generi** | **0 / 23** | |
| **Voto medio** | **0 / 23** | |

Gli ultimi quattro campi esistono nello schema e il codice di sync li sa riempire da
TMDB, ma su tutti i 23 film del catalogo sono vuoti. Per la visione di Gio pesano
soprattutto i **fondali extra**: oggi ogni film ha una sola immagine, quindi i "disegni
sempre diversi" avrebbero poco materiale.

Due strade, da decidere con Gio:
- **A.** Riempire quei campi nel catalogo con un aggiornamento dei metadati da TMDB.
  Scrive nel database condiviso: si fa solo con il suo ok, e in un momento scelto.
- **B.** Leggere i fondali extra da TMDB al momento, lato server, con una cache, senza
  scrivere nel database. Più lento al primo caricamento, nessun rischio sui dati.

Un'idea che non richiede dati nuovi: **il colore di ogni film** estratto dal suo fondale
(come fa MUBI), calcolato lato server e messo in cache. È quello che rende "diverso ogni
giorno" anche lo sfondo, le linee e l'accento.

## Le 10 cose da cambiare, in ordine di impatto

1. **Composizione generata dai dati del giorno**: ordine, scala e accostamenti decisi
   dai film in sala, dai premi e dai colori dei fondali.
2. **Premi in scala col loro peso**: logo del festival gigante per i vincitori dei premi
   maggiori, una riga elegante per le selezioni.
3. **Il logo TMDB come unico titolo del film**, ovunque; via i titoli in Fraunces/Inter.
4. **Fondali in movimento come materia grafica**: tagli, strisce, accostamenti che si
   ricompongono mentre scorri; fuori i volti dal testo.
5. **Una pagina lunga la metà**: una sola programmazione, 6–7 momenti invece di 12.
6. **Nuova coppia di caratteri**: via Inter; display elegante deciso da Gio; mono solo
   per i dati.
7. **Leggibilità garantita dei loghi**: velatura o fondo calcolati sul contrasto reale
   del logo con l'immagine.
8. **Ogni metadato con una forma sua** (durata, lingua, specifiche, posti, regia).
9. **Telefono come formato principale**: fondali tagliati per il verticale, al massimo
   circa 25 immagini al primo caricamento, movimento CSS leggero.
10. **Fondali extra e colore del film** (strada A o B sopra).
