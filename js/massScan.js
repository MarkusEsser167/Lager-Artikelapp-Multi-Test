// Kamera-Mehrfacherkennung für die Lagerplatz-Erfassung: erkennt ALLE Barcodes, die gleichzeitig
// im Kamerabild zu sehen sind (BarcodeDetector.detect() liefert ein Array), und sammelt sie
// fortlaufend, bis der Nutzer auf „Fertig" tippt. Anders als scanBarcode() (barcode.js, bricht
// nach dem ersten Treffer ab) bleibt die Kamera offen.
//
// Zuverlässigkeit: Ein Code zählt erst als erfasst, wenn er in mindestens zwei Erkennungsläufen
// gesehen wurde – das filtert Fehllesungen von 1D-Codes bei Bewegung/Unschärfe heraus.
const FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf', 'data_matrix'];
const MIN_SIGHTINGS = 2;
const DETECT_INTERVAL_MS = 150;

export function isMultiScanSupported() {
  return 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// lookup(rawValue) -> { label, known, warn, short } | null : liefert die Anzeige für einen erfassten
// Code (z.B. Artikelnummer + Bezeichnung), damit man im Overlay sofort sieht, was erkannt wurde.
// warn = true markiert den Code rot und listet ihn dauerhaft als Warnung (short = Kurzname).
// initial: bereits erfasste Rohwerte (werden mitgezählt und nicht doppelt gemeldet).
// onCapture(rawValue): wird einmal je neu erkanntem Code aufgerufen; gibt es false zurück, wird der
// Code nicht mitgezählt (grau markiert), z.B. bei einem Lagerplatz-Etikett oder bereits erfasstem Artikel.
// Gibt die Liste aller erfassten Rohwerte (Reihenfolge der Erfassung) zurück, sobald „Fertig"
// gedrückt wird; bei Abbruch/Fehler null (nichts verloren: onCapture lief ja schon).
export function startMultiScan({ title = 'Mehrfach-Scan', lookup = () => null, initial = [], onCapture = () => {} } = {}) {
  return new Promise(async (resolve) => {
    if (!isMultiScanSupported()) {
      alert('Die Mehrfach-Erkennung per Kamera wird auf diesem Gerät/Browser nicht unterstützt.');
      resolve(null);
      return;
    }

    let stream = null;
    let stopped = false;
    let timer = null;
    const captured = [...initial];
    const capturedSet = new Set(initial);
    const ignoredSet = new Set(); // vom Aufrufer abgelehnte Codes (z.B. Lagerplatz-Etikett, schon erfasster Artikel)
    const sightings = new Map(); // Rohwert -> Anzahl Erkennungsläufe

    const overlay = document.createElement('div');
    overlay.className = 'scan-overlay multi-scan';
    overlay.innerHTML = `
      <div class="scan-topbar">
        <span>${escapeHtml(title)}</span>
        <button type="button" class="multi-done">Fertig</button>
      </div>
      <div class="multi-stage">
        <video class="multi-video" autoplay muted playsinline></video>
        <canvas class="multi-canvas"></canvas>
      </div>
      <div class="multi-panel">
        <div class="multi-count"></div>
        <div class="multi-warn" hidden></div>
        <div class="multi-latest"></div>
        <div class="multi-hint">Kamera ruhig über die Ware halten – alle sichtbaren Barcodes werden erfasst.
          Grün = erfasst, rot = erfasst mit Warnung, gelb = wird geprüft, grau = ignoriert.</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const video = overlay.querySelector('.multi-video');
    const canvas = overlay.querySelector('.multi-canvas');
    const ctx = canvas.getContext('2d');
    const countEl = overlay.querySelector('.multi-count');
    const latestEl = overlay.querySelector('.multi-latest');
    const warnEl = overlay.querySelector('.multi-warn');

    function renderPanel() {
      countEl.textContent = `${captured.length} Code${captured.length === 1 ? '' : 's'} erfasst`;
      latestEl.innerHTML = '';
      captured.slice(-4).reverse().forEach((raw) => {
        const info = lookup(raw);
        const chip = document.createElement('div');
        chip.className = 'multi-chip' + (info && info.warn ? ' warn' : info && info.known ? ' known' : ' unknown');
        chip.textContent = info && info.label ? info.label : `Unbekannter Code ${raw}`;
        latestEl.appendChild(chip);
      });
      // Warnungen bleiben dauerhaft sichtbar (die Chip-Liste zeigt nur die letzten 4 Codes).
      const warnungen = captured.map((raw) => lookup(raw)).filter((info) => info && info.warn);
      warnEl.hidden = !warnungen.length;
      warnEl.textContent = warnungen.length
        ? `⚠️ ${warnungen.length} Artikel: Lagerplatz ist bereits Referenzlagerplatz – ${warnungen.map((w) => w.short || w.label).join(', ')}`
        : '';
    }
    renderPanel();

    function finish(result) {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      overlay.remove();
      resolve(result);
    }
    overlay.querySelector('.multi-done').addEventListener('click', () => finish([...captured]));

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
    } catch (err) {
      overlay.remove();
      alert('Kamera konnte nicht geöffnet werden: ' + err.message);
      resolve(null);
      return;
    }
    video.srcObject = stream;
    // Dauerfokus anfordern, wo unterstützt (Fehler hier sind unkritisch).
    try {
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
    } catch (err) {
      /* ignorieren */
    }

    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: FORMATS });
    } catch (err) {
      detector = new window.BarcodeDetector();
    }

    // Rahmen über dem Video zeichnen: das Video wird mit object-fit: contain angezeigt, die
    // Koordinaten der Erkennung beziehen sich auf die Videoauflösung → umrechnen.
    function drawBoxes(codes) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const scale = Math.min(w / vw, h / vh);
      const offX = (w - vw * scale) / 2;
      const offY = (h - vh * scale) / 2;
      codes.forEach((c) => {
        const accepted = capturedSet.has(c.rawValue);
        const ignored = ignoredSet.has(c.rawValue);
        const info = accepted ? lookup(c.rawValue) : null;
        const warn = !!(info && info.warn);
        ctx.lineWidth = 4;
        ctx.strokeStyle = ignored ? '#95a5a6' : warn ? '#e74c3c' : accepted ? '#2ecc71' : '#f1c40f';
        ctx.fillStyle = ignored ? 'rgba(149,165,166,0.2)' : warn ? 'rgba(231,76,60,0.3)' : accepted ? 'rgba(46,204,113,0.25)' : 'rgba(241,196,15,0.2)';
        const pts = c.cornerPoints && c.cornerPoints.length ? c.cornerPoints : null;
        ctx.beginPath();
        if (pts) {
          pts.forEach((p, i) => {
            const x = offX + p.x * scale;
            const y = offY + p.y * scale;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.closePath();
        } else if (c.boundingBox) {
          const b = c.boundingBox;
          ctx.rect(offX + b.x * scale, offY + b.y * scale, b.width * scale, b.height * scale);
        }
        ctx.fill();
        ctx.stroke();
      });
    }

    async function tick() {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          const codes = (await detector.detect(video)) || [];
          let added = false;
          let warned = false;
          codes.forEach((c) => {
            const raw = c.rawValue;
            if (!raw || capturedSet.has(raw) || ignoredSet.has(raw)) return;
            const n = (sightings.get(raw) || 0) + 1;
            sightings.set(raw, n);
            if (n >= MIN_SIGHTINGS) {
              if (onCapture(raw) === false) {
                ignoredSet.add(raw);
              } else {
                capturedSet.add(raw);
                captured.push(raw);
                added = true;
                const info = lookup(raw);
                if (info && info.warn) warned = true;
              }
            }
          });
          drawBoxes(codes);
          if (added) {
            // Warnung: deutlich längeres Doppel-Vibrieren statt kurzem Tick.
            if (navigator.vibrate) navigator.vibrate(warned ? [250, 120, 250] : 60);
            renderPanel();
          }
        }
      } catch (err) {
        // einzelner Durchlauf fehlgeschlagen – weiter versuchen
      }
      if (!stopped) timer = setTimeout(tick, DETECT_INTERVAL_MS);
    }
    tick();
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
