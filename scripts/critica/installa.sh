#!/bin/zsh
# Crea (o ricrea) l'app «Critica dal trailer» in ~/Desktop/code/VestriCinema.
# L'app non si apre a mano: la apre il tasto «Critica dal trailer» della stanza
# Speciale, con un indirizzo vestricritica://leggi?tmdb=…&sito=… . Lei lancia
# scripts/critica-dal-trailer.mjs in sottofondo; il registro è in
# ~/Library/Logs/critica-dal-trailer.log.
set -e
QUI="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$HOME/Desktop/code/VestriCinema/Critica dal trailer.app"
SORGENTE="$(mktemp -d)/critica.applescript"

cat > "$SORGENTE" <<EOF
on open location indirizzo
	set comando to "cd " & quoted form of "$QUI" & " && node scripts/critica-dal-trailer.mjs --url " & quoted form of indirizzo & " >> \$HOME/Library/Logs/critica-dal-trailer.log 2>&1 &"
	do shell script "/bin/zsh -lc " & quoted form of comando
end open location

on run
	display dialog "«Critica dal trailer» si usa dalla stanza Speciale del gestionale: il tasto «Critica dal trailer» la apre da sola." buttons {"Va bene"} default button 1 with title "Critica dal trailer"
end run
EOF

rm -rf "$APP"
osacompile -o "$APP" "$SORGENTE"
PL="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.vestricinema.critica" "$PL" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.vestricinema.critica" "$PL"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$PL"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$PL"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string Critica dal trailer" "$PL"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PL"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string vestricritica" "$PL"
# Senza interfaccia: niente icona nel Dock mentre lancia il lavoro.
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PL"
codesign --force --deep -s - "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
echo "Pronta: $APP"
