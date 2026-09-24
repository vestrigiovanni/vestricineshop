# Gestionale Cabina — Tappa 7: pulizia

> Eseguita inline, senza fermarsi.

- Via il Pannello e `AdminPanel`/`RoomManagementModal` (fatto con la tappa 6, appena ogni funzione ha avuto una stanza).
- `components/Admin` sparisce: il recupero biglietti trasloca in `components/Cassa`.
- Nessun `alert`/`confirm` rimasto nel gestionale.
- **⌘K completo**: film in arrivo (aprono la scheda), spettacoli dei prossimi 14 giorni (aprono il tavolo sul loro giorno
  di programmazione), Riempi i buchi, Pretix, check-in. Logica pura in `dynamicCommands`, testata.
- **Correzione:** l'elenco di Film chiamava "prossima" la data dell'ultima proiezione (`lastDate`), come la vecchia Torre.
  Ora mostra la prossima vera e conta solo le proiezioni in arrivo (`nextShowing`, testata).
- La specifica è aggiornata con "Com'è andata".

Verifica finale: `tsc` pulito, 316 test verdi, lint pulito su tutti i file nuovi, nessun link a pagine tolte.
