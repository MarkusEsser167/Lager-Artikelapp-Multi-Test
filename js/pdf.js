import { formatDate } from './format.js';

const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PHOTO_BOX_W = 85;
const PHOTO_BOX_H = 62;
const PHOTO_GAP = 6;

function loadImageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function grundText(m) {
  return m.grund === 'Sonstiges' && m.grundSonstiges ? `Sonstiges – ${m.grundSonstiges}` : m.grund || '';
}

export async function buildVerschrottungPdf(m) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Verschrottungsmeldung', MARGIN, y);
  y += 10;

  doc.setFontSize(10);
  function row(label, value) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(String(value || '–'), CONTENT_W - 45);
    doc.text(lines, MARGIN + 45, y);
    y += Math.max(6, lines.length * 5);
  }

  row('Datum', formatDate(m.createdAt));
  row('Artikelnummer', m.artikelnummer);
  row('Artikelbezeichnung', m.artikelbezeichnung);
  row('Menge', m.menge);
  row('Grund', grundText(m));
  row('Bemerkung', m.bemerkung);
  row('Gemeldet von', m.melder);

  // Bis zu 4 Fotos, 2-spaltig eingebettet (analog zum Muster der WeGo-VTI-Unfallaufnahme-App).
  const fotos = (m.fotos && m.fotos.length ? m.fotos : m.foto ? [m.foto] : []).slice(0, 4);
  if (fotos.length) {
    y += 5;
    const sizes = await Promise.all(fotos.map(loadImageSize));
    fotos.forEach((foto, i) => {
      const col = i % 2;
      if (col === 0 && y + PHOTO_BOX_H > PAGE_H - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      const x = MARGIN + col * (PHOTO_BOX_W + PHOTO_GAP);
      const size = sizes[i];
      if (size) {
        let w = PHOTO_BOX_W;
        let h = (size.h / size.w) * PHOTO_BOX_W;
        if (h > PHOTO_BOX_H) {
          h = PHOTO_BOX_H;
          w = (size.w / size.h) * PHOTO_BOX_H;
        }
        try {
          doc.addImage(foto, 'JPEG', x + (PHOTO_BOX_W - w) / 2, y + (PHOTO_BOX_H - h) / 2, w, h, undefined, 'FAST');
        } catch (e) {
          // ungültiges Bild ignorieren, Rest des Berichts bleibt gültig
        }
      }
      if (col === 1 || i === fotos.length - 1) {
        y += PHOTO_BOX_H + PHOTO_GAP;
      }
    });
  }

  const safeArtikel = (m.artikelnummer || 'artikel').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const filename = `Verschrottung_${safeArtikel}_${m.id}.pdf`;
  return { doc, filename };
}
