# Gestionale Cabina — Tappa 6: Sale, Display, Attrezzi (e il Pannello se ne va)

> Eseguita inline, senza fermarsi. Con questa tappa ogni funzione del vecchio pannello ha la sua stanza.

| Funzione del Pannello | Dove sta adesso |
|---|---|
| Sala predefinita (menu in alto) | **Sale** — "Rendi predefinita", la legge il tavolo |
| Gestisci sale (finestra) | **Sale** — nomi, preferite, nascoste, "Rileggi da Pretix", "Nascondi tutte", sala nuova |
| Info on screen (preroll) | **Display** — preroll ricordato su questo computer, "Lancia il display" in scheda nuova, anteprima dal database |
| Apri cassa, Recupero biglietti | **Cassa** (tappa 5) |
| Torre di controllo | **Film** (tappa 4) |
| Catalogo | **Catalogo** (tappa 4) |
| Programmazione attuale: sposta, elimina, disponibilità, replica | **Programma**, il tavolo (tappa 3) |
| Elimina film e tutte le repliche | **Programma** — "Elimina tutte le N repliche in vista", con la rete dei biglietti venduti |
| Pulizia proiezioni vuote (tutto il futuro) | **Attrezzi** — una per una o tutte, con la stessa rete |
| Link a Pretix e al check-in | **Attrezzi** (e Pretix anche sul tavolo) |
| Sync tutto esaurito, premi, popolamento (erano anche in Film) | **Attrezzi**, in un posto solo |

Via: `AdminPanel` (795 righe + 40 KB di CSS), `RoomManagementModal`, la pagina `/admin/pannello` (che ora
reindirizza a Oggi), il `ToolsDialog` di Film.

**Attrezzi** non è fra le linguette: si apre dall'icona a chiave inglese accanto alla ricerca, da ⌘K e, sul telefono,
dal foglio "Altro".

**Da sistemare a parte (segnalato):** alias, preferite e sale nascoste stanno in un file in `/tmp`, che su Vercel è
effimero. Va spostato nel database.
