**One-Shot:** Entstanden auf Basis eines einfachen Pormpts in knapp 45 Minuten.
Hilfsmittel: Ein Gerüst an universellen Regeln, Vorgaben, Style-Guides und 
Standard-Tests für den Agenten.

Ab hier alles 1 zu 1 die Ausgabe vom LLM.

--- 

# Deckplan

Virtuelles Whiteboard. Karten mit Überschrift und beliebig vielen Zeilen,
frei auf einem Canvas verschiebbar, dazu frei setzbare Pfeile. Gedacht als
Denkfläche für den Umbau des Stempelsystems - dafür war das echte Whiteboard
zu klein.

**Eigenständig.** Kein Teil des Schaltwerks: kein Import aus `config/` oder
`helpers/`, eigener Port, eigener Log. Wer `deckplan/` löscht, löscht die
ganze Anwendung und sonst nichts.

## Starten

`start.sh` doppelklicken. Sonst nichts.

Das Skript räumt einen alten Server auf Port 8600 ab, legt bei Bedarf ein
`.venv` an, installiert die Pakete falls nötig, startet den Server und macht
den Browser auf.

## Stoppen

`Strg+C` im Fenster, in dem `start.sh` läuft. Ist das Fenster schon zu:
`stop.sh` doppelklicken. Läuft gerade nichts, sagt es das und tut nichts.

Von Hand geht es weiter wie bisher:

```
python deckplan/server.py
```

Dann im Browser: <http://127.0.0.1:8600>

Öffnet der Doppelklick einen Editor statt eines Terminals, ist im Finder eine
andere App für `.sh` hinterlegt. Dann einmal Rechtsklick → *Öffnen mit* →
*Terminal*, oder die Datei in `start.command` umbenennen - die reicht macOS
immer ans Terminal durch. Unter Linux fragt der Dateimanager beim Doppelklick
meist nach; dort *Im Terminal ausführen* wählen.

### macOS und Linux

Beide Skripte laufen auf beiden Systemen. Vorausgesetzt wird nur **Python 3.9
oder neuer** - `python3` oder `python`, beides wird gesucht und die Version
geprüft. Windows ist nicht vorgesehen.

Alles andere macht notfalls Python selbst, weil die üblichen Systemwerkzeuge
auf Mac und Linux verschieden heißen oder ganz fehlen:

| Aufgabe               | statt                        | wir nehmen                            |
|-----------------------|------------------------------|---------------------------------------|
| Prüfsumme             | `shasum` / `sha256sum`       | `hashlib` in Python                   |
| warten auf den Port   | `curl` / `nc`                | ein `socket` in Python                |
| Browser öffnen        | `open` / `xdg-open`          | erst die passende, sonst `webbrowser` |
| laufenden Server finden | `lsof` / `ss` / `fuser`    | `.server.pid`, die Werkzeuge nur zusätzlich |

`open` heißt unter Linux etwas völlig anderes (öffnet eine Textkonsole) und
wird deshalb nur auf dem Mac benutzt.

**Der verlässliche Weg zum laufenden Server ist `.server.pid`**, geschrieben
von `start.sh`. `lsof`, `ss` und `fuser` werden zusätzlich befragt, falls
vorhanden - so wird auch ein von Hand gestarteter Server gefunden. Auf einem
System ohne alle drei reicht die PID-Datei allein.

Die Stopp-Logik steht nur in `stop.sh`. `start.sh` ruft sie auf, statt sie
ein zweites Mal zu enthalten.

### Warum eine eigene requirements.txt

`deckplan/requirements.txt` listet dieselben drei Pakete (`fastapi`,
`uvicorn`, `pydantic`), die auch oben im Projekt stehen. Doppelt, aber
absichtlich: der Deckplan soll für sich allein lauffähig sein, und sein
`.venv` soll nicht den ganzen Projektstapel mitziehen. Neue Pakete kommen
dadurch keine ins Projekt.

`start.sh` merkt sich die Prüfsumme dieser Datei in `.venv/.abhaengigkeiten`.
Ändert sie sich, installiert der nächste Start nach - sonst überspringt er
`pip` und startet sofort.

## Bedienung

| Was                        | Wie                                                     |
|----------------------------|---------------------------------------------------------|
| Karte anlegen              | `+ Karte` in der Leiste                                 |
| Karte verschieben          | irgendwo auf die Karte fassen (nicht in ein Textfeld)   |
| Karte breiter/schmaler     | rechte Kante ziehen                                     |
| Text ändern                | in das Feld klicken und tippen                          |
| Zeile anhängen             | `+ Textblock` oder `+ Name / Wert` am Kartenfuß         |
| Zeile umsortieren          | ▲ / ▼ an der Zeile                                      |
| Farbe (Karte oder Zeile)   | ● an Karte oder Zeile, dann Pastellton wählen           |
| Löschen                    | ✕ an Karte oder Zeile, oder Auswahl + `Entf`            |
| Pfeil anlegen              | `+ Pfeil` in der Leiste                                 |
| Pfeil drehen/verlängern    | Pfeil anklicken, dann an einem der Endpunkte ziehen     |
| Pfeil verschieben          | Pfeil in der Mitte anfassen                             |
| Auswählen                  | einmal draufklicken                                     |
| Farbe der Auswahl          | `Leertaste` - Palette am Mauszeiger, nochmal = wieder zu |
| Auswahl löschen            | Rechtsklick darauf (oder `Entf`)                        |
| Mehrere auswählen          | Rahmen über leere Fläche ziehen, oder Shift+Klick       |
| Gemeinsam verschieben      | eine der markierten Karten ziehen                       |
| Rückgängig                 | `Strg+Z` (bzw. `Cmd+Z`)                                 |
| Alles abwählen             | `Esc` - schließt auch die Palette und verlässt das Feld |
| Zoomen                     | Scrollrad - genau auf den Punkt unter dem Zeiger        |
| Ansicht schieben           | `Leertaste` halten (ohne Auswahl) + linke Maustaste     |
| Alles ins Bild holen       | `F1`                                                    |

Der Pfeil hat keine eigene kleine Knopfleiste mehr. Sie schwebte über der
Seite, ging beim Scrollen nicht mit und blieb dann in der Ecke kleben.
Farbe und Löschen laufen jetzt für Karten und Pfeile über dieselben zwei
Griffe: `Leertaste` und Rechtsklick.

Rechtsklick auf eine markierte Gruppe räumt die ganze Gruppe ab. In
Textfeldern und auf leerer Fläche bleibt das normale Browser-Menü.

Bei gemischter Auswahl aus Karten und Pfeilen färbt die `Leertaste` nur die
Karten - Flächen wollen Pastell, Linien wollen kräftig, eine Palette kann
nicht beides.

Die `Leertaste` macht zweierlei, je nachdem ob etwas ausgewählt ist: mit
Auswahl den Farbwähler, ohne Auswahl das Schieben der Ansicht. Beim Tippen
keins von beidem - da ist ein Leerzeichen ein Leerzeichen.

### Zoom

Das Scrollrad zoomt von 25 % bis 300 %. Es rollt damit nicht mehr - geschoben
wird mit `Leertaste` plus Maustaste oder über die Rollbalken. `F1` legt die
Ansicht so, dass alles aufs Bild passt.

Beim Laden eines Boards und beim Öffnen der Seite passiert das von selbst -
man muss `F1` nicht von Hand drücken. Ein geladenes Board liegt sonst
irgendwo auf den 4000x3000 und man sucht es erst mit den Rollbalken. Nur auf
einem leeren Brett gibt es nichts einzupassen, da startet die Ansicht wie
bisher in der Mitte.

Der Zoom gehört zur Ansicht, nicht zum Brett: er wird **nicht gespeichert**
und steht in keinem Board-JSON. Alle Koordinaten im Modell bleiben ungezoomt,
ein Board sieht bei jedem Zoom gleich aus.

## Speichern

`Speichern` schreibt das ganze Board als JSON nach `boards/<boardname>.json`.
Der Boardname ist der Dateiname - erlaubt sind Buchstaben, Ziffern, Umlaute,
Leerzeichen, `-` und `_`.

Nebenher liegt der jeweils letzte Stand im `localStorage` des Browsers. Das
ist nur ein Netz für abgestürzte Tabs, kein Ersatz fürs Speichern: es hängt
am Browser, nicht an der Platte.

## Log

`logs/deckplan.log` protokolliert Start, Laden, Speichern und Löschen - mehr nicht.

Bei 1 MB rutscht alles eine Stelle weiter: `.2` wird `.3`, `.1` wird `.2`,
`deckplan.log` wird `.1` - und der bisherige `.3` fällt hinten raus. Es liegen
nie mehr als drei alte Stände da, zusammen also höchstens gut 4 MB. Aufräumen
muss man nichts.

```
logs/
├── deckplan.log      läuft gerade voll
├── deckplan.log.1    der vorherige Stand
├── deckplan.log.2
└── deckplan.log.3    der älteste - fällt beim nächsten Mal raus
```

Die Zahlen stehen in `server.py` als `LOG_MAX_BYTES` und `LOG_KOPIEN`. Den
Ordner legt der Server beim Start selbst an, wenn er fehlt.

## Aufbau

```
deckplan/
├── start.sh             Doppelklick-Start: .venv, Pakete, Server, Browser
├── stop.sh              Hält den Server an, wenn kein Fenster mehr offen ist
├── requirements.txt     Nur die drei Pakete, die der Deckplan selbst braucht
├── server.py            Mini-Server: Dateien ausliefern, boards/ lesen und schreiben
├── boards/              Gespeicherte Boards, ein JSON pro Board
├── logs/                Eigener Log, rotiert bei 1 MB, drei alte Stände
├── .venv/               Wird von start.sh angelegt, nicht im Git
├── .server.pid          PID des laufenden Servers, nur solange er läuft
└── static/
    ├── index.html       Gerüst: Leiste, Zoom-Hülle, Brett, SVG-Ebene
    ├── deckplan.css     Helles Layout, eine Textfarbe auf allen Pastellflächen
    ├── deckplan.js      Der ganze Rest
    └── llm_docs.md      Anleitung für LLMs, ausgeliefert unter /llm-docs
```

### Anleitung für LLMs

`GET /llm-docs` gibt `static/llm_docs.md` als Plain Text aus - Board-Format,
die erlaubten Farben, wie man Pfeile richtig zwischen Karten setzt und die
Fallen, in die man dabei tappt. Geschrieben für ein LLM, das das Brett von
außen befüllen soll, nicht für einen Menschen an der Maus.

Die Marker `{{BASE_URL}}` und `{{BOARD_LISTE}}` füllt der Server beim
Ausliefern. Die Datei wird bei jedem Aufruf frisch gelesen - Änderungen an
der Doku wirken ohne Neustart.

Damit sie auch gefunden wird, ohne dass jemand von ihr weiß, verweisen zwei
Stellen darauf: `GET /health` führt sie im Feld `llm_docs_url`, und der Server
schreibt die Adresse beim Start in den Log. Die Startseite `/` liefert HTML
fürs Auge und taugt als Wegweiser nicht.

### Warum Karten HTML sind und nur die Pfeile SVG

Text in SVG editierbar zu machen heißt: Cursor, Zeilenumbruch und Auswahl von
Hand bauen. `contenteditable` auf einem `div` kostet dagegen nichts. Also sind
die Karten normales HTML, und darüber liegt eine SVG-Ebene ausschließlich für
die Pfeile - die sollen ohnehin immer obenauf sein. Excalidraw und tldraw
machen es genauso.

### Board-Format

```json
{
  "name": "stempel-umbau",
  "karten": [
    {
      "id": "e...", "x": 1900, "y": 1400, "b": 250,
      "farbe": "#e0f0f7", "titel": "Überschrift",
      "zeilen": [
        { "id": "e...", "typ": "text", "farbe": "",        "text": "..." },
        { "id": "e...", "typ": "paar", "farbe": "#fbf6d8", "name": "...", "wert": "..." }
      ]
    }
  ],
  "pfeile": [
    { "id": "e...", "x1": 1800, "y1": 1500, "x2": 2100, "y2": 1500, "farbe": "#c0392b" }
  ]
}
```

Der Server kennt dieses Format bewusst nicht - für ihn ist `daten` ein
beliebiges Objekt. So muss beim Weiterbauen am Brett nichts am Server
geändert werden.
