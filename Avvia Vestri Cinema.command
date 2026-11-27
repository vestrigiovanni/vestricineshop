#!/bin/zsh
# Avvia il sito Vestri Cinema (v2) sul Mac e apre il browser.
cd "$(dirname "$0")"
PORTA=3010
URL="http://localhost:$PORTA"
LOG="$PWD/avvio.log"

if curl -s -o /dev/null "$URL"; then
  echo "Vestri Cinema è già acceso."
  open "$URL"; exit 0
fi

# Le librerie la prima volta, o se package.json è più nuovo dell'installazione
if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ]; then
  echo "Installo le librerie (la prima volta ci vuole un minuto)…"
  if ! npm install >>"$LOG" 2>&1; then
    osascript -e 'display alert "Vestri Cinema" message "Installazione non riuscita. Guarda avvio.log nella cartella."'
    exit 1
  fi
fi

echo "Accendo Vestri Cinema su $URL …"
npx next dev -p $PORTA >>"$LOG" 2>&1 &
SERVER=$!

for i in {1..120}; do
  if curl -s -o /dev/null "$URL"; then open "$URL"; break; fi
  if ! kill -0 $SERVER 2>/dev/null; then
    osascript -e 'display alert "Vestri Cinema" message "Il sito non è partito. Guarda avvio.log nella cartella."'
    exit 1
  fi
  sleep 0.5
done

echo "Acceso. Chiudi questa finestra (o premi Ctrl-C) per spegnerlo."
wait $SERVER
