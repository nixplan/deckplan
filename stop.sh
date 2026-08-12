#!/usr/bin/env bash
# Geändert? Dann in die Historie - und in die projekt.md, sofern sich damit
# das Bild vom Projekt ändert. Reine Bugfixes ändern nichts am Projekt.
#
# Deckplan anhalten - per Doppelklick oder ./stop.sh
#
# Für den Fall, dass kein Fenster mehr offen ist, in dem man Strg+C drücken
# könnte. Läuft nichts, sagt es das und tut nichts.
#
# Läuft unter macOS und Linux. Wird auch von start.sh benutzt, um einen alten
# Server abzuräumen - deshalb steht die Logik nur hier und nicht zweimal.

set -euo pipefail

cd "$(dirname "$0")"

PORT=8600
PIDDATEI=".server.pid"


# ── Wen müssen wir abschießen? ───────────────────────────────────────────

# Lebt der Prozess noch? Signal 0 tötet nichts, es fragt nur nach.
lebt() { kill -0 "$1" 2>/dev/null; }

# Wer hört auf dem Port? Je nach System gibt es dafür ein anderes Werkzeug -
# und auf manchen Linux-Installationen keines davon. Deshalb ist das hier
# nur die Zusatzsuche; der verlässliche Weg ist die PID-Datei von start.sh.
hafen() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | awk -v hafen=":$PORT\$" '$4 ~ hafen' \
      | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser -n tcp "$PORT" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true
  fi
}

# PID-Datei plus Hafensuche, doppelte raus.
kandidaten() {
  {
    if [ -f "$PIDDATEI" ]; then
      gemerkt="$(cat "$PIDDATEI" 2>/dev/null || true)"
      if [ -n "$gemerkt" ] && lebt "$gemerkt"; then echo "$gemerkt"; fi
    fi
    hafen
  } | sort -u
}


# ── Abräumen ─────────────────────────────────────────────────────────────

PIDS="$(kandidaten)"

if [ -z "$PIDS" ]; then
  rm -f "$PIDDATEI"          # alte Notiz von einem längst toten Server
  echo "Läuft kein Deckplan auf Port $PORT."
  exit 0
fi

# Unquotiert: die Zeilenumbrueche werden dabei zu einzelnen Leerzeichen.
echo "Beende Deckplan (PID $(echo $PIDS)) ..."
kill $PIDS 2>/dev/null || true

# Kurz Zeit zum Aufräumen geben. Kein `seq` - das fehlt auf schmalen Systemen.
versuch=0
while [ "$versuch" -lt 20 ]; do
  [ -z "$(kandidaten)" ] && break
  sleep 0.25
  versuch=$((versuch + 1))
done

# Stellt sich quer? Dann mit Nachdruck.
PIDS="$(kandidaten)"
if [ -n "$PIDS" ]; then
  echo "Reagiert nicht - härter."
  kill -9 $PIDS 2>/dev/null || true
  sleep 0.5
fi

rm -f "$PIDDATEI"

if [ -z "$(kandidaten)" ]; then
  echo "Gestoppt."
else
  echo "Port $PORT ist immer noch belegt - da hängt etwas fest."
  exit 1
fi
