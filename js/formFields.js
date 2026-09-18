import { scanBarcode, isScanSupported } from './barcode.js';

// Baut ein Textfeld mit Scan-Button (Barcode/QR über Kamera) und optional einer
// Trefferliste aus einer hinterlegten Vorgabeliste (Artikel-/Lagerplatzliste), die
// beim Tippen oder nach einem Scan gefiltert wird. onSelect wird bei einem Treffer
// aufgerufen (z.B. um die Artikelbezeichnung automatisch mit einzutragen).
export function scanField({ id, label, placeholder = '', items = null, valueKey, labelKey, onSelect }) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = `
    <label class="field-label" for="${id}">${label}</label>
    <div class="scan-input-row">
      <input id="${id}" type="text" placeholder="${placeholder}" autocomplete="off" />
      ${isScanSupported() ? '<button type="button" class="btn btn-ghost btn-scan">📷 Scannen</button>' : ''}
    </div>
  `;
  const input = wrap.querySelector('input');
  const scanBtn = wrap.querySelector('.btn-scan');

  let resultsBox = null;
  if (items && items.length) {
    resultsBox = document.createElement('div');
    resultsBox.className = 'lookup-results';
    wrap.appendChild(resultsBox);

    const showResults = (query) => {
      resultsBox.innerHTML = '';
      const q = query.trim().toLowerCase();
      // Erst ab 2 Zeichen suchen – bei sehr großen Listen (z.B. 150.000+ Artikeln) wäre
      // ein Treffer auf 1 Zeichen weder aussagekräftig noch beim Tippen flüssig.
      if (q.length < 2) return;
      // Volltextsuche über mehrere Wörter: jedes eingegebene Wort muss irgendwo in
      // Nummer + Bezeichnung vorkommen (Reihenfolge egal), z.B. "schraube m8" findet
      // "Sechskantschraube M8x40" ebenso wie "M8 Schraube verzinkt".
      const terms = q.split(/\s+/).filter(Boolean);
      const matches = items
        .filter((it) => {
          const haystack = `${it[valueKey]} ${it[labelKey] || ''}`.toLowerCase();
          return terms.every((t) => haystack.includes(t));
        })
        .slice(0, 8);
      matches.forEach((m) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'lookup-result-row';
        row.textContent = m[labelKey] ? `${m[valueKey]} – ${m[labelKey]}` : m[valueKey];
        row.addEventListener('mousedown', (e) => e.preventDefault()); // Klick vor Blur behalten
        row.addEventListener('click', () => {
          input.value = m[valueKey];
          resultsBox.innerHTML = '';
          if (onSelect) onSelect(m);
        });
        resultsBox.appendChild(row);
      });
    };

    // Debounce: bei sehr großen Listen soll nicht bei jedem Tastendruck sofort gefiltert werden.
    let debounceTimer = null;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => showResults(input.value), 150);
    });
    input.addEventListener('blur', () => setTimeout(() => { resultsBox.innerHTML = ''; }, 150));

    const findExact = (value) => items.find((it) => it[valueKey].toLowerCase() === value.trim().toLowerCase());
    input.addEventListener('change', () => {
      const match = findExact(input.value);
      if (match && onSelect) onSelect(match);
    });
  }

  if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
      const value = await scanBarcode({ title: label });
      if (value) {
        input.value = value;
        input.dispatchEvent(new Event('change'));
      }
    });
  }

  return { wrap, input };
}

// Baut ein <select> mit fester Optionsliste (z.B. Mitarbeiterliste) – bewusst kein Textfeld,
// damit keine Freitext-Eingabe möglich ist. value wird nur vorbelegt, wenn sie tatsächlich in
// der aktuellen Optionsliste vorkommt (z.B. falls ein Mitarbeiter zwischenzeitlich entfernt wurde).
export function selectField({ id, label, options = [], value = '', placeholder = '– Bitte wählen –' }) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const optionsHtml = options.map((o) => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`).join('');
  wrap.innerHTML = `
    <label class="field-label" for="${id}">${label}</label>
    <select id="${id}">
      <option value="">${escapeHtml(placeholder)}</option>
      ${optionsHtml}
    </select>
  `;
  const input = wrap.querySelector('select');
  if (value && options.includes(value)) input.value = value;
  return { wrap, input };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}
