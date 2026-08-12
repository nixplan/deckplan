/* Deckplan - virtuelles Whiteboard, vanilla JS.
 *
 * Aufbau in drei Schichten:
 *   1. Zustand  - ein einziges JSON-Objekt `brett` im RAM. Alles, was man
 *                 sieht, steht da drin. Gespeichert wird genau dieses Objekt.
 *   2. Zeichnen - `zeichne()` baut den kompletten DOM neu aus `brett`.
 *                 Nicht waehrend des Tippens aufrufen (Cursor waere weg).
 *   3. Eingabe  - Maus- und Tastatur-Handler aendern `brett` und zeichnen neu.
 *
 * Karten sind normales HTML (contenteditable kostet nichts), Pfeile liegen
 * als SVG-Ebene darueber. Text in SVG editierbar zu machen waere Handarbeit
 * fuer Cursor, Umbruch und Auswahl - deshalb die Mischung.
 */

'use strict';

// ── Farben ──────────────────────────────────────────────────────────────
// Nur Pastelltoene fuer Flaechen: die Schrift ist ueberall dieselbe dunkle
// Farbe, kraeftige Hintergruende wuerden sie unlesbar machen.
// "" heisst "keine Farbe" und wird als weisses Feld mit Strich gezeigt.
const PASTELL = [
  '', '#ffffff', '#f2f4f7', '#fdecec', '#fdeee2', '#fbf6d8',
  '#eef7e3', '#e2f4ec', '#e0f0f7', '#e6e9fb', '#efe6fb', '#fae6f1',
];

// Pfeile duerfen kraeftig sein - sie sind Linien, kein Textgrund.
const PFEILFARBEN = [
  '#4b5563', '#111827', '#c0392b', '#d97706', '#16a34a', '#0e7490',
  '#2563eb', '#7c3aed', '#db2777', '#78716c', '#0f766e', '#a16207',
];

const KARTE_BREITE_STANDARD = 250;
const KARTE_BREITE_MIN = 140;
const VERLAUF_TIEFE = 60;            // so viele Rueckgaengig-Schritte
const SPEICHER_SCHLUESSEL = 'deckplan:letztes';

// Groesse des Bretts. Steht auch im CSS - hier braucht JS sie fuer die
// skalierte Huelle beim Zoomen.
const BRETT_BREITE = 4000;
const BRETT_HOEHE = 3000;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_SCHRITT = 1.1;            // pro Rastung am Rad

// ── Zustand ─────────────────────────────────────────────────────────────
let brett = leeresBrett();
let auswahl = new Set();             // ids von Karten und Pfeilen
let verlauf = [];                    // Schnappschuesse fuer Rueckgaengig
let zieh = null;                     // laufende Maus-Aktion, sonst null

// Zoom gehoert zur Ansicht, nicht zum Brett: er wird nicht gespeichert und
// steht in keinem Board-JSON. Alle Koordinaten im Modell bleiben ungezoomt.
let zoom = 1;
let raumTaste = false;               // Leertaste gehalten = schwenken

// ── DOM-Verweise ────────────────────────────────────────────────────────
const elBrett      = document.getElementById('brett');
const elFlaeche    = document.getElementById('flaeche');
const elKarten     = document.getElementById('karten');
const elPfeile     = document.getElementById('pfeile');
const elGummi      = document.getElementById('gummiband');
const elPalette    = document.getElementById('palette');
const elName       = document.getElementById('boardname');
const elAuswahl    = document.getElementById('board-auswahl');
const elMeldung    = document.getElementById('meldung');
const elBuehne     = document.getElementById('buehne');

const SVG_NS = 'http://www.w3.org/2000/svg';


// ════════════════════════════════════════════════════════════════════════
// Zustand: anlegen, sichern, zuruecknehmen
// ════════════════════════════════════════════════════════════════════════

function leeresBrett() {
  return { name: 'unbenannt', karten: [], pfeile: [] };
}

/** Erzeugt eine neue eindeutige id.
 *
 * Zeitstempel plus Zufall: nach dem Laden eines Boards laufen keine
 * Zaehler mehr mit, deshalb duerfen ids nicht aus einer Sequenz kommen -
 * sonst kollidieren neue Elemente mit geladenen.
 */
function neueId() {
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Legt den aktuellen Zustand auf den Rueckgaengig-Stapel.
 *
 * Immer VOR der Aenderung aufrufen. Der Stapel haelt fertige
 * JSON-Strings - billiger als tiefe Kopien und beim Zuruecknehmen
 * ist sofort klar, dass nichts mehr geteilt wird.
 */
function schnappschuss() {
  const stand = JSON.stringify(brett);
  // Aendert sich nichts, kommt auch nichts auf den Stapel. Sonst legt jedes
  // Reinklicken in ein Textfeld einen Eintrag ab, ohne dass etwas passiert -
  // nach fuenf angeklickten Feldern braucht es fuenf Strg+Z, bevor sichtbar
  // etwas zurueckgeht. Das sieht kaputt aus. Zwei gleiche Staende
  // hintereinander sind ohnehin nie sinnvoll: ein Zurueck darauf tut nichts.
  if (verlauf[verlauf.length - 1] === stand) return;

  verlauf.push(stand);
  if (verlauf.length > VERLAUF_TIEFE) verlauf.shift();
}

function zurueck() {
  if (!verlauf.length) { melde('Nichts mehr zum Zuruecknehmen'); return; }
  brett = JSON.parse(verlauf.pop());
  auswahl.clear();
  zeichne();
}

/** Sichert das Brett im Browser-Speicher.
 *
 * Netz fuer den Fall, dass der Tab abstuerzt bevor man auf Speichern
 * geklickt hat. Ersetzt das Speichern nicht - das schreibt nach boards/.
 */
function nebenbeiSichern() {
  try {
    localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(brett));
  } catch (fehler) {
    // Voller oder gesperrter localStorage darf das Brett nicht anhalten.
    console.warn('Nebenbei-Sichern ging nicht:', fehler);
  }
}

function melde(text) {
  elMeldung.textContent = text;
  clearTimeout(melde.uhr);
  melde.uhr = setTimeout(() => { elMeldung.textContent = ''; }, 3500);
}

function karteFinden(id)  { return brett.karten.find(k => k.id === id); }
function pfeilFinden(id)  { return brett.pfeile.find(p => p.id === id); }

/** Sucht eine Zeile ueber ihre id und liefert Zeile plus zugehoerige Karte. */
function zeileFinden(zid) {
  for (const karte of brett.karten) {
    const zeile = karte.zeilen.find(z => z.id === zid);
    if (zeile) return { karte, zeile };
  }
  return null;
}


// ════════════════════════════════════════════════════════════════════════
// Zeichnen
// ════════════════════════════════════════════════════════════════════════

function zeichne() {
  zeichneKarten();
  zeichnePfeile();
  nebenbeiSichern();
}

function zeichneKarten() {
  elKarten.replaceChildren(...brett.karten.map(karteBauen));
}

function karteBauen(karte) {
  const el = document.createElement('div');
  el.className = 'karte' + (auswahl.has(karte.id) ? ' markiert' : '');
  el.dataset.id = karte.id;
  el.style.left = karte.x + 'px';
  el.style.top = karte.y + 'px';
  el.style.width = (karte.b || KARTE_BREITE_STANDARD) + 'px';
  if (karte.farbe) el.style.background = karte.farbe;

  // Kopf: Ueberschrift, Farbknopf, Loeschknopf. Die Ueberschrift bleibt
  // immer oben - sie ist nicht Teil der verschiebbaren Zeilenliste.
  const kopf = document.createElement('div');
  kopf.className = 'kopf';

  const titel = document.createElement('div');
  titel.className = 'titel';
  editierbar(titel);
  titel.dataset.feld = 'titel';
  titel.textContent = karte.titel;
  kopf.append(titel, knopfBauen('&#9679;', 'karte-farbe', 'Kartenfarbe'),
                     knopfBauen('&#10005;', 'karte-weg', 'Karte loeschen'));

  // Zeilen in der Reihenfolge, in der sie im Modell stehen.
  const zeilen = document.createElement('div');
  zeilen.className = 'zeilen';
  karte.zeilen.forEach((zeile, nr) => zeilen.append(zeileBauen(zeile, nr, karte.zeilen.length)));

  // Fuss: neue Zeilen anhaengen.
  const fuss = document.createElement('div');
  fuss.className = 'fuss';
  fuss.append(fussKnopf('+ Textblock', 'zeile-text'),
              fussKnopf('+ Name / Wert', 'zeile-paar'));

  const breite = document.createElement('div');
  breite.className = 'breite';

  el.append(kopf, zeilen, fuss, breite);
  return el;
}

function zeileBauen(zeile, nr, anzahl) {
  const el = document.createElement('div');
  el.className = 'zeile ' + zeile.typ;
  el.dataset.zid = zeile.id;
  if (zeile.farbe) el.style.background = zeile.farbe;

  if (zeile.typ === 'paar') {
    // Zweigeteilt: links der Name, rechts der Wert.
    const name = document.createElement('div');
    name.className = 'paar-name';
    editierbar(name);
    name.dataset.feld = 'name';
    name.textContent = zeile.name;

    const wert = document.createElement('div');
    wert.className = 'paar-wert';
    editierbar(wert);
    wert.dataset.feld = 'wert';
    wert.textContent = zeile.wert;

    el.append(name, wert);
  } else {
    const inhalt = document.createElement('div');
    inhalt.className = 'inhalt';
    editierbar(inhalt);
    inhalt.dataset.feld = 'text';
    inhalt.textContent = zeile.text;
    el.append(inhalt);
  }

  // Reihenfolge per Pfeiltasten statt Ziehen: weniger Code, kein
  // Konflikt mit dem Verschieben der ganzen Karte.
  const knoepfe = document.createElement('div');
  knoepfe.className = 'zeilenknoepfe';
  if (nr > 0)          knoepfe.append(knopfBauen('&#9650;', 'zeile-hoch', 'Nach oben'));
  if (nr < anzahl - 1) knoepfe.append(knopfBauen('&#9660;', 'zeile-runter', 'Nach unten'));
  knoepfe.append(knopfBauen('&#9679;', 'zeile-farbe', 'Zeilenfarbe'),
                 knopfBauen('&#10005;', 'zeile-weg', 'Zeile loeschen'));
  el.append(knoepfe);
  return el;
}

/** Macht ein Feld editierbar.
 *
 * "plaintext-only" haelt eingefuegtes HTML aus den Feldern raus - beim
 * Kopieren aus dem Browser landet sonst fremde Formatierung in der Karte.
 * Aeltere Browser kennen den Wert nicht (und werfen teils beim Setzen),
 * dann eben normal editierbar.
 */
function editierbar(el) {
  try {
    el.contentEditable = 'plaintext-only';
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  } catch (fehler) {
    el.contentEditable = 'true';
  }
}

function knopfBauen(zeichen, tat, titel) {
  const el = document.createElement('button');
  el.className = 'knopf';
  el.innerHTML = zeichen;
  el.dataset.tat = tat;
  el.title = titel;
  return el;
}

function fussKnopf(text, tat) {
  const el = document.createElement('button');
  el.textContent = text;
  el.dataset.tat = tat;
  return el;
}

/** Baut die komplette Pfeil-Ebene neu.
 *
 * Wird auch bei jeder Mausbewegung waehrend des Ziehens aufgerufen. Das
 * ist bewusst so: ein Brett hat ein paar Dutzend Pfeile, der Neuaufbau
 * kostet nichts und spart die Sonderbehandlung fuer "nur diesen einen".
 */
function zeichnePfeile() {
  elPfeile.replaceChildren(...brett.pfeile.map(pfeilBauen));
}

function pfeilBauen(pfeil) {
  const gruppe = document.createElementNS(SVG_NS, 'g');
  const markiert = auswahl.has(pfeil.id);
  gruppe.setAttribute('class', 'pfeil' + (markiert ? ' markiert' : ''));
  gruppe.dataset.id = pfeil.id;

  const dx = pfeil.x2 - pfeil.x1;
  const dy = pfeil.y2 - pfeil.y1;
  const laenge = Math.hypot(dx, dy) || 1;

  // Der Stil endet kurz vor der Spitze, sonst schaut er oben heraus.
  const spitzeLang = 15;
  const spitzeBreit = 6.5;
  const ex = pfeil.x2 - (dx / laenge) * spitzeLang;
  const ey = pfeil.y2 - (dy / laenge) * spitzeLang;
  const nx = -dy / laenge;            // Normale zur Richtung
  const ny = dx / laenge;

  // Unsichtbare dicke Linie: macht duenne Pfeile ueberhaupt anklickbar.
  const treffer = document.createElementNS(SVG_NS, 'line');
  setzeLinie(treffer, pfeil.x1, pfeil.y1, pfeil.x2, pfeil.y2);
  treffer.setAttribute('class', 'treffer');

  const stil = document.createElementNS(SVG_NS, 'line');
  setzeLinie(stil, pfeil.x1, pfeil.y1, ex, ey);
  stil.setAttribute('class', 'stil');
  stil.setAttribute('stroke', pfeil.farbe);
  stil.setAttribute('stroke-width', 2.5);
  stil.setAttribute('stroke-linecap', 'round');

  const spitze = document.createElementNS(SVG_NS, 'polygon');
  spitze.setAttribute('points', [
    `${pfeil.x2},${pfeil.y2}`,
    `${ex + nx * spitzeBreit},${ey + ny * spitzeBreit}`,
    `${ex - nx * spitzeBreit},${ey - ny * spitzeBreit}`,
  ].join(' '));
  spitze.setAttribute('fill', pfeil.farbe);

  gruppe.append(treffer, stil, spitze);

  // Griffe nur am ausgewaehlten Pfeil - sonst waere das Brett voller Punkte.
  if (markiert) {
    gruppe.append(griffBauen(pfeil.x1, pfeil.y1, 'a'),
                  griffBauen(pfeil.x2, pfeil.y2, 'b'));
  }
  return gruppe;
}

function setzeLinie(el, x1, y1, x2, y2) {
  el.setAttribute('x1', x1); el.setAttribute('y1', y1);
  el.setAttribute('x2', x2); el.setAttribute('y2', y2);
}

function griffBauen(x, y, ende) {
  const el = document.createElementNS(SVG_NS, 'circle');
  el.setAttribute('class', 'griff');
  el.setAttribute('cx', x);
  el.setAttribute('cy', y);
  el.setAttribute('r', 6);
  el.dataset.ende = ende;
  return el;
}


// ════════════════════════════════════════════════════════════════════════
// Auswahl
// ════════════════════════════════════════════════════════════════════════

function auswaehlen(id, dazu) {
  if (!dazu) auswahl.clear();
  if (auswahl.has(id) && dazu) auswahl.delete(id);
  else auswahl.add(id);
}


// ════════════════════════════════════════════════════════════════════════
// Elemente anlegen und loeschen
// ════════════════════════════════════════════════════════════════════════

/** Liefert die Brett-Koordinaten der aktuellen Bildschirmmitte.
 *
 * Neue Karten und Pfeile sollen dort auftauchen, wo man gerade hinschaut -
 * nicht bei 0,0 am oberen linken Rand eines 4000px breiten Bretts.
 */
function mitte() {
  return {
    x: (elBuehne.scrollLeft + elBuehne.clientWidth / 2) / zoom,
    y: (elBuehne.scrollTop + elBuehne.clientHeight / 2) / zoom,
  };
}

function karteAnlegen() {
  schnappschuss();
  const m = mitte();
  const karte = {
    id: neueId(),
    x: Math.round(m.x - KARTE_BREITE_STANDARD / 2),
    y: Math.round(m.y - 60),
    b: KARTE_BREITE_STANDARD,
    farbe: '',
    titel: 'Neue Karte',
    zeilen: [{ id: neueId(), typ: 'text', farbe: '', text: '' }],
  };
  brett.karten.push(karte);
  auswahl.clear();
  auswahl.add(karte.id);
  zeichne();
}

function pfeilAnlegen() {
  schnappschuss();
  const m = mitte();
  const pfeil = {
    id: neueId(),
    x1: Math.round(m.x - 90), y1: Math.round(m.y),
    x2: Math.round(m.x + 90), y2: Math.round(m.y),
    farbe: PFEILFARBEN[0],
  };
  brett.pfeile.push(pfeil);
  auswahl.clear();
  auswahl.add(pfeil.id);
  zeichne();
}

function zeileAnlegen(karte, typ) {
  schnappschuss();
  karte.zeilen.push(typ === 'paar'
    ? { id: neueId(), typ: 'paar', farbe: '', name: '', wert: '' }
    : { id: neueId(), typ: 'text', farbe: '', text: '' });
  zeichne();
}

function auswahlLoeschen() {
  if (!auswahl.size) return;
  schnappschuss();
  brett.karten = brett.karten.filter(k => !auswahl.has(k.id));
  brett.pfeile = brett.pfeile.filter(p => !auswahl.has(p.id));
  auswahl.clear();
  zeichne();
}


// ════════════════════════════════════════════════════════════════════════
// Farbpalette
// ════════════════════════════════════════════════════════════════════════

/** Oeffnet die Palette an der Mausposition.
 *
 * `rueckruf` bekommt die gewaehlte Farbe ("" heisst keine) und ist selbst
 * dafuer zustaendig, Schnappschuss zu machen und neu zu zeichnen.
 */
function paletteZeigen(x, y, farben, rueckruf) {
  elPalette.replaceChildren(...farben.map(farbe => {
    const tupfer = document.createElement('div');
    tupfer.className = 'tupfer';
    // Leere Farbe als weisses Feld mit rotem Strich - sichtbar "nichts".
    tupfer.style.background = farbe
      ? farbe
      : 'linear-gradient(135deg,#fff 45%,#e05a5a 45%,#e05a5a 55%,#fff 55%)';
    tupfer.title = farbe || 'keine Farbe';
    tupfer.addEventListener('click', () => { elPalette.hidden = true; rueckruf(farbe); });
    return tupfer;
  }));
  elPalette.hidden = false;
  elPalette.style.left = Math.min(x, window.innerWidth - 190) + 'px';
  elPalette.style.top  = Math.min(y, window.innerHeight - 110) + 'px';
}

document.addEventListener('mousedown', ereignis => {
  if (!elPalette.hidden && !elPalette.contains(ereignis.target)) elPalette.hidden = true;
}, true);

/** Faerbt die aktuelle Auswahl - das ist die Leertaste.
 *
 * Karten und Pfeile haben verschiedene Paletten: Pastell fuer Flaechen,
 * kraeftig fuer Linien. Bei gemischter Auswahl gewinnen die Karten, die
 * Pfeile bleiben dann unveraendert - eine Palette, die beides zugleich
 * bedient, gaebe es nicht.
 */
function auswahlFaerben(x, y) {
  const karten = brett.karten.filter(k => auswahl.has(k.id));
  if (karten.length) {
    paletteZeigen(x, y, PASTELL, farbe => {
      schnappschuss();
      karten.forEach(k => { k.farbe = farbe; });
      zeichne();
    });
    return;
  }

  const pfeile = brett.pfeile.filter(p => auswahl.has(p.id));
  paletteZeigen(x, y, PFEILFARBEN, farbe => {
    schnappschuss();
    pfeile.forEach(p => { p.farbe = farbe; });
    zeichne();
  });
}


// ════════════════════════════════════════════════════════════════════════
// Klicks auf Knoepfe in den Karten
// ════════════════════════════════════════════════════════════════════════

elKarten.addEventListener('click', ereignis => {
  const knopf = ereignis.target.closest('button');
  if (!knopf) return;

  const karte = karteFinden(knopf.closest('.karte').dataset.id);
  const zeilenEl = knopf.closest('.zeile');
  const tat = knopf.dataset.tat;

  if (tat === 'karte-weg') {
    schnappschuss();
    brett.karten = brett.karten.filter(k => k !== karte);
    auswahl.delete(karte.id);
    zeichne();

  } else if (tat === 'karte-farbe') {
    // Ist die Karte Teil einer Mehrfachauswahl, faerben wir alle mit.
    const ziele = auswahl.has(karte.id)
      ? brett.karten.filter(k => auswahl.has(k.id))
      : [karte];
    paletteZeigen(ereignis.clientX, ereignis.clientY, PASTELL, farbe => {
      schnappschuss();
      ziele.forEach(k => { k.farbe = farbe; });
      zeichne();
    });

  } else if (tat === 'zeile-text' || tat === 'zeile-paar') {
    zeileAnlegen(karte, tat === 'zeile-paar' ? 'paar' : 'text');

  } else if (zeilenEl) {
    const zid = zeilenEl.dataset.zid;
    const nr = karte.zeilen.findIndex(z => z.id === zid);

    if (tat === 'zeile-weg') {
      schnappschuss();
      karte.zeilen.splice(nr, 1);
      zeichne();

    } else if (tat === 'zeile-hoch' || tat === 'zeile-runter') {
      schnappschuss();
      const ziel = nr + (tat === 'zeile-hoch' ? -1 : 1);
      [karte.zeilen[nr], karte.zeilen[ziel]] = [karte.zeilen[ziel], karte.zeilen[nr]];
      zeichne();

    } else if (tat === 'zeile-farbe') {
      const zeile = karte.zeilen[nr];
      paletteZeigen(ereignis.clientX, ereignis.clientY, PASTELL, farbe => {
        schnappschuss();
        zeile.farbe = farbe;
        zeichne();
      });
    }
  }
});


// ════════════════════════════════════════════════════════════════════════
// Text bearbeiten
// ════════════════════════════════════════════════════════════════════════

// Vor der ersten Taste den Zustand sichern, damit Strg+Z die ganze
// Bearbeitung eines Feldes auf einmal zuruecknimmt statt Buchstabe fuer
// Buchstabe.
elKarten.addEventListener('focusin', ereignis => {
  if (ereignis.target.isContentEditable) schnappschuss();
});

elKarten.addEventListener('input', ereignis => {
  const feld = ereignis.target;
  if (!feld.dataset.feld) return;
  const text = feld.textContent;

  if (feld.dataset.feld === 'titel') {
    karteFinden(feld.closest('.karte').dataset.id).titel = text;
  } else {
    const treffer = zeileFinden(feld.closest('.zeile').dataset.zid);
    if (treffer) treffer.zeile[feld.dataset.feld] = text;
  }
  nebenbeiSichern();
});

// Die Ueberschrift bleibt einzeilig - Enter waere hier nur ein Versehen.
elKarten.addEventListener('keydown', ereignis => {
  if (ereignis.key === 'Enter' && ereignis.target.dataset.feld === 'titel') {
    ereignis.preventDefault();
    ereignis.target.blur();
  }
});


// ════════════════════════════════════════════════════════════════════════
// Ansicht: zoomen und schwenken
// ════════════════════════════════════════════════════════════════════════

/** Setzt den Zoom.
 *
 * Skaliert wird nur die Darstellung. Das Brett behaelt seine 4000x3000 und
 * damit behalten alle Karten ihre Koordinaten - gespeicherte Boards sehen
 * bei jedem Zoom gleich aus. Die Huelle bekommt die skalierte Groesse,
 * sonst waere bei 200 % die Haelfte des Bretts nicht mehr erreichbar.
 */
function zoomSetzen(neu) {
  zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, neu));
  elBrett.style.transform = 'scale(' + zoom + ')';
  elFlaeche.style.width  = (BRETT_BREITE * zoom) + 'px';
  elFlaeche.style.height = (BRETT_HOEHE * zoom) + 'px';
}

/** Legt die Ansicht so, dass alles aufs Bild passt - das ist F1.
 *
 * Nach zehn Minuten Schieben weiss man nicht mehr, wo auf den 4000x3000
 * das Zeug liegt. Ein Druck holt es zurueck.
 *
 * Die Hoehe einer Karte steht nicht im Modell - sie ergibt sich aus ihren
 * Zeilen. Deshalb wird sie am gezeichneten Element abgelesen, nicht gerechnet.
 */
function allesZeigen() {
  const kaesten = brett.karten.map(karte => {
    const el = elKarten.querySelector(`[data-id="${karte.id}"]`);
    return {
      x1: karte.x, y1: karte.y,
      x2: karte.x + (el ? el.offsetWidth : KARTE_BREITE_STANDARD),
      y2: karte.y + (el ? el.offsetHeight : 100),
    };
  }).concat(brett.pfeile.map(pfeil => ({
    x1: Math.min(pfeil.x1, pfeil.x2), y1: Math.min(pfeil.y1, pfeil.y2),
    x2: Math.max(pfeil.x1, pfeil.x2), y2: Math.max(pfeil.y1, pfeil.y2),
  })));

  if (!kaesten.length) { melde('Nichts auf dem Brett'); return; }

  const links  = Math.min(...kaesten.map(k => k.x1));
  const oben   = Math.min(...kaesten.map(k => k.y1));
  const rechts = Math.max(...kaesten.map(k => k.x2));
  const unten  = Math.max(...kaesten.map(k => k.y2));

  // Etwas Luft drumherum, sonst kleben die Randkarten am Bildrand.
  const rand = 60;
  // zoomSetzen begrenzt auf ZOOM_MIN..ZOOM_MAX. Bei einem sehr weit
  // verstreuten Brett passt dann nicht alles drauf - dafuer bleibt es lesbar.
  zoomSetzen(Math.min(
    elBuehne.clientWidth / (rechts - links + rand * 2),
    elBuehne.clientHeight / (unten - oben + rand * 2),
  ));

  elBuehne.scrollLeft = (links + rechts) / 2 * zoom - elBuehne.clientWidth / 2;
  elBuehne.scrollTop  = (oben + unten) / 2 * zoom - elBuehne.clientHeight / 2;
}

/** Rad zoomt, und zwar auf den Punkt unter dem Zeiger.
 *
 * Ohne das Nachfuehren der Rollbalken zoomt man immer auf die linke obere
 * Ecke und muss nach jeder Rastung neu suchen, wo man gerade war.
 *
 * Das Rad rollt damit nicht mehr - geschoben wird mit Leertaste plus
 * Maustaste oder ueber die Rollbalken.
 */
elBuehne.addEventListener('wheel', ereignis => {
  if (!ereignis.deltaY) return;
  ereignis.preventDefault();

  const alt = zoom;
  zoomSetzen(alt * (ereignis.deltaY < 0 ? ZOOM_SCHRITT : 1 / ZOOM_SCHRITT));
  if (zoom === alt) return;          // schon am Anschlag

  // Der Punkt unter dem Zeiger soll liegenbleiben: erst in Brett-
  // Koordinaten umrechnen, dann nach dem Zoom wieder unter den Zeiger legen.
  const kasten = elBuehne.getBoundingClientRect();
  const zx = ereignis.clientX - kasten.left;
  const zy = ereignis.clientY - kasten.top;
  const bx = (elBuehne.scrollLeft + zx) / alt;
  const by = (elBuehne.scrollTop + zy) / alt;

  elBuehne.scrollLeft = bx * zoom - zx;
  elBuehne.scrollTop  = by * zoom - zy;
}, { passive: false });


// ════════════════════════════════════════════════════════════════════════
// Maus: verschieben, ziehen, Gummiband
// ════════════════════════════════════════════════════════════════════════

/** Rechnet Bildschirmkoordinaten in Brett-Koordinaten um.
 *
 * Das Rechteck von elBrett kommt schon skaliert zurueck - die Strecke bis
 * zum Zeiger sind also Bildschirmpixel und muss durch den Zoom geteilt
 * werden, sonst zieht eine Karte bei 200 % doppelt so weit wie die Maus.
 */
function nachBrett(ereignis) {
  const kasten = elBrett.getBoundingClientRect();
  return {
    x: (ereignis.clientX - kasten.left) / zoom,
    y: (ereignis.clientY - kasten.top) / zoom,
  };
}

// Letzte Mausposition. Ein Tastendruck bringt keine Koordinaten mit, der
// Farbwaehler auf Leertaste soll aber dort aufgehen, wo der Zeiger steht.
// Auch am Klick mitschreiben, nicht nur an der Bewegung: ausgewaehlt wird
// per Klick, und ohne vorherige Bewegung staende die Palette sonst in der
// Ecke bei 0,0.
let mausX = window.innerWidth / 2;
let mausY = window.innerHeight / 2;

function mausMerken(ereignis) {
  mausX = ereignis.clientX;
  mausY = ereignis.clientY;
}

window.addEventListener('mousemove', mausMerken);
window.addEventListener('mousedown', mausMerken, true);

elBrett.addEventListener('mousedown', ereignis => {
  if (ereignis.button !== 0) return;

  // Schwenken hat Vorrang vor allem anderen: bei gehaltener Leertaste zieht
  // man die Ansicht, auch wenn man dabei ueber einer Karte startet.
  if (raumTaste) {
    zieh = {
      art: 'schwenk',
      startX: ereignis.clientX, startY: ereignis.clientY,
      rollX: elBuehne.scrollLeft, rollY: elBuehne.scrollTop,
    };
    document.body.classList.add('schwenkt');
    ereignis.preventDefault();
    return;
  }

  // Textfelder und Knoepfe machen ihr eigenes Ding - hier nicht reinfunken.
  if (ereignis.target.isContentEditable || ereignis.target.closest('button')) return;

  const start = nachBrett(ereignis);
  const griff = ereignis.target.closest('.griff');
  const pfeilEl = ereignis.target.closest('.pfeil');
  const karteEl = ereignis.target.closest('.karte');

  // Der Schnappschuss fuer Rueckgaengig kommt erst bei der ersten echten
  // Mausbewegung (siehe mousemove). Sonst legt jeder blosse Klick einen
  // Zustand auf den Stapel und Strg+Z tut erstmal mehrfach nichts.
  if (griff && pfeilEl) {
    // Ein Pfeilende ziehen: dreht und verlaengert den Pfeil.
    zieh = { art: 'pfeil-ende', id: pfeilEl.dataset.id, ende: griff.dataset.ende };

  } else if (pfeilEl) {
    auswaehlen(pfeilEl.dataset.id, ereignis.shiftKey);
    zieh = { art: 'schieben', start, anfang: anfangsLagen() };
    zeichne();

  } else if (karteEl && ereignis.target.classList.contains('breite')) {
    const karte = karteFinden(karteEl.dataset.id);
    zieh = { art: 'breite', id: karte.id, startX: start.x, startB: karte.b || KARTE_BREITE_STANDARD };

  } else if (karteEl) {
    // Auf eine schon markierte Karte klicken laesst die Auswahl stehen -
    // sonst koennte man eine Gruppe nie am Stueck anfassen.
    if (!auswahl.has(karteEl.dataset.id)) auswaehlen(karteEl.dataset.id, ereignis.shiftKey);
    else if (ereignis.shiftKey) auswahl.delete(karteEl.dataset.id);
    zieh = { art: 'schieben', start, anfang: anfangsLagen() };
    zeichne();

  } else {
    // Leere Flaeche: Gummiband aufziehen.
    if (!ereignis.shiftKey) auswahl.clear();
    zieh = { art: 'gummi', start };
    elGummi.style.left = start.x + 'px';
    elGummi.style.top = start.y + 'px';
    elGummi.style.width = '0px';
    elGummi.style.height = '0px';
    elGummi.hidden = false;
    zeichne();
  }
  ereignis.preventDefault();
});

/** Rechtsklick loescht.
 *
 * Trifft er etwas aus der Auswahl, geht die ganze Auswahl weg - so raeumt
 * ein Klick eine markierte Gruppe ab. Trifft er etwas anderes, geht nur
 * das eine Element. Auf leerer Flaeche, in Textfeldern und auf Knoepfen
 * bleibt das Browser-Menue: dort braucht man Einfuegen und Rechtschreibung.
 */
elBrett.addEventListener('contextmenu', ereignis => {
  if (ereignis.target.isContentEditable || ereignis.target.closest('button')) return;

  const el = ereignis.target.closest('.karte, .pfeil');
  if (!el) return;

  ereignis.preventDefault();
  if (!auswahl.has(el.dataset.id)) {
    auswahl.clear();
    auswahl.add(el.dataset.id);
  }
  auswahlLoeschen();
});

/** Merkt sich die Startpositionen aller ausgewaehlten Elemente.
 *
 * Waehrend des Schiebens werden die Positionen immer aus diesen Werten
 * plus Gesamtversatz berechnet, nicht schrittweise addiert - sonst
 * summieren sich Rundungsfehler ueber hunderte Mausereignisse.
 */
function anfangsLagen() {
  const lagen = new Map();
  brett.karten.forEach(k => { if (auswahl.has(k.id)) lagen.set(k.id, { x: k.x, y: k.y }); });
  brett.pfeile.forEach(p => {
    if (auswahl.has(p.id)) lagen.set(p.id, { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 });
  });
  return lagen;
}

window.addEventListener('mousemove', ereignis => {
  if (!zieh) return;

  // Schwenken aendert nichts am Brett, nur den Ausschnitt - deshalb vor dem
  // Schnappschuss raus. Ein Zug an der Ansicht gehoert nicht ins Rueckgaengig.
  if (zieh.art === 'schwenk') {
    elBuehne.scrollLeft = zieh.rollX - (ereignis.clientX - zieh.startX);
    elBuehne.scrollTop  = zieh.rollY - (ereignis.clientY - zieh.startY);
    return;
  }

  const jetzt = nachBrett(ereignis);

  // Erste echte Bewegung: jetzt ist klar, dass wirklich gezogen wird.
  // Hier hat sich noch nichts geaendert, der Schnappschuss trifft also
  // genau den Zustand vor dem Zug.
  if (!zieh.gesichert && zieh.art !== 'gummi') {
    schnappschuss();
    zieh.gesichert = true;
  }

  if (zieh.art === 'schieben') {
    const dx = Math.round(jetzt.x - zieh.start.x);
    const dy = Math.round(jetzt.y - zieh.start.y);
    zieh.anfang.forEach((lage, id) => {
      const karte = karteFinden(id);
      if (karte) { karte.x = lage.x + dx; karte.y = lage.y + dy; return; }
      const pfeil = pfeilFinden(id);
      if (pfeil) {
        pfeil.x1 = lage.x1 + dx; pfeil.y1 = lage.y1 + dy;
        pfeil.x2 = lage.x2 + dx; pfeil.y2 = lage.y2 + dy;
      }
    });
    lagenAuffrischen();

  } else if (zieh.art === 'pfeil-ende') {
    const pfeil = pfeilFinden(zieh.id);
    if (zieh.ende === 'a') { pfeil.x1 = Math.round(jetzt.x); pfeil.y1 = Math.round(jetzt.y); }
    else                   { pfeil.x2 = Math.round(jetzt.x); pfeil.y2 = Math.round(jetzt.y); }
    zeichnePfeile();

  } else if (zieh.art === 'breite') {
    const karte = karteFinden(zieh.id);
    karte.b = Math.max(KARTE_BREITE_MIN, Math.round(zieh.startB + (jetzt.x - zieh.startX)));
    const el = elKarten.querySelector(`[data-id="${karte.id}"]`);
    if (el) el.style.width = karte.b + 'px';

  } else if (zieh.art === 'gummi') {
    const links = Math.min(zieh.start.x, jetzt.x);
    const oben  = Math.min(zieh.start.y, jetzt.y);
    elGummi.style.left = links + 'px';
    elGummi.style.top = oben + 'px';
    elGummi.style.width = Math.abs(jetzt.x - zieh.start.x) + 'px';
    elGummi.style.height = Math.abs(jetzt.y - zieh.start.y) + 'px';
  }
});

/** Schiebt die vorhandenen Elemente, ohne den DOM neu zu bauen.
 *
 * Neubau waehrend des Ziehens waere zwar einfacher, kostet aber bei jeder
 * Mausbewegung alle Karten - und der Mauszeiger verliert das Element,
 * an dem er haengt.
 */
function lagenAuffrischen() {
  zieh.anfang.forEach((_, id) => {
    const karte = karteFinden(id);
    if (!karte) return;
    const el = elKarten.querySelector(`[data-id="${id}"]`);
    if (el) { el.style.left = karte.x + 'px'; el.style.top = karte.y + 'px'; }
  });
  zeichnePfeile();
}

window.addEventListener('mouseup', () => {
  if (!zieh) return;

  if (zieh.art === 'schwenk') {
    document.body.classList.remove('schwenkt');
    zieh = null;
    return;                          // am Brett hat sich nichts geaendert
  }

  if (zieh.art === 'gummi') {
    // Karten zaehlen als getroffen, wenn sie das Band ueberlappen;
    // Pfeile, wenn ihre Mitte drin liegt.
    // Beide Rechtecke kommen skaliert zurueck, das Modell rechnet ungezoomt.
    const kasten = elGummi.getBoundingClientRect();
    const brettKasten = elBrett.getBoundingClientRect();
    const links = (kasten.left - brettKasten.left) / zoom;
    const oben  = (kasten.top - brettKasten.top) / zoom;
    const rechts = links + kasten.width / zoom;
    const unten  = oben + kasten.height / zoom;

    elKarten.querySelectorAll('.karte').forEach(el => {
      const karte = karteFinden(el.dataset.id);
      const kr = karte.x + el.offsetWidth;
      const ku = karte.y + el.offsetHeight;
      if (karte.x < rechts && kr > links && karte.y < unten && ku > oben) auswahl.add(karte.id);
    });
    brett.pfeile.forEach(p => {
      const mx = (p.x1 + p.x2) / 2;
      const my = (p.y1 + p.y2) / 2;
      if (mx >= links && mx <= rechts && my >= oben && my <= unten) auswahl.add(p.id);
    });

    elGummi.hidden = true;
  }

  zieh = null;
  zeichne();
});


// ════════════════════════════════════════════════════════════════════════
// Tastatur
// ════════════════════════════════════════════════════════════════════════

window.addEventListener('keydown', ereignis => {
  const tippt = document.activeElement &&
    (document.activeElement.isContentEditable || document.activeElement.tagName === 'INPUT');

  if ((ereignis.metaKey || ereignis.ctrlKey) && ereignis.key.toLowerCase() === 'z') {
    ereignis.preventDefault();
    zurueck();
    return;
  }

  if (ereignis.key === 'F1') {
    ereignis.preventDefault();
    allesZeigen();
    return;
  }

  // Escape raeumt alles ab, was gerade "an" ist: Palette zu, Cursor aus dem
  // Feld, Auswahl leer. Frueher tat es beim Tippen nur das eine oder das
  // andere - dann musste man zweimal druecken und wusste nie, wo man steht.
  if (ereignis.key === 'Escape') {
    elPalette.hidden = true;
    schwenkenBeenden();
    if (tippt) document.activeElement.blur();
    auswahl.clear();
    zeichne();
    return;
  }

  // Die Leertaste macht zweierlei, je nachdem ob etwas ausgewaehlt ist:
  // mit Auswahl den Farbwaehler, ohne Auswahl das Schwenken der Ansicht.
  // Beim Tippen keins von beidem - da ist ein Leerzeichen ein Leerzeichen.
  // Das preventDefault muss sein, sonst blaettert die Buehne nebenher.
  if (!tippt && ereignis.key === ' ') {
    ereignis.preventDefault();
    if (ereignis.repeat) return;     // gehaltene Taste darf nicht flackern

    // Offene Palette schliesst der zweite Druck wieder - sonst muesste man
    // zum Abbrechen irgendwohin klicken, und jeder Klick aufs Brett
    // veraendert die Auswahl.
    if (!elPalette.hidden) elPalette.hidden = true;
    else if (auswahl.size) auswahlFaerben(mausX, mausY);
    else {
      raumTaste = true;
      document.body.classList.add('schwenkbar');
    }
    return;
  }

  // Loeschen nur, wenn gerade nicht getippt wird - sonst frisst die
  // Ruecktaste beim Schreiben die halbe Karte.
  if (!tippt && (ereignis.key === 'Delete' || ereignis.key === 'Backspace')) {
    ereignis.preventDefault();
    auswahlLoeschen();
  }
});

/** Beendet das Schwenken.
 *
 * Auch am Fensterwechsel: wer mit gedrueckter Leertaste umschaltet, bekommt
 * das keyup nie zu sehen - die Hand als Zeiger bliebe fuer immer stehen.
 */
function schwenkenBeenden() {
  raumTaste = false;
  document.body.classList.remove('schwenkbar', 'schwenkt');
  if (zieh && zieh.art === 'schwenk') zieh = null;
}

window.addEventListener('keyup', ereignis => {
  if (ereignis.key === ' ') schwenkenBeenden();
});

window.addEventListener('blur', schwenkenBeenden);


// ════════════════════════════════════════════════════════════════════════
// Speichern und Laden
// ════════════════════════════════════════════════════════════════════════

async function boardListeHolen() {
  try {
    const antwort = await fetch('/api/boards');
    // fetch wirft nur, wenn gar keine Antwort kommt - ein Fehlerstatus geht
    // ohne Murren durch. Ohne diese Zeile liefert json() dann {detail: ...}
    // statt einer Liste, map() wirft, und der Fang unten meldet "Server nicht
    // erreichbar" - obwohl er antwortet. Der haeufigste Fall dafuer ist die
    // externe Platte: liegt boards/ nicht mehr da, gibt es 500 statt Liste.
    if (!antwort.ok) {
      melde('Boardliste nicht ladbar (' + antwort.status + ')');
      return;
    }
    const namen = await antwort.json();
    elAuswahl.replaceChildren(neueOption('', 'Laden ...'),
                              ...namen.map(n => neueOption(n, n)));
  } catch (fehler) {
    melde('Server nicht erreichbar');
    console.error(fehler);
  }
}

function neueOption(wert, text) {
  const el = document.createElement('option');
  el.value = wert;
  el.textContent = text;
  return el;
}

async function speichern() {
  const name = elName.value.trim();
  if (!name) { melde('Board braucht einen Namen'); return; }

  brett.name = name;
  const antwort = await fetch('/api/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, daten: brett }),
  });

  if (!antwort.ok) {
    const fehler = await antwort.json().catch(() => ({}));
    melde('Fehler: ' + (fehler.detail || antwort.status));
    return;
  }
  melde('Gespeichert als ' + name + '.json');
  boardListeHolen();
}

async function laden(name) {
  const antwort = await fetch('/api/boards/' + encodeURIComponent(name));
  if (!antwort.ok) { melde('Konnte ' + name + ' nicht laden'); return; }

  schnappschuss();
  brett = await antwort.json();
  brett.karten ??= [];
  brett.pfeile ??= [];
  elName.value = brett.name || name;
  auswahl.clear();
  zeichne();
  // Gleich alles ins Bild holen, derselbe Griff wie F1. Ein geladenes Board
  // liegt sonst irgendwo auf den 4000x3000 und muss erst gesucht werden.
  // Vor der Meldung, damit "Geladen: ..." stehen bleibt - allesZeigen meldet
  // bei einem leeren Board selbst etwas.
  allesZeigen();
  melde('Geladen: ' + name);
}

async function boardLoeschen() {
  const name = elAuswahl.value || elName.value.trim();
  if (!name) { melde('Kein Board ausgewaehlt'); return; }
  if (!confirm(`Board "${name}" wirklich von der Platte loeschen?`)) return;

  const antwort = await fetch('/api/boards/' + encodeURIComponent(name), { method: 'DELETE' });
  melde(antwort.ok ? 'Geloescht: ' + name : 'Loeschen ging nicht');
  boardListeHolen();
}


// ════════════════════════════════════════════════════════════════════════
// Leiste verdrahten und starten
// ════════════════════════════════════════════════════════════════════════

document.getElementById('btn-karte').addEventListener('click', karteAnlegen);
document.getElementById('btn-pfeil').addEventListener('click', pfeilAnlegen);
document.getElementById('btn-zurueck').addEventListener('click', zurueck);
document.getElementById('btn-speichern').addEventListener('click', speichern);
document.getElementById('btn-board-weg').addEventListener('click', boardLoeschen);

document.getElementById('btn-neu').addEventListener('click', () => {
  if (!confirm('Brett leeren? Ungespeichertes ist dann weg.')) return;
  schnappschuss();
  brett = leeresBrett();
  elName.value = 'unbenannt';
  auswahl.clear();
  zeichne();
});

elAuswahl.addEventListener('change', () => {
  if (elAuswahl.value) laden(elAuswahl.value);
});

elName.addEventListener('input', () => { brett.name = elName.value; });

// Beim Start das zuletzt Gesehene zurueckholen - ohne dass man dafuer
// gespeichert haben muss.
const gemerkt = localStorage.getItem(SPEICHER_SCHLUESSEL);
if (gemerkt) {
  try {
    brett = JSON.parse(gemerkt);
    brett.karten ??= [];
    brett.pfeile ??= [];
    elName.value = brett.name || 'unbenannt';
  } catch (fehler) {
    console.warn('Gemerktes Brett war kaputt, fange leer an:', fehler);
    brett = leeresBrett();
  }
}

zeichne();
boardListeHolen();

// Startansicht: liegt schon etwas auf dem Brett, wird es ins Bild geholt -
// genau wie nach dem Laden und bei F1. Auf einem leeren Brett gibt es nichts
// einzupassen, dann in die Mitte statt in die leere Ecke oben links.
// Ueber die Huelle gerechnet, nicht ueber das Brett: die Huelle traegt die
// zoomabhaengige Groesse, das Brett bleibt immer 4000x3000.
if (brett.karten.length || brett.pfeile.length) {
  allesZeigen();
} else {
  elBuehne.scrollLeft = (elFlaeche.offsetWidth - elBuehne.clientWidth) / 2;
  elBuehne.scrollTop = (elFlaeche.offsetHeight - elBuehne.clientHeight) / 2;
}
