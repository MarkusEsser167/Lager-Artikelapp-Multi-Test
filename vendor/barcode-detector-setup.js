// Barcode-Erkennung für Browser ohne eigene BarcodeDetector-API (v.a. Safari auf iPhone/iPad,
// Firefox, Chrome unter Windows): vendor/barcode-detector-polyfill.js (npm "barcode-detector"
// 3.2.3, MIT, ZXing-C++ als WebAssembly) stellt window.BarcodeDetector bereit – nur dann, wenn der
// Browser selbst keinen hat (Android-Chrome nutzt weiter die eingebaute Erkennung).
// Die WASM-Datei liegt lokal im Repo (vendor/zxing_reader.wasm, zxing-wasm 3.1.6) statt vom CDN
// geladen zu werden – funktioniert damit auch offline (Service Worker precacht sie).
if (window.BarcodeDetectionAPI && window.BarcodeDetectionAPI.setZXingModuleOverrides) {
  window.BarcodeDetectionAPI.setZXingModuleOverrides({
    locateFile: (path, prefix) =>
      path.endsWith('.wasm') ? new URL('./vendor/zxing_reader.wasm', document.baseURI).href : prefix + path,
  });
}
