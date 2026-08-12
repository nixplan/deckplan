# Deckplan — Anleitung für LLMs

Geschrieben von einem LLM, das dieses Brett benutzt hat, für das nächste.
Alles hier ist an der laufenden App geprüft, nicht aus dem Quelltext geraten.
Wo ich mich geirrt habe, steht es dabei — die Irrtümer sind der nützlichste
Teil.

Basis-URL: `{{BASE_URL}}`

## Was das ist

Ein virtuelles Whiteboard. Karten mit Überschrift und Zeilen, frei auf einer
Fläche von 4000x3000 platziert, dazu frei gesetzte Pfeile. Gedacht als
Denkfläche für Abläufe und Strukturen.

Der Server hält **keinen Zustand**. Er liefert statische Dateien aus und liest
und schreibt JSON-Dateien in `boards/`. Die ganze Logik läuft im Browser.
Wenn du ein Board erzeugst, erzeugst du eine JSON-Datei — mehr nicht.

## Endpunkte

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET | `/` | Das Brett (HTML für Menschen) |
| GET | `/llm-docs` | Diese Doku als Plain Text |
| GET | `/health` | Status, verweist auf `/llm-docs` |
| GET | `/api/boards` | Liste aller Boardnamen, alphabetisch |
| GET | `/api/boards/{name}` | Ein Board als JSON |
| POST | `/api/boards` | Board schreiben: `{"name": "...", "daten": {...}}` |
| DELETE | `/api/boards/{name}` | Board löschen — **endgültig, kein Papierkorb** |

Kein Auth, nur `127.0.0.1`. Das Brett soll nicht ins Netz.

Aktuell gespeicherte Boards:

```
{{BOARD_LISTE}}
```

### Boardnamen

Der Name wird zum Dateinamen und muss auf
`^[A-Za-z0-9ÄÖÜäöüß _-]{1,60}$` passen. Leerzeichen sind erlaubt, Punkte und
Schrägstriche nicht. Bei Verstoß: HTTP 400.

Beim Abrufen URL-kodieren: `GET /api/boards/Ablauf%20Warenhaus`.

## Board-Format

```json
{
  "name": "Ablauf Warenhaus",
  "karten": [
    {
      "id": "eindeutig", "x": 380, "y": 420, "b": 250,
      "farbe": "#eef7e3", "titel": "Wareneingang",
      "zeilen": [
        { "id": "eindeutig", "typ": "paar", "farbe": "", "name": "Tor", "wert": "Rampe 3" },
        { "id": "eindeutig", "typ": "text", "farbe": "", "text": "LKW anmelden" }
      ]
    }
  ],
  "pfeile": [
    { "id": "eindeutig", "x1": 638, "y1": 518, "x2": 732, "y2": 518, "farbe": "#4b5563" }
  ]
}
```

- `b` ist die Breite, Standard 250, Minimum 140. Eine **Höhe gibt es nicht** —
  siehe unten, das ist die wichtigste Stelle dieser Doku.
- `typ` ist `text` (Feld `text`) oder `paar` (Felder `name` und `wert`).
- `farbe: ""` heißt "keine Farbe", wird als weißes Feld gezeichnet.
- `id` muss nur eindeutig sein. Die App erzeugt Zufalls-IDs wie `emsqkv5qwa2ytl`;
  eigene Muster wie `edemokarte01` funktionieren genauso.
- Der Zoom steht **nicht** im JSON. Er gehört zur Ansicht, nicht zum Brett.

## Farben

Nimm nur diese Werte. Andere Hex-Codes funktionieren technisch, fallen aber
sofort aus dem Bild — die Schrift ist überall dieselbe dunkle Farbe, kräftige
Flächen machen sie unlesbar.

**Flächen** (Karten und Zeilen):
`""` · `#ffffff` · `#f2f4f7` · `#fdecec` · `#fdeee2` · `#fbf6d8` · `#eef7e3`
· `#e2f4ec` · `#e0f0f7` · `#e6e9fb` · `#efe6fb` · `#fae6f1`

**Pfeile** (dürfen kräftig sein, es sind Linien):
`#4b5563` · `#111827` · `#c0392b` · `#d97706` · `#16a34a` · `#0e7490`
· `#2563eb` · `#7c3aed` · `#db2777` · `#78716c` · `#0f766e` · `#a16207`

## Ein Board anlegen

Zwei Wege, beide gleichwertig:

```bash
# über die API
curl -X POST {{BASE_URL}}/api/boards \
  -H 'Content-Type: application/json' \
  -d '{"name":"Mein Board","daten":{"name":"Mein Board","karten":[],"pfeile":[]}}'
```

Oder die Datei direkt nach `boards/<name>.json` schreiben. Der Server liest
das Verzeichnis bei jeder Abfrage frisch — kein Neustart nötig. Beim
Dateiweg enthält die Datei nur das Board-Objekt selbst, **nicht** die
`{"name":..., "daten":...}`-Hülle des POST-Bodies.

## Die Geometrie — hier habe ich mich geirrt

**Die Kartenhöhe steht nicht im Modell.** Sie ergibt sich erst beim Zeichnen
aus der Zahl der Zeilen und deren Umbrüchen. Pfeile sind davon unabhängig:
sie haben feste Koordinaten und sind **nicht** an Karten gebunden. Wenn du
einen Pfeil zwischen zwei Karten setzen willst, musst du die Kartenhöhe
kennen — und die kannst du nicht aus dem JSON ablesen.

Ich habe sie aus dem CSS hochgerechnet und kam auf ~109 px. Real waren es
196. Die Fußleiste `+ Textblock / + Name / Wert` sitzt mit in der Karte und
zählt mit. Meine senkrechten Pfeile begannen dadurch mitten in der Karte.

Gemessene Werte bei `b: 250`:

| Karteninhalt | Höhe |
|---|---|
| 3 Zeilen, alle einzeilig umbrochen | 175 px |
| 3 Zeilen, zwei davon zweizeilig | 196 px |

Als Näherung: `Höhe ≈ 91 + 21 × Anzahl sichtbarer Textzeilen`. Sichtbar heißt
nach Umbruch — ein langer `wert` bei 250 px Breite bricht schnell auf zwei
Zeilen um und macht die Karte 21 px höher.

**Verlass dich nicht auf die Formel.** Sie ist aus zwei Messungen geraten. Der
verlässliche Weg führt über das gezeichnete DOM:

```js
[...document.querySelectorAll('.karte')].map(k => ({
  titel: k.querySelector('.titel').textContent.trim(),
  oben: k.offsetTop, hoehe: k.offsetHeight,
  unten: k.offsetTop + k.offsetHeight,
  mitteX: k.offsetLeft + k.offsetWidth / 2,
}))
```

`offsetTop`/`offsetHeight` sind Modellkoordinaten, unabhängig vom Zoom — der
läuft über ein CSS-`transform` auf dem Elternelement. Du kannst die Werte
also direkt in Pfeilkoordinaten einsetzen.

**Vorgehen, das funktioniert:** Board mit Karten und groben Pfeilen schreiben,
im Browser laden, Höhen wie oben messen, Pfeilkoordinaten korrigieren, Datei
neu schreiben, neu laden. Ein Durchgang reicht.

Rezept für die Pfeile:

- **waagerecht** zwischen zwei nebeneinanderliegenden Karten:
  `y = kartenOben + hoehe / 2`, `x1 = linkeKarte.rechts + 8`,
  `x2 = rechteKarte.links - 8`
- **senkrecht** zwischen übereinanderliegenden Karten:
  `x = karte.mitteX`, `y1 = obereKarte.unten + 8`, `y2 = untereKarte.oben - 8`

Die 8 px Luft sorgen dafür, dass die Pfeilspitze nicht unter dem Kartenrand
verschwindet.

## Layout, das lesbar wird

Bei `b: 250` sitzt eine Spalte alle 360 px — 250 Karte, 110 Luft für den
Pfeil. Reihen mit 300 px Abstand. Ein Ablauf von links nach rechts, Ausnahmen
eine Reihe darunter, Auslöser eine Reihe darüber. Farbe als Bedeutung
einsetzen und in einer Legendenkarte erklären: grau für den Hauptfluss, rot
für Ausnahmen, blau für Auslöser.

## Fallen

**Der Browser cacht `deckplan.js`.** Nach einer Änderung an der JS-Datei
lieferte der Server sofort den neuen Stand, der Browser zeigte aber weiter den
alten — inklusive altem Verhalten, das aussah wie ein Bug in meiner Änderung.
Prüfe im Zweifel gegen beide Seiten:

```js
// läuft im Browser der neue Code?
laden.toString().includes('allesZeigen')
```

Hilft ein Hard-Reload (`Cmd+Shift+R` / `Ctrl+Shift+R`). Ein normales Neuladen
reicht nicht.

**`fetch` wirft bei HTTP 404 nicht.** Ich habe einen falschen Pfad abgefragt,
die 404-Fehlerseite als Dateiinhalt durchsucht und daraus geschlossen, der
Server liefere alten Code. Immer `response.ok` prüfen.

**Der `localStorage` hält den zuletzt gesehenen Stand** unter dem Schlüssel
`deckplan:letztes`, unabhängig davon, ob gespeichert wurde. Lädst du ein
anderes Board, ist der vorherige ungespeicherte Stand weg. Vorher sichern:

```js
localStorage.getItem('deckplan:letztes')
```

**Löschen ist endgültig.** `DELETE /api/boards/{name}` entfernt die Datei
sofort. In der Oberfläche fragt der Knopf „Board loeschen" per Dialog nach,
die API fragt nicht. Ungespeicherte oder ungetrackte Boards sind danach nicht
wiederherstellbar. Was gelöscht wurde, steht in `logs/deckplan.log` — der
Log verrät den Hergang, aber nicht den Inhalt.

**Löse keine Browser-Dialoge aus,** wenn du die Seite automatisiert bedienst.
„Board loeschen" und „Leeres Brett" rufen `confirm()`. Ein offener Dialog
blockiert jede weitere Automatisierung.

## Board im Browser laden

Über das Auswahlfeld in der Leiste, per JS:

```js
const sel = document.querySelector('#leiste select');
sel.value = 'Ablauf Warenhaus';
sel.dispatchEvent(new Event('change', { bubbles: true }));
```

Das schlägt fehl, solange die Boardliste noch nicht geladen ist — ein `value`,
den es als Option nicht gibt, fällt still auf `""` zurück und es passiert
nichts. Prüfe `sel.value` nach dem Setzen, oder ruf direkt auf:

```js
await laden('Ablauf Warenhaus');
```

Nach dem Laden passt die Ansicht sich selbst ein, dasselbe tut `F1`. Du musst
dafür nichts drücken.

## Kurzcheck

1. `GET /api/boards` — was liegt schon da?
2. Board-JSON schreiben (POST oder Datei), Farben aus den Paletten oben.
3. Im Browser laden, Kartenhöhen über `offsetHeight` messen.
4. Pfeilkoordinaten nachziehen, Datei neu schreiben, neu laden.
5. Prüfen, dass kein Pfeil in einer Karte beginnt.
