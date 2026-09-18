// Barcode/QR-Scan über die Tablet-Kamera mit der nativen BarcodeDetector-API
// (in Android-Chrome verfügbar). Läuft als Vollbild-Overlay und liefert den
// erkannten Text zurück; bei fehlender Unterstützung gibt es einen Hinweis,
// damit die aufrufende Stelle auf manuelle Eingabe zurückfällt.
const FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf'];

export function isScanSupported() {
  return 'BarcodeDetector' in window;
}

export function scanBarcode({ title = 'Barcode scannen' } = {}) {
  return new Promise(async (resolve) => {
    if (!isScanSupported()) {
      alert('Scannen wird auf diesem Gerät/Browser nicht unterstützt. Bitte manuell eingeben.');
      resolve(null);
      return;
    }

    let stream = null;
    let stopped = false;
    let rafId = null;

    const overlay = document.createElement('div');
    overlay.className = 'scan-overlay';
    overlay.innerHTML = `
      <div class="scan-topbar">
        <span>${title}</span>
        <button type="button" class="scan-close" aria-label="Schließen">✕</button>
      </div>
      <video class="scan-video" autoplay muted playsinline></video>
      <div class="scan-frame"></div>
      <div class="scan-hint">Barcode/QR-Code im Rahmen positionieren</div>
    `;
    document.body.appendChild(overlay);
    const video = overlay.querySelector('.scan-video');

    function cleanup(result) {
      if (stopped) return;
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      overlay.remove();
      resolve(result);
    }

    overlay.querySelector('.scan-close').addEventListener('click', () => cleanup(null));

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (err) {
      overlay.remove();
      alert('Kamera konnte nicht geöffnet werden: ' + err.message);
      resolve(null);
      return;
    }
    video.srcObject = stream;

    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: FORMATS });
    } catch (err) {
      detector = new window.BarcodeDetector();
    }

    async function tick() {
      if (stopped) return;
      try {
        const codes = await detector.detect(video);
        if (codes && codes.length) {
          if (navigator.vibrate) navigator.vibrate(80);
          cleanup(codes[0].rawValue);
          return;
        }
      } catch (err) {
        // einzelner Frame fehlgeschlagen – weiter versuchen
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  });
}
