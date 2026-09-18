import { getStandortCode } from './db.js';

// Lädt Artikel-, Lagerplatz- und Standortliste als Vorschlagsquelle für die Formulare.
// Die Dateien liegen als Excel im Repo und können dort ausgetauscht werden, ohne dass sich
// am App-Code etwas ändert – die App liest bei jedem Laden die aktuelle Version (Service
// Worker cached sie zusätzlich für offline). Multi-Standort-App: data/artikelliste.xlsx und
// data/standorte.xlsx sind standortübergreifend geteilt; Lagerplatz-, Artikel-Lagerplatz- und
// Mitarbeiterliste liegen je Standort unter data/<Standort-Code>/ (siehe STANDORTE_URL).
const ARTIKEL_URL = './data/artikelliste.xlsx';
const STANDORTE_URL = './data/standorte.xlsx';
const standortUrl = (datei) => `./data/${getStandortCode()}/${datei}`;

const ARTIKEL_ALIASES = {
  nummer: ['artikelnummer', 'artikel-nr', 'artikelnr', 'nummer', 'artikel', 'material', 'materialnummer'],
  // Mehrere Text-Spalten (z.B. SAP-Kurztext über mehrere Zeilen) werden zu einer
  // Bezeichnung zusammengefügt – parseSheet() sammelt dafür ALLE passenden Spalten.
  bezeichnung: [
    'bezeichnung', 'beschreibung', 'artikelbezeichnung', 'artikeltext', 'kurztext',
    'materialkurztext', 'materialkurztext 2', 'materialkurztext 3',
    'artikelkurztext', 'artikelkurztext 2', 'artikelkurztext 3',
  ],
};
const LAGERPLATZ_ALIASES = {
  code: ['lagerplatz', 'platz', 'code', 'lagerplatz-code', 'lagerplatzcode'],
  bezeichnung: ['bezeichnung', 'bereich', 'zone', 'beschreibung'],
};
// Referenzliste für die Massen-Lagerplatzkorrektur: welcher Artikel steht laut System
// aktuell auf welchem Lagerplatz (z.B. SAP-Export mit zusätzlicher Lagerplatz-Spalte). Ein
// Artikel kann mehrfach vorkommen (mehrere Lagerplätze); "KZ Hlp" markiert den Hauptlagerplatz
// – siehe groupArtikelLagerplatz(), das die Zeilen pro Artikel zu einem Eintrag zusammenfasst.
const ARTIKEL_LAGERPLATZ_ALIASES = {
  nummer: ARTIKEL_ALIASES.nummer,
  bezeichnung: ARTIKEL_ALIASES.bezeichnung,
  lagerplatz: LAGERPLATZ_ALIASES.code,
  hauptlagerplatz: ['kz hlp', 'hlp', 'hauptlagerplatz'],
};
// Bewusst kuratierte Teilmenge NUR für den Teilstring-Fallback (siehe parseSheet): erkennt
// Kopfzeilen wie "FIS/wms®  Lagerplatz", die "Lagerplatz" nicht exakt, aber als Wortteil
// enthalten. Absichtlich OHNE die generischen, kurzen Aliase wie "artikel"/"material"/"code" -
// die kollidieren sonst mit Spalten wie "Artikelkurztext 2" oder "Materialart".
const LOOSE_ALIASES = {
  code: ['lagerplatz'],
  lagerplatz: ['lagerplatz'],
};
// Mitarbeiterliste für die "Gemeldet von"-Auswahl (kein Freitext mehr möglich).
const MITARBEITER_ALIASES = {
  name: ['name', 'mitarbeiter', 'melder', 'benutzer'],
};
// Standort-Registry (data/standorte.xlsx): ein neuer Standort braucht NUR eine neue Zeile
// hier + einen neuen data/<Code>/-Ordner mit den drei Standort-Dateien – kein Code-Deploy.
const STANDORTE_ALIASES = {
  code: ['code', 'standort', 'standortcode'],
  name: ['name', 'bezeichnung', 'standortname'],
  zentraleMail: ['zentrale mailadresse', 'zentrale email', 'mailadresse', 'mail'],
  verschrottungMail: ['verschrottung mailadresse(n)', 'verschrottung mailadresse', 'verschrottung mail', 'verschrottung'],
  sapWerk: ['sap werk', 'werk', 'werks'],
  sapLgort: ['sap lagerort', 'lagerort', 'lgort'],
};

async function fetchWorkbook(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} nicht gefunden (${res.status})`);
  const buf = await res.arrayBuffer();
  return window.XLSX.read(buf, { type: 'array' });
}

function parseSheet(wb, aliasMap, looseAliasMap = {}) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) return [];

  const keys = Object.keys(aliasMap);
  const primaryKey = keys[0];
  const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
  // Für jeden Schlüssel ALLE passenden Spalten sammeln (nicht nur die erste) – so werden
  // z.B. mehrzeilige SAP-Kurztexte (Materialkurztext, Artikelkurztext 2, …) automatisch
  // zu einer einzigen Bezeichnung zusammengefügt.
  //
  // Jede Spalte wird höchstens einem Schlüssel zugeordnet, in zwei Durchgängen: zuerst exakte
  // Treffer gegen aliasMap, erst danach Teilstring-Treffer gegen die viel engere looseAliasMap
  // (z.B. nur "lagerplatz", für Kopfzeilen wie "FIS/wms®  Lagerplatz"). Generische Aliase wie
  // "artikel"/"material"/"code" werden bewusst NIE als Teilstring geprüft – sonst würde z.B.
  // "artikel" fälschlich auch in "Artikelkurztext 2" matchen, obwohl die Spalte exakt zur
  // Bezeichnung gehört, und die Artikelnummer würde die komplette Beschreibung mit enthalten.
  const colIdxByKey = {};
  keys.forEach((key) => { colIdxByKey[key] = []; });
  const claimed = new Array(header.length).fill(false);

  header.forEach((h, i) => {
    if (!h) return;
    const key = keys.find((k) => aliasMap[k].includes(h));
    if (key) {
      colIdxByKey[key].push(i);
      claimed[i] = true;
    }
  });
  header.forEach((h, i) => {
    if (claimed[i] || !h) return;
    const key = keys.find((k) => (looseAliasMap[k] || []).some((alias) => h.includes(alias)));
    if (key) {
      colIdxByKey[key].push(i);
      claimed[i] = true;
    }
  });
  // Nur die erste Spalte (z.B. Artikelnummer/Lagerplatz) muss erkannt werden – weitere
  // Spalten wie Bezeichnung sind optional und bleiben sonst einfach leer.
  const headerRecognized = colIdxByKey[primaryKey].length > 0;
  // Ohne erkennbare Kopfzeile wird positionell gelesen (1. Spalte = erster Schlüssel usw.)
  const dataRows = headerRecognized ? rows.slice(1) : rows;

  return dataRows
    .map((row) => {
      const item = {};
      keys.forEach((key, i) => {
        const idxs = headerRecognized ? colIdxByKey[key] : [i];
        item[key] = idxs.map((idx) => String(row[idx] ?? '').trim()).filter(Boolean).join(' ');
      });
      return item;
    })
    .filter((item) => item[primaryKey]);
}

// Fasst mehrere Zeilen je Artikel (ein Eintrag pro Lagerplatz) zu einem Eintrag zusammen,
// damit der Rest der App (Suche, Anzeige) weiterhin einfach mit einem "lagerplatz"-String pro
// Artikel arbeiten kann. Der Hauptlagerplatz (KZ Hlp = "X") wird zuerst genannt und markiert;
// bei nur einem Lagerplatz bleibt die Anzeige unverändert schlicht (kein "(Haupt)"-Zusatz).
function groupArtikelLagerplatz(rows) {
  const order = [];
  const byNummer = new Map();
  for (const row of rows) {
    if (!byNummer.has(row.nummer)) {
      byNummer.set(row.nummer, { bezeichnung: row.bezeichnung, locations: [] });
      order.push(row.nummer);
    }
    const entry = byNummer.get(row.nummer);
    if (!entry.bezeichnung) entry.bezeichnung = row.bezeichnung;
    if (row.lagerplatz) entry.locations.push({ code: row.lagerplatz, haupt: row.hauptlagerplatz === 'X' });
  }
  return order.map((nummer) => {
    const { bezeichnung, locations } = byNummer.get(nummer);
    const sorted = [...locations].sort((a, b) => Number(b.haupt) - Number(a.haupt));
    const lagerplatz =
      sorted.length > 1 ? sorted.map((l) => (l.haupt ? `${l.code} (Haupt)` : l.code)).join(', ') : sorted[0]?.code || '';
    return { nummer, bezeichnung, lagerplatz };
  });
}

// Die Artikelliste kann mehrere zehntausend Zeilen haben und braucht spürbar Zeit zum
// Parsen – der Promise selbst wird gecacht (nicht erst das Ergebnis), damit gleichzeitige
// Aufrufe (z.B. Startseite + direkt geöffnetes Formular) sich einen Ladevorgang teilen.
// Die standortabhängigen Listen werden PRO STANDORT gecacht (Map statt einzelner Variable),
// da beim Standortwechsel innerhalb derselben Seite neu geladen werden muss.
let artikelPromise = null;
let standortePromise = null;
const lagerplatzPromiseBySite = new Map();
const artikelLagerplatzPromiseBySite = new Map();
const mitarbeiterPromiseBySite = new Map();

export function loadArtikelListe() {
  if (!artikelPromise) {
    artikelPromise = fetchWorkbook(ARTIKEL_URL)
      .then((wb) => parseSheet(wb, ARTIKEL_ALIASES))
      .catch((err) => {
        console.warn('Artikelliste konnte nicht geladen werden:', err.message);
        return [];
      });
  }
  return artikelPromise;
}

// Standort-Registry – ein Eintrag pro Standort (Code, Name, Empfänger, SAP-Werk/-Lagerort).
// Wird sowohl für die Standortauswahl als auch vom Export (Empfänger/WERKS/LGORT) genutzt.
export function loadStandorteListe() {
  if (!standortePromise) {
    standortePromise = fetchWorkbook(STANDORTE_URL)
      .then((wb) => parseSheet(wb, STANDORTE_ALIASES))
      .catch((err) => {
        console.warn('Standortliste konnte nicht geladen werden:', err.message);
        return [];
      });
  }
  return standortePromise;
}

export async function getCurrentStandort() {
  const code = getStandortCode();
  if (!code) return null;
  const standorte = await loadStandorteListe();
  return standorte.find((s) => s.code === code) || null;
}

export function loadLagerplatzListe() {
  const site = getStandortCode();
  if (!lagerplatzPromiseBySite.has(site)) {
    lagerplatzPromiseBySite.set(site, fetchWorkbook(standortUrl('lagerplatzliste.xlsx'))
      .then((wb) => parseSheet(wb, LAGERPLATZ_ALIASES, LOOSE_ALIASES))
      .catch((err) => {
        console.warn('Lagerplatzliste konnte nicht geladen werden:', err.message);
        return [];
      }));
  }
  return lagerplatzPromiseBySite.get(site);
}

export function loadArtikelLagerplatzListe() {
  const site = getStandortCode();
  if (!artikelLagerplatzPromiseBySite.has(site)) {
    artikelLagerplatzPromiseBySite.set(site, fetchWorkbook(standortUrl('artikel-lagerplatz.xlsx'))
      .then((wb) => groupArtikelLagerplatz(parseSheet(wb, ARTIKEL_LAGERPLATZ_ALIASES, LOOSE_ALIASES)))
      .catch((err) => {
        console.warn('Artikel-Lagerplatz-Referenzliste konnte nicht geladen werden:', err.message);
        return [];
      }));
  }
  return artikelLagerplatzPromiseBySite.get(site);
}

// Gibt eine einfache Liste von Namen zurück (nicht Objekte wie die anderen Listen), da sie
// direkt als <select>-Optionen für die "Gemeldet von"-Auswahl verwendet wird.
export function loadMitarbeiterListe() {
  const site = getStandortCode();
  if (!mitarbeiterPromiseBySite.has(site)) {
    mitarbeiterPromiseBySite.set(site, fetchWorkbook(standortUrl('mitarbeiter.xlsx'))
      .then((wb) => parseSheet(wb, MITARBEITER_ALIASES).map((item) => item.name))
      .catch((err) => {
        console.warn('Mitarbeiterliste konnte nicht geladen werden:', err.message);
        return [];
      }));
  }
  return mitarbeiterPromiseBySite.get(site);
}
