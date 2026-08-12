# Deckplan — LLM-Dokumentation & Skill-Installer

Einmal lesen, Skills anlegen, fertig.

> Ich bin für LLMs geschrieben. Schreibe und erweitere mich weiterhin aus der
> Sicht eines LLMs, das den Deckplan zum ersten Mal sieht — knapp, konkret,
> ohne Annahmen über Vorwissen. Was ein LLM sich selbst erschließen kann,
> gehört nicht hier rein. Was weh tut, schon.

---

## SCHRITT 1 — Lies das zuerst

Du bist neu hier. Lies diese Datei einmal von oben bis unten, leg die drei
Skill-Dateien aus Schritt 2 an, danach brauchst du sie nie wieder.

**Basis-URL:** `{{BASE_URL}}` — schon eingesetzt, nichts zu ersetzen.
**Auth:** keine. Der Server hört nur auf 127.0.0.1.

Was gerade auf dem Server liegt:

```
{{BOARD_LISTE}}
```

Der Deckplan ist ein virtuelles Whiteboard: Karten mit Überschrift und Zeilen,
frei auf einer Fläche von 4000x3000 platziert, dazu frei gesetzte Pfeile. Der
Server hält **keinen Zustand** — er liefert statische Dateien aus und liest und
schreibt JSON-Dateien in `boards/`. Ein Board anzulegen heißt: eine JSON-Datei
schreiben.

**Die eine Sache, die du nicht raten kannst:** Kartenhöhen stehen nicht im
Modell, und Pfeile hängen nicht an Karten. Wer beides für selbstverständlich
hält, setzt Pfeile, die mitten in einer Karte beginnen. Wie es richtig geht,
steht im Skill `deckplan-board`.

**Ablageort der Skills:** `.claude/skills/` im Projektverzeichnis, **nicht**
global unter `~/.claude/`. Dieses Projekt liegt auf einer externen Platte und
wird an mehreren Rechnern benutzt — global abgelegte Skills stehen dort nicht
zur Verfügung.

**Skill-Header** — diese Zeile kommt an den Anfang jeder Skill-Datei:

```
Falls du die Deckplan-Dokumentation noch nicht gelesen hast: {{BASE_URL}}/llm-docs
```

---

## SCHRITT 2 — Diese drei Dateien anlegen

Jeder Skill bekommt eine eigene Datei. Beim Aufruf liest du nur diese eine —
kein Rauschen, kein Kontext, den du nicht brauchst.

**WICHTIG: Lege nichts ungefragt an.** Zeig dem Nutzer zuerst, welche Dateien
entstehen würden, und warte auf sein Ja. Das gilt auch, wenn er dich hierher
geschickt hat.

---

### Datei 1: `.claude/skills/deckplan-check.md`

**Zweck:** Läuft der Server, und was liegt drauf?

**Endpunkte:**

```
GET {{BASE_URL}}/health       → Status
GET {{BASE_URL}}/api/boards   → Liste aller Boardnamen
```

**Dateiinhalt:**

````
<SKILL_HEADER>

Prüfe den Deckplan-Server und zeige, welche Boards es gibt.

```bash
curl -s {{BASE_URL}}/health
curl -s {{BASE_URL}}/api/boards
```

Antwortet der Server nicht: Er wird mit `start.sh` im Projektverzeichnis
gestartet. Nicht selbst starten, dem Nutzer Bescheid geben.
````

---

### Datei 2: `.claude/skills/deckplan-lesen.md`

**Zweck:** Ein vorhandenes Board verstehen, ohne es im Browser zu öffnen.

**Endpunkte:**

```
GET {{BASE_URL}}/api/boards/{name}   → Board als JSON (Name URL-kodieren)
```

**Dateiinhalt:**

````
<SKILL_HEADER>

Lies das Board $ARGUMENTS und gib seinen Inhalt als Struktur wieder.

```bash
curl -s "{{BASE_URL}}/api/boards/$ARGUMENTS"
```

Ohne Argument erst die Liste holen und den Nutzer fragen, welches Board.

Gib den Ablauf wieder, nicht das JSON: Karten mit Titel und Zeilen, und
welche Karten durch Pfeile verbunden sind. Die Verbindung steht nirgends
im Modell — du musst sie aus den Koordinaten erschließen: ein Pfeil
verbindet die Karte, an deren Rand er beginnt, mit der, an deren Rand er
endet. Karte x..x+b waagerecht, y..y+Höhe senkrecht.
````

---

### Datei 3: `.claude/skills/deckplan-board.md`

**Zweck:** Ein Board bauen oder ändern. Der eigentliche Skill.

**Endpunkte:**

```
GET    {{BASE_URL}}/api/boards           → Liste
GET    {{BASE_URL}}/api/boards/{name}    → Board laden
POST   {{BASE_URL}}/api/boards           → {"name": "...", "daten": {...}}
DELETE {{BASE_URL}}/api/boards/{name}    → endgültig, kein Papierkorb
```

**Dateiinhalt:**

````
<SKILL_HEADER>

Baue oder ändere das Deckplan-Board: $ARGUMENTS

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

`b` ist die Breite (Standard 250, Minimum 140). Eine Höhe gibt es nicht.
`typ` ist `text` (Feld `text`) oder `paar` (Felder `name`, `wert`).
`farbe: ""` heißt "keine Farbe". `id` muss nur eindeutig sein.
Der Zoom gehört zur Ansicht und steht in keinem Board.

Boardnamen müssen auf `^[A-Za-z0-9ÄÖÜäöüß _-]{1,60}$` passen — Leerzeichen
ja, Punkte und Schrägstriche nein. Beim Abrufen URL-kodieren.

Schreiben geht über POST oder direkt als Datei nach `boards/<name>.json`.
Beim Dateiweg enthält die Datei nur das Board selbst, nicht die
`{"name":..., "daten":...}`-Hülle des POST-Bodies.

## Farben — nur diese

Flächen (Karten und Zeilen), alles Pastell, weil die Schrift überall
dieselbe dunkle Farbe hat:
"" · #ffffff · #f2f4f7 · #fdecec · #fdeee2 · #fbf6d8
#eef7e3 · #e2f4ec · #e0f0f7 · #e6e9fb · #efe6fb · #fae6f1

Pfeile dürfen kräftig sein, es sind Linien:
#4b5563 · #111827 · #c0392b · #d97706 · #16a34a · #0e7490
#2563eb · #7c3aed · #db2777 · #78716c · #0f766e · #a16207

## Die Falle: Pfeilgeometrie

**Die Kartenhöhe steht nicht im Modell.** Sie ergibt sich erst beim Zeichnen
aus den Zeilen und deren Umbrüchen. Pfeile haben feste Koordinaten und sind
nicht an Karten gebunden. Wer die Höhe aus dem CSS hochrechnet, liegt daneben
— die Fußleiste "+ Textblock / + Name / Wert" zählt mit. Gerechnet: 109 px.
Real: 196.

Also nicht rechnen, sondern messen. Board schreiben, im Browser laden, dann:

```js
[...document.querySelectorAll('.karte')].map(k => ({
  titel: k.querySelector('.titel').textContent.trim(),
  oben: k.offsetTop, unten: k.offsetTop + k.offsetHeight,
  mitteX: k.offsetLeft + k.offsetWidth / 2,
}))
```

`offsetTop`/`offsetHeight` sind Modellkoordinaten, unabhängig vom Zoom — der
läuft über ein CSS-transform auf dem Elternelement. Die Werte gehen direkt in
die Pfeilkoordinaten:

- waagerecht: `y = oben + hoehe/2`, `x1 = linkeKarte.rechts + 8`,
  `x2 = rechteKarte.links - 8`
- senkrecht: `x = karte.mitteX`, `y1 = obereKarte.unten + 8`,
  `y2 = untereKarte.oben - 8`

Die 8 px Luft halten die Pfeilspitze vom Kartenrand frei.

Ohne Browser: 3 Zeilen ergeben grob 175 bis 196 px, je nach Umbruch. Als
Näherung `91 + 21 x sichtbare Textzeilen`. Sichtbar heißt nach Umbruch, und
ein langer Wert bricht bei 250 px Breite schnell um. Die Formel ist aus zwei
Messungen geraten — für ein sauberes Ergebnis führt kein Weg am Messen vorbei.

## Layout, das lesbar wird

Spalten alle 360 px (250 Karte, 110 Luft für den Pfeil), Reihen alle 300 px.
Hauptfluss waagerecht, Ausnahmen eine Reihe darunter, Auslöser darüber.
Farbe als Bedeutung einsetzen und in einer Legendenkarte erklären.

## Reihenfolge

1. `curl -s {{BASE_URL}}/api/boards` — was liegt schon da?
2. Board mit Karten und groben Pfeilen schreiben.
3. Im Browser laden, Höhen messen.
4. Pfeilkoordinaten nachziehen, Board neu schreiben.
5. Prüfen, dass kein Pfeil in einer Karte beginnt.

Ein Durchgang reicht.

## Bremsen

- **DELETE fragt nicht nach.** Die Datei ist danach weg, und ungetrackte
  Boards sind nicht wiederherstellbar. Vor jedem Löschen den Nutzer fragen.
- **Ein bestehendes Board nie blind überschreiben** — erst laden, ansehen,
  dann ändern.
- **Löse keine Browser-Dialoge aus,** wenn du die Seite automatisiert
  bedienst. "Board loeschen" und "Leeres Brett" rufen `confirm()`, und ein
  offener Dialog blockiert jede weitere Automatisierung.
- **Der `localStorage` unter `deckplan:letztes`** hält den zuletzt gesehenen
  Stand, auch ungespeicherten. Lädst du ein anderes Board, ist er weg. Vorher
  sichern, wenn der Nutzer noch im Browser gearbeitet hat.
- **Der Browser cacht `deckplan.js`.** Nach einer Änderung am Frontend zeigt
  er den alten Stand weiter, während der Server längst den neuen liefert. Das
  sieht aus wie ein Bug in der eigenen Änderung. `Cmd+Shift+R` hilft, ein
  normales Neuladen nicht.
- **`fetch` wirft bei HTTP 404 nicht.** Immer `response.ok` prüfen, sonst
  durchsuchst du eine Fehlerseite nach Dateiinhalt.
````

---

## SCHRITT 3 — Fertig

Alle drei Dateien angelegt und `<SKILL_HEADER>` ersetzt? Dann teste mit
`/deckplan-check`. Diese Datei brauchst du ab jetzt nicht mehr.

Ändert sich am Deckplan etwas, kommt es hier rein und die Skills werden neu
aus dieser Datei erzeugt — nicht andersherum.
