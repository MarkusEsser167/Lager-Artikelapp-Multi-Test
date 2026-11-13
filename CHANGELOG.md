# Lagermeldungen – Changelog

> **Multi-Standort-Testversion** (seit 18.09.2026): ein Repo für alle Standorte, Standort wird pro Gerät gewählt (keine Zugriffskontrolle). Funktionsstand wie unten beschrieben; Empfänger, Werk und Lagerort kommen aus `data/standorte.xlsx`.

Gilt für alle Standort-Apps (106, 812, 872, 120). Die Versionsnummer steht oben im Header der App.

## 1.4.0 – 13.11.2026
- **Neu:** In der Lagerplatz-Erfassung werden **mehrere Lagerplätze gesammelt** und am Schluss in **einer Mail** gesendet. Bisher ging pro Lagerplatz eine eigene Mail raus.
  - Nach jedem Platz auf **„Lagerplatz abschließen – nächsten erfassen"** tippen. Erst **„Alles senden"** verschickt alles zusammen.
  - Abgeschlossene Lagerplätze stehen oben in einer Liste. Man kann sie dort nachträglich bearbeiten oder wieder entfernen.
  - Der Zwischenstand wird automatisch auf dem Tablet gespeichert. Wird die App geschlossen, geht die Erfassung beim nächsten Öffnen weiter. Auf der Startseite steht sie solange als „In Arbeit".
  - Die Mail enthält einen Bericht mit allen Lagerplätzen und eine gemeinsame SAP-Massenänderungs-Datei.
  - Wurde ein Artikel in derselben Erfassung auf **mehreren Lagerplätzen** gefunden, kommt er nicht in die SAP-Datei. Er steht in der Mail unter „Bitte klären", weil ein Artikel nur einen Hauptlagerplatz haben kann.

## 1.3.2 – 12.11.2026
- **Neu:** Warnung in der Lagerplatz-Erfassung, wenn der gescannte Lagerplatz für einen Artikel bereits als **Referenzlagerplatz** eingetragen ist.
  - Im Kamerabild wird der Rahmen rot, das Tablet vibriert länger, und oben steht dauerhaft ein Hinweis mit der Artikelnummer.
  - In der Liste ist der Artikel rot markiert und der Hauptlagerplatz laut System wird angezeigt.
  - Diese Artikel kommen nicht in die SAP-Massenänderung, weil sich damit nur Hauptlagerplätze ändern lassen. Im Mailtext stehen sie als „ACHTUNG".

## 1.3.1 – 12.11.2026
- **Neu:** Die Mail der Lagerplatz-Erfassung hat einen **zweiten Excel-Anhang im Format der Massenänderung** (MATNR, WERKS, LGORT, LGPBE). Er enthält nur Artikel, die laut System auf einem anderen Platz stehen. Der erfasste Lagerplatz wird dort als neuer Hauptlagerplatz eingetragen.
- Vor dem Senden zeigt die App, wie viele Artikel in diese Datei kommen.

## 1.3.0 – 12.11.2026
- **Neu: Lagerplatz-Erfassung (Kamera).**
  - Ablauf: Lagerplatz wählen, Kamera über die Ware halten. Alle sichtbaren Barcodes (EAN oder Artikelnummer) werden gleichzeitig erfasst.
  - Erfasst wird, welche Artikel auf dem Platz stehen, nicht die Menge.
  - Jeder Artikel wird mit dem System abgeglichen: „passt", „abweichend", „ohne Referenz" oder „unbekannter Code".
  - Lagerplatz-Etiketten im Bild werden ignoriert. Gehören mehrere Artikel zu einer EAN, kann man den richtigen auswählen. Artikel lassen sich von Hand ergänzen.
  - Versand als Excel an die Standort-Mailadresse.

## 1.2.0 – 12.11.2026
- **Neu:** Rund 98.700 Artikel haben jetzt ihren **EAN-Code** hinterlegt.
  - **Suche:** Ab 6 Ziffern wird auch die EAN durchsucht. Der Treffer zeigt dann „· EAN …" an.
  - **Scan:** Ein gescannter EAN wird direkt in die passende Artikelnummer umgesetzt und die Bezeichnung automatisch eingetragen. Das gilt in allen Formularen, auch in der Massen-Lagerplatzkorrektur.

## 1.1.0 – 04.11.2026
- **Geändert:** Bei der Verschrottung ist **mindestens ein Foto Pflicht**. Ein Hinweistext erklärt das. Ohne Foto lässt sich die Meldung nicht senden.

## 1.0.0 – 08.09.2026
- WEGO-VTI-Logo und Versionsnummer im Header.
- **Volltextsuche:** Mehrere Suchbegriffe werden kombiniert, die Reihenfolge ist egal. „schraube m8" findet zum Beispiel „Sechskantschraube M8x40".
- Unterscheidung zwischen Haupt- und Referenzlagerplatz bei der Lagerplatzänderung.
- Der aktuelle Lagerplatz laut System wird auch bei Lagerplatzänderung, Verschrottung und Fehlbestand angezeigt. Mehrere Lagerplätze je Artikel werden unterstützt, der Hauptlagerplatz ist markiert.

## Aufbauphase – August/September 2026
- 17.08.: Erste Version mit Lagerplatzänderung und Verschrottung. Die echte Artikelliste mit rund 153.000 Artikeln ist eingespielt. Meldungen werden automatisch per Mail verschickt.
- 17.08.: Jede Meldung wird einzeln und sofort versendet. Verschrottung kommt als PDF mit Foto.
- 20.08.: **Neu:** Massen-Lagerplatzkorrektur zur Inventurvorbereitung, inzwischen im SAP-Upload-Format.
- 21.08.: „Gemeldet von" ist Pflicht und wird aus der Mitarbeiterliste gewählt statt frei eingetippt.
- 28.08.: **Neu:** Fehlbestand melden. Bei Verschrottung sind bis zu 4 Fotos möglich.
- 02.09.: Fehler behoben, durch den bei manchen Artikeln die Beschreibung in der Artikelnummer stand.
- 23.09.: Fehler behoben, durch den Fehlbestandsmeldungen nicht per Mail ankamen.

## Standorte
| Standort | Online seit |
|---|---|
| 106 | 17.08.2026 |
| 812 | 02.09.2026 |
| 872 | 18.09.2026 |
| 120 Westerkappeln | 04.11.2026 |

Seitdem werden Listen laufend aktualisiert, zum Beispiel Mitarbeiter (106: 15 neue Kollegen am 11.09.) und Lagerplätze (106: Abgleich mit der Gesamtliste am 11.11.).
