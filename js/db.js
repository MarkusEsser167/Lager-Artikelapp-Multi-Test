// Minimaler IndexedDB-Layer für Lagermeldungen. Jede Meldung ist ein einziges
// in sich geschlossenes JSON-Dokument (inkl. optionalem Foto als data-URL),
// damit es 1:1 in den Excel-Export übernommen werden kann.
const DB_NAME = 'lager-meldung';
const DB_VERSION = 1;
const STORE_MELDUNGEN = 'meldungen';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MELDUNGEN)) {
        const store = db.createObjectStore(STORE_MELDUNGEN, { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('type', 'type');
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrapReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const MeldungStore = {
  async saveMeldung(meldung) {
    meldung.updatedAt = new Date().toISOString();
    const store = await tx(STORE_MELDUNGEN, 'readwrite');
    await wrapReq(store.put(meldung));
    return meldung;
  },
  async getMeldung(id) {
    const store = await tx(STORE_MELDUNGEN, 'readonly');
    return wrapReq(store.get(id));
  },
  async listMeldungen() {
    const store = await tx(STORE_MELDUNGEN, 'readonly');
    const all = await wrapReq(store.getAll());
    return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },
  async deleteMeldung(id) {
    const store = await tx(STORE_MELDUNGEN, 'readwrite');
    return wrapReq(store.delete(id));
  },
  async updateStatus(id, status) {
    const store = await tx(STORE_MELDUNGEN, 'readwrite');
    const rec = await wrapReq(store.get(id));
    if (!rec) return;
    rec.status = status;
    rec.sentAt = new Date().toISOString();
    return wrapReq(store.put(rec));
  },
};

export function newId(prefix = 'm') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const MELDER_KEY = 'lager-meldung.melder';
export function getMelderName() {
  return localStorage.getItem(MELDER_KEY) || '';
}
export function setMelderName(name) {
  localStorage.setItem(MELDER_KEY, name || '');
}

// Standort-Zuordnung des Geräts (siehe data/standorte.xlsx) – wird einmal beim ersten
// Öffnen gewählt und lokal gemerkt, damit auf einem fest an einem Standort stehenden Tablet
// nicht bei jeder Meldung neu ausgewählt werden muss. WICHTIG: das ist ausschließlich eine
// Komfort-/Geräte-Einstellung ohne Anmeldung dahinter – sie verhindert nicht, dass jemand
// bewusst den Standort wechselt und für einen anderen Standort meldet. Eine echte Trennung
// nach Person bräuchte eine serverseitig geprüfte Anmeldung (siehe README).
const STANDORT_KEY = 'lager-meldung.standort';
export function getStandortCode() {
  return localStorage.getItem(STANDORT_KEY) || '';
}
export function setStandortCode(code) {
  localStorage.setItem(STANDORT_KEY, code || '');
}
export function clearStandortCode() {
  localStorage.removeItem(STANDORT_KEY);
}
