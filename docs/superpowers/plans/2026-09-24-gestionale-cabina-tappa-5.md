# Gestionale Cabina — Tappa 5: la Cassa

> Eseguita inline, senza fermarsi. La cassa è la schermata del banco: si cambia il vestito, non i gesti.

## Cosa cambia
- **Tavolozza, non disposizione.** `CassaInterface.module.css` (1.641 righe) passa ai colori Cabina con una mappatura
  colore per colore: viola → ambra, ardesia → nero caldo, verde → salvia, rosso → ruggine. Font dalla cabina: titoli
  in serif, orari in mono ambra. Restano identici layout, tasti e scorciatoie che le mani conoscono.
- **Avvisi di età intatti.** Il giallo VM14 e il rosso VM18 restano quelli: al banco devono saltare all'occhio.
- **Niente finestre del browser.** Gli 8 `alert`/`confirm` diventano avvisi Cabina; il prezzo zero chiede conferma in
  una finestra ("Scontrino di cortesia").
- **Invio non vende due volte.** Le scorciatoie del banco tacciono quando c'è una finestra aperta.
- **Recupero biglietti al banco.** Esce dal Pannello e sta nella barra della cassa, con la stessa tavolozza. Le regole
  di stampa (termico, souvenir) restano nero su bianco.
- **Un solo biglietto termico.** Via `components/ThermalTicket.tsx`, che non importava nessuno: resta quello della cassa.
- Il layout della cassa non forza più il suo sfondo: la cassa vive sotto la barra sottile della cabina.

## Fuori
Il biglietto PDF (`TicketPDF`) serve anche al sito pubblico: appartiene al progetto "display e biglietti".
