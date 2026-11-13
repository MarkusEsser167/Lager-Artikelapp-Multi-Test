# Lagermeldungen – Multi-Standort (Testversion)

Progressive Web App für Lagertablets: Meldung von Lagerplatzänderungen und Verschrottungen.

**Testumgebung** für die Zusammenlegung der bisher pro Standort separaten Repos
([Lager-Artikelapp](https://github.com/MarkusEsser167/Lager-Artikelapp) / Standort 106,
[Lager-Artikelapp-812](https://github.com/MarkusEsser167/Lager-Artikelapp-812),
[Lager-Artikelapp-872](https://github.com/MarkusEsser167/Lager-Artikelapp-872)) in **ein** Repo.
Gleicher Code für alle Standorte; welche Referenzdaten/Empfänger/SAP-Codes gelten, wird zur
Laufzeit anhand des auf dem Gerät gewählten Standorts bestimmt (`data/standorte.xlsx`).

⚠️ **Entwicklungsstand:** Läuft parallel zu den drei bestehenden Produktiv-Apps, ersetzt sie noch
nicht. Erst wenn dieser Stand sich bewährt hat, wird über eine Ablösung der Einzel-Repos
entschieden (analog zum Test-/Produktiv-Muster der Unfallaufnahme-App).

## Standort-Auswahl ist KEIN Zugriffsschutz

Beim ersten Öffnen (und über „Standort wechseln“ auf der Startseite) wählt man einen Standort;
diese Auswahl wird nur lokal auf dem Gerät gespeichert (`localStorage`) und bestimmt, welche
Referenzlisten geladen werden und wohin gemeldet wird. Das ist eine **reine
Geräte-/Komfort-Einstellung ohne Anmeldung dahinter**:

- Sie verhindert nicht, dass jemand bewusst einen anderen Standort auswählt und für diesen
  meldet – die App bleibt eine öffentlich erreichbare, statische GitHub-Pages-Seite ohne Login.
- Eine echte Trennung („User von Standort A kann nicht für Standort B melden“) bräuchte eine
  serverseitig geprüfte Anmeldung (z.B. M365/Entra-ID-SSO), die einen User fest einem Standort
  zuordnet. Das ist bewusst zurückgestellt und noch nicht Teil dieser Testversion.
- In der Praxis ist das für auf einem Standort fest stehende Tablets ausreichend: der Standort
  wird einmal eingerichtet und bleibt danach stehen, ohne dass man ihn bei jeder Meldung neu
  wählen muss.

## Einen neuen Standort hinzufügen – ganz ohne Code-Änderung

1. Neue Zeile in `data/standorte.xlsx` anlegen: `Code` (z.B. „999“), `Name` (Anzeigename),
   `Zentrale Mailadresse` (Lagerplatzänderung/Massenkorrektur/Fehlbestand), `Verschrottung
   Mailadresse(n)` (kommagetrennt bei mehreren Empfängern), `SAP Werk`, `SAP Lagerort`.
2. Neuen Ordner `data/<Code>/` anlegen mit den drei Standort-Dateien (siehe unten):
   `lagerplatzliste.xlsx`, `artikel-lagerplatz.xlsx`, `mitarbeiter.xlsx`.
3. Fertig – kein Deploy, keine Code-Änderung. Die App liest `data/standorte.xlsx` und die
   passenden `data/<Code>/…`-Dateien beim nächsten Laden automatisch.

## Funktionen

- **Standortauswahl** – beim ersten Öffnen (und jederzeit über „Standort wechseln“ auf der
  Startseite) wird aus `data/standorte.xlsx` ein Standort gewählt; danach zeigt die App nur noch
  dessen Referenzlisten/Mitarbeiter und sendet an dessen Empfänger.
- **Lagerplatzänderung melden** – Artikelnummer, Art (**Hauptlagerplatz** oder
  **Referenzlagerplatz**, Pflichtauswahl), neuer Lagerplatz, Bemerkung. Wird beim Absenden sofort
  als Excel-Datei an die zentrale Mailadresse des gewählten Standorts gemailt.
- **Verschrottung melden** – Artikelnummer, Menge, Grund, mindestens 1 Pflichtfoto (bis zu 4 Fotos), Bemerkung. Wird beim
  Absenden sofort als PDF (mit allen Fotos eingebettet) an die Verschrottungs-Mailadresse(n) des
  gewählten Standorts gemailt.
- **Massen-Lagerplatzkorrektur** – zur Inventurvorbereitung: Artikel scannen, aktuellen
  Hauptlagerplatz laut System prüfen und ggf. korrigieren. Damit lässt sich **nur der
  Hauptlagerplatz** ändern (fester SAP-Massenupload); Referenzlagerplätze müssen einzeln über
  „Lagerplatzänderung melden“ erfasst werden. Mehrere Korrekturen werden gesammelt und gemeinsam
  als eine Excel-Datei gesendet – im festen SAP-Massenupload-Format `MATNR`/`WERKS`/`LGORT`/
  `LGPBE`, `WERKS`/`LGORT` aus der Standortliste.
- **Lagerplatz-Erfassung (Kamera)** *(nur in dieser Test-App)* – Massenerfassung pro Lagerplatz: Lagerplatz
  wählen, dann die Kamera über die Ware halten; alle gleichzeitig sichtbaren Barcodes (EAN oder
  Artikelnummer) werden fortlaufend erfasst (`js/massScan.js`, nutzt `BarcodeDetector`, der mehrere
  Codes je Bild liefert). Ein Code zählt erst nach zwei Erkennungen (filtert Fehllesungen). Ergebnis ist
  eine Liste der Artikel auf dem Platz – **keine Mengen**, derselbe Artikel nur einmal – mit Abgleich
  gegen `artikel-lagerplatz.xlsx` (passt / abweichend / ohne Referenz / unbekannter Code). Mehrdeutige
  EANs bieten eine Auswahl, Lagerplatz-Etiketten im Bild werden ignoriert, Artikel lassen sich manuell
  ergänzen. Versand als Excel an die zentrale Mailadresse des Standorts. Gedacht für Kamera-Tablets wie
  das Zebra ET45; die Erkennung ist weniger robust als Zebras KI-Barcode-Modell (nur in nativen
  Android-Apps nutzbar), daher zuerst als Test.
  Zusätzlich wird – nur für Artikel, die laut System nicht auf diesem Lagerplatz stehen – eine zweite Excel-Datei im
  Format der Massen-Lagerplatzkorrektur (`MATNR`, `WERKS`, `LGORT`, `LGPBE`) mit dem erfassten Lagerplatz als neuem
  Hauptlagerplatz angehängt.
  Ist der erfasste Lagerplatz für einen Artikel bereits als **Referenzlagerplatz** eingetragen, warnt die App
  (rot im Kamerabild + Vibration, Hinweis in Liste und Mail); solche Artikel kommen nicht in die SAP-Datei,
  da die Massenänderung nur Hauptlagerplätze setzen kann.
  **Sammelversand (ab v1.4.0):** Mehrere Lagerplätze werden nacheinander erfasst („Lagerplatz abschließen –
  nächsten erfassen") und erst mit „Alles senden" in **einer** Mail verschickt (ein Bericht mit Spalte
  Lagerplatz, eine gemeinsame SAP-Datei). Die laufende Erfassung wird als Entwurf in der IndexedDB
  gespeichert und beim nächsten Öffnen fortgesetzt. Artikel, die in einer Runde auf mehreren Plätzen
  erfasst wurden, kommen nicht in die SAP-Datei, sondern werden in der Mail zum Klären aufgeführt.
- **Fehlbestand melden** – nur Artikelnummer (+ optionale Bemerkung), ohne Lagerplatz oder Menge.
  Wird als einfache Text-Mail (kein Anhang) an die zentrale Mailadresse des Standorts gemailt.
- Volltextsuche über mehrere Suchbegriffe (Artikelnummer/Lagerplatz), Barcode-/QR-Scan über die
  Tablet-Kamera, Pflicht-Auswahl „Gemeldet von“ aus der standortbezogenen Mitarbeiterliste,
  lokale Offline-Historie mit „Erneut senden“ – wie in den bisherigen Einzel-Apps.

## Referenzdaten (Excel-Dateien im Repo)

- `data/artikelliste.xlsx` – **standortübergreifend geteilt**: unternehmensweiter Artikelstamm
  (SAP-Exportformat, Spalte `Material` + beliebig viele Text-Spalten, optional `EAN` als Text für Suche/Scan), ca. 153.000 Artikel, davon ca. 98.700 mit EAN.
- `data/standorte.xlsx` – Standort-Registry, siehe oben. Pflichtspalten: `Code`, `Name`,
  `Zentrale Mailadresse`, `Verschrottung Mailadresse(n)`, `SAP Werk`, `SAP Lagerort`.
- `data/<Code>/lagerplatzliste.xlsx` – Vorschlagsliste der Lagerplätze dieses Standorts (Spalte
  mit „Lagerplatz“ im Namen, exakt oder als Wortteil wie „FIS/wms® Lagerplatz“).
- `data/<Code>/artikel-lagerplatz.xlsx` – nur für die Massen-Lagerplatzkorrektur: welcher Artikel
  steht laut System aktuell auf welchem Lagerplatz dieses Standorts (Spalten wie
  `artikelliste.xlsx` + `Lagerplatz` + optional `KZ Hlp` für den Hauptlagerplatz).
- `data/<Code>/mitarbeiter.xlsx` – Spalte `Name`, füllt die „Gemeldet von“-Auswahl für diesen
  Standort (kein Freitext möglich).

Um eine Liste zu aktualisieren: auf GitHub die jeweilige Datei über „Upload file“ ersetzen
(Commit direkt im Browser). Keine Code-Änderung nötig.

## Automatischer Mailversand

Wie bei den Einzel-Apps über ein Google-Apps-Script-Webhook (`apps-script/Code.gs`, dieselbe
Bereitstellung wie bei Standort 106 – `js/export.js`, `MAIL_SCRIPT_URL`). Empfänger kommen jetzt
zur Laufzeit aus `data/standorte.xlsx` statt aus festen Konstanten im Code.

## Installation auf einem Tablet

1. Diese App über GitHub Pages öffnen (Chrome auf Android)
2. Menü → „Zum Startbildschirm hinzufügen“
3. Beim ersten Öffnen Standort wählen
4. Die App läuft danach wie eine installierte App, auch offline

## Entwicklung

Kein Build-Prozess nötig – reines HTML/CSS/JS. Lokal starten:

```
python -m http.server 8428
```

Danach `http://localhost:8428` öffnen.
