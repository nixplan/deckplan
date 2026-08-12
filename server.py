# Geändert? Dann in die Historie - und in die projekt.md, sofern sich damit
# das Bild vom Projekt ändert. Reine Bugfixes ändern nichts am Projekt.

"""Deckplan - Mini-Server für das virtuelle Whiteboard.

Eigenständige Anwendung. Kein Teil des Schaltwerks: kein Import aus
config/ oder helpers/, eigener Port, eigener Log, eigener Ordner. Wer
deckplan/ löscht, löscht die ganze Anwendung und sonst nichts.

Der Server macht genau drei Dinge:
- die statischen Dateien ausliefern (index.html, css, js)
- Board-Dateien aus boards/ auflisten und laden
- ein Board als JSON nach boards/<name>.json schreiben

Alles andere passiert im Browser. Der Server hält keinen Zustand.

Start:  python deckplan/server.py
Aufruf: http://127.0.0.1:8600
"""

import json
import logging
import logging.handlers
import os
import re

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── Konfiguration ────────────────────────────────────────────────────────
# Bewusst hier und nicht in config/settings.py: der Deckplan ist eine
# eigenständige Nebenanwendung, die nichts aus dem Schaltwerk zieht.
DECKPLAN_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(DECKPLAN_DIR, "static")
BOARDS_DIR = os.path.join(DECKPLAN_DIR, "boards")
LOG_DIR = os.path.join(DECKPLAN_DIR, "logs")
LOG_FILE = os.path.join(LOG_DIR, "deckplan.log")

HOST = "127.0.0.1"  # bewusst nur lokal - das Brett muss nicht ins Netz
PORT = 8600
LOG_LEVEL = logging.INFO

# Der Log wächst sonst ewig. Ist deckplan.log voll, rutscht alles eine
# Stelle weiter: .2 wird .3, .1 wird .2, deckplan.log wird .1 - und der
# bisherige .3 fällt dabei hinten raus. Es liegen also nie mehr als
# LOG_KOPIEN alte Stände da, zusammen höchstens gut 4 MB.
LOG_MAX_BYTES = 1_000_000
LOG_KOPIEN = 3

# Erlaubte Zeichen im Boardnamen. Der Name wird zum Dateinamen, also darf
# hier nichts durch, was aus boards/ herausführt (".." oder "/").
NAME_MUSTER = re.compile(r"^[A-Za-z0-9ÄÖÜäöüß _-]{1,60}$")


# ── Logging ──────────────────────────────────────────────────────────────
# Muss vor basicConfig stehen: der Handler öffnet die Datei sofort und
# scheitert, wenn es den Ordner noch nicht gibt.
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.handlers.RotatingFileHandler(
            LOG_FILE,
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_KOPIEN,
            encoding="utf-8",
        ),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("deckplan")


# ── Hilfsfunktionen ──────────────────────────────────────────────────────
def board_pfad(name: str) -> str:
    """Baut den Dateipfad zu einem Board und prüft den Namen.

    Der Boardname ist der Dateiname - deshalb wird er streng gegen
    NAME_MUSTER geprüft, bevor er an os.path.join geht. Ohne die Prüfung
    könnte ein Name wie "../../etc/passwd" aus boards/ herausschreiben.

    Args:
        name: Boardname ohne Endung.

    Returns:
        Absoluter Pfad zur JSON-Datei in boards/.

    Raises:
        HTTPException: Wenn der Name unerlaubte Zeichen enthält.
    """
    if not NAME_MUSTER.match(name):
        raise HTTPException(status_code=400, detail=f"Unerlaubter Boardname: {name!r}")
    return os.path.join(BOARDS_DIR, f"{name}.json")


# ── Datenmodell für den Speichern-Aufruf ─────────────────────────────────
class BoardAblage(BaseModel):
    """Was der Browser beim Speichern schickt.

    `daten` ist absichtlich unspezifiziert (dict): das Board-Format lebt
    im Frontend und wird sich beim Basteln noch ändern. Der Server soll
    nicht bei jeder neuen Kartenfarbe mitgeändert werden müssen.
    """

    name: str
    daten: dict


# ── App ──────────────────────────────────────────────────────────────────
os.makedirs(BOARDS_DIR, exist_ok=True)

app = FastAPI(title="Deckplan", docs_url=None, redoc_url=None)


@app.get("/")
def startseite() -> FileResponse:
    """Liefert das Brett aus."""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/api/boards")
def boards_liste() -> list[str]:
    """Listet alle gespeicherten Boards (ohne .json-Endung), alphabetisch."""
    namen = [
        eintrag[:-5]
        for eintrag in os.listdir(BOARDS_DIR)
        if eintrag.endswith(".json")
    ]
    return sorted(namen, key=str.lower)


@app.get("/api/boards/{name}")
def board_laden(name: str) -> dict:
    """Lädt ein Board aus boards/<name>.json."""
    pfad = board_pfad(name)
    if not os.path.exists(pfad):
        raise HTTPException(status_code=404, detail=f"Board {name!r} gibt es nicht")

    with open(pfad, "r", encoding="utf-8") as datei:
        daten = json.load(datei)

    log.info("Board geladen: %s", name)
    return daten


@app.post("/api/boards")
def board_speichern(ablage: BoardAblage) -> dict:
    """Schreibt ein Board nach boards/<name>.json.

    Überschreibt kommentarlos, wenn es die Datei schon gibt - Nachfragen
    passiert im Browser, wo der Nutzer sitzt.
    """
    pfad = board_pfad(ablage.name)

    with open(pfad, "w", encoding="utf-8") as datei:
        json.dump(ablage.daten, datei, ensure_ascii=False, indent=2)

    log.info("Board gespeichert: %s (%d Bytes)", ablage.name, os.path.getsize(pfad))
    return {"ok": True, "name": ablage.name}


@app.delete("/api/boards/{name}")
def board_loeschen(name: str) -> dict:
    """Löscht boards/<name>.json."""
    pfad = board_pfad(name)
    if not os.path.exists(pfad):
        raise HTTPException(status_code=404, detail=f"Board {name!r} gibt es nicht")

    os.remove(pfad)
    log.info("Board gelöscht: %s", name)
    return {"ok": True}


# Muss nach den /api-Routen stehen: StaticFiles auf "/" würde sonst alles
# schlucken, was danach kommt.
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    log.info("Deckplan startet auf http://%s:%d", HOST, PORT)
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
