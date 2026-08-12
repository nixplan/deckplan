#!/usr/bin/env bash
# Geändert? Dann in die Historie - und in die projekt.md, sofern sich damit
# das Bild vom Projekt ändert. Reine Bugfixes ändern nichts am Projekt.
#
# Deckplan starten - per Doppelklick oder ./start.sh
#
# Nimmt einem alles ab, was man sonst von Hand macht:
#   1. läuft schon ein Server? -> abräumen (macht stop.sh)
#   2. .venv da? -> sonst anlegen
#   3. Pakete aktuell? -> sonst nachinstallieren
#   4. Server starten und den Browser aufmachen
#
# Beenden mit Strg+C. Das nimmt den Server mit.
#
# Läuft unter macOS und Linux. Gebraucht wird nur ein Python 3.9 oder neuer -
# alles andere (Prüfsumme, Portabfrage, Browser) macht notfalls Python selbst,
# damit keine Systemwerkzeuge vorausgesetzt werden, die es nicht überall gibt.

set -euo pipefail

# Immer im deckplan/-Ordner arbeiten, egal von wo geklickt wurde.
cd "$(dirname "$0")"

VENV=".venv"
PORT=8600
ADRESSE="http://127.0.0.1:$PORT"
PIDDATEI=".server.pid"

# Merkzettel mit der Prüfsumme der requirements.txt. Steht sie noch so da,
# wurde seit dem letzten Lauf nichts geändert und pip darf schlafen.
MERKZETTEL="$VENV/.abhaengigkeiten"


# ── 0. Python suchen ─────────────────────────────────────────────────────
# Mal heißt es python3, mal nur python. Die Version muss stimmen: server.py
# schreibt Typangaben wie list[str], das kann erst 3.9.
SYSTEM_PYTHON=""
for kandidat in python3 python; do
  if command -v "$kandidat" >/dev/null 2>&1 \
     && "$kandidat" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
    SYSTEM_PYTHON="$kandidat"
    break
  fi
done

if [ -z "$SYSTEM_PYTHON" ]; then
  echo "Kein Python 3.9 oder neuer gefunden. Bitte Python installieren."
  exit 1
fi


# ── 1. Alten Server abräumen ─────────────────────────────────────────────
# Die Logik steht in stop.sh, damit sie nicht zweimal gepflegt werden muss.
# Bricht stop.sh ab, weil der Port festhängt, starten wir gar nicht erst.
./stop.sh


# ── 2. Virtuelle Umgebung ────────────────────────────────────────────────
# Geprüft wird auf das Python darin, nicht auf den Ordner: ein abgebrochenes
# venv hinterlässt ein leeres .venv, das sonst als "fertig" durchginge.
if [ ! -x "$VENV/bin/python" ]; then
  echo "Keine .venv - lege eine an."
  rm -rf "$VENV"
  "$SYSTEM_PYTHON" -m venv "$VENV"
fi

PYTHON="$VENV/bin/python"


# ── 3. Abhängigkeiten ────────────────────────────────────────────────────
# Prüfsumme mit Python statt shasum/sha256sum: die beiden heißen auf Mac und
# Linux verschieden, Python ist hier ohnehin da.
PRUEFSUMME="$("$PYTHON" -c \
  'import hashlib; print(hashlib.sha256(open("requirements.txt","rb").read()).hexdigest())')"

if [ ! -f "$MERKZETTEL" ] || [ "$(cat "$MERKZETTEL")" != "$PRUEFSUMME" ]; then
  echo "Pakete installieren ..."
  "$PYTHON" -m pip install --quiet --upgrade pip
  "$PYTHON" -m pip install --quiet -r requirements.txt
  echo "$PRUEFSUMME" > "$MERKZETTEL"
else
  echo "Pakete sind aktuell."
fi


# ── 4. Starten ───────────────────────────────────────────────────────────
echo "Deckplan startet auf $ADRESSE"

"$PYTHON" server.py &
SERVER=$!

# Die PID hinterlegen, damit stop.sh den Server auch ohne lsof findet.
echo "$SERVER" > "$PIDDATEI"

# Strg+C soll auch den Server treffen, nicht nur dieses Skript.
trap 'kill $SERVER 2>/dev/null || true; rm -f "$PIDDATEI"' INT TERM EXIT

# Erst den Browser aufmachen, wenn der Port wirklich antwortet - sonst landet
# man auf einer Fehlerseite und muss selbst neu laden. Gewartet wird in
# Python, weil es dafür kein Werkzeug gibt, das auf beiden Systemen liegt.
if "$PYTHON" - "$PORT" <<'PYEND'
import socket, sys, time

port = int(sys.argv[1])
frist = time.time() + 15
while time.time() < frist:
    verbindung = socket.socket()
    verbindung.settimeout(0.3)
    erreichbar = verbindung.connect_ex(("127.0.0.1", port)) == 0
    verbindung.close()
    if erreichbar:
        sys.exit(0)
    time.sleep(0.2)
sys.exit(1)
PYEND
then
  # `open` heisst auf Linux etwas voellig anderes (oeffnet eine Konsole),
  # deshalb wird es nur auf dem Mac benutzt.
  if [ "$(uname)" = "Darwin" ]; then
    open "$ADRESSE"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$ADRESSE" >/dev/null 2>&1 || true
  else
    "$PYTHON" -m webbrowser -t "$ADRESSE" >/dev/null 2>&1 \
      || echo "Browser bitte selbst aufmachen: $ADRESSE"
  fi
else
  echo "Server ist nicht hochgekommen - siehe deckplan.log"
fi

echo "Läuft. Zum Beenden: Strg+C"
wait $SERVER
