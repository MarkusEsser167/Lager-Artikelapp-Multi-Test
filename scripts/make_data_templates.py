"""Referenz-Vorlagen für Artikel- und Lagerplatzliste (Spaltenformat).

data/artikelliste.xlsx und data/lagerplatzliste.xlsx enthalten inzwischen echte Daten
und werden hier NICHT mehr automatisch erzeugt/überschrieben. Die Funktionen unten
dienen nur noch als Referenz für das erwartete Spaltenformat, falls eine der Dateien
mal komplett neu aufgebaut werden muss (z.B. call make_artikelliste("pfad.xlsx")).
"""
from openpyxl import Workbook

def make_artikelliste(path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Artikel"
    ws.append(["Artikelnummer", "Bezeichnung"])
    ws.append(["ART-10001", "Sechskantschraube M8x40"])
    ws.append(["ART-10002", "Kabelbinder 200mm schwarz"])
    ws.append(["ART-10003", "Arbeitshandschuhe Gr. L"])
    wb.save(path)

def make_lagerplatzliste(path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Lagerplaetze"
    ws.append(["Lagerplatz"])
    ws.append(["A-01-01"])
    ws.append(["A-01-02"])
    ws.append(["B-05-01"])
    wb.save(path)

if __name__ == "__main__":
    print("Nichts zu tun – data/*.xlsx enthalten bereits echte Daten. "
          "Siehe Docstring, falls eine Vorlage neu erzeugt werden soll.")
