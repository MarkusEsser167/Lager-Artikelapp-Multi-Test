import { MeldungStore, newId, getMelderName, setMelderName } from '../db.js';
import { scanField, selectField } from '../formFields.js';
import { pickPhoto } from '../camera.js';
import { loadArtikelListe, loadMitarbeiterListe, loadArtikelLagerplatzListe } from '../refData.js';
import { sendVerschrottungMeldung } from '../export.js';

const GRUENDE = ['Beschädigt', 'Abgelaufen/verdorben', 'Falschlieferung', 'Retoure defekt', 'Sonstiges'];

export async function renderNewVerschrottung(container, router) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `<h1>Verschrottung melden</h1>`;
  const backBtn = document.createElement('button');
  backBtn.className = 'btn-back';
  backBtn.textContent = '← Zurück';
  backBtn.addEventListener('click', () => router.navigate(''));
  container.appendChild(backBtn);
  container.appendChild(header);

  const loading = document.createElement('div');
  loading.className = 'empty-state';
  loading.textContent = 'Lade Artikel- und Mitarbeiterliste…';
  container.appendChild(loading);

  const [artikelListe, mitarbeiterListe, artikelLagerplatzListe] = await Promise.all([
    loadArtikelListe(),
    loadMitarbeiterListe(),
    loadArtikelLagerplatzListe(),
  ]);
  loading.remove();

  const section = document.createElement('div');
  section.className = 'section';
  container.appendChild(section);

  const bezeichnung = simpleField({ id: 'artikelbezeichnung', label: 'Artikelbezeichnung (optional)' });

  const aktuellerLagerplatzBox = document.createElement('div');
  aktuellerLagerplatzBox.className = 'vehicle-selected';
  aktuellerLagerplatzBox.style.display = 'none';

  const artikel = scanField({
    id: 'artikelnummer',
    label: 'Artikelnummer',
    placeholder: 'Artikelnummer scannen, eingeben oder suchen',
    items: artikelListe,
    valueKey: 'nummer',
    labelKey: 'bezeichnung',
    onSelect: (m) => {
      bezeichnung.input.value = m.bezeichnung;
      showAktuellerLagerplatz(m.nummer);
    },
  });
  section.appendChild(artikel.wrap);
  section.appendChild(bezeichnung.wrap);
  section.appendChild(aktuellerLagerplatzBox);

  // Blendet den laut System aktuellen Lagerplatz ein (aus derselben Referenzliste wie bei der
  // Massen-Lagerplatzkorrektur), sofern für die Artikelnummer etwas hinterlegt ist.
  let aktuellerLagerplatzFuer = '';
  function showAktuellerLagerplatz(nummer) {
    const treffer = artikelLagerplatzListe.find((a) => a.nummer === nummer);
    aktuellerLagerplatzFuer = nummer;
    if (treffer && treffer.lagerplatz) {
      aktuellerLagerplatzBox.style.display = 'block';
      aktuellerLagerplatzBox.innerHTML = `Aktueller Lagerplatz (laut System): <strong>${escapeHtml(treffer.lagerplatz)}</strong>`;
    } else {
      aktuellerLagerplatzBox.style.display = 'none';
    }
  }
  // Wenn die Artikelnummer manuell geändert wird und nicht mehr zur zuletzt angezeigten
  // Nummer passt, die Anzeige verstecken statt einen veralteten Lagerplatz zu zeigen.
  artikel.input.addEventListener('input', () => {
    if (artikel.input.value.trim() !== aktuellerLagerplatzFuer) aktuellerLagerplatzBox.style.display = 'none';
  });

  const menge = simpleField({ id: 'menge', label: 'Menge (optional)', type: 'number' });
  section.appendChild(menge.wrap);

  // Grund
  const grundWrap = document.createElement('div');
  grundWrap.className = 'field';
  grundWrap.innerHTML = `<label class="field-label">Grund</label><div class="chip-row"></div>`;
  const chipRow = grundWrap.querySelector('.chip-row');
  let selectedGrund = '';
  GRUENDE.forEach((g) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = g;
    chip.addEventListener('click', () => {
      selectedGrund = g;
      chipRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip-active'));
      chip.classList.add('chip-active');
      sonstigesWrap.style.display = g === 'Sonstiges' ? 'block' : 'none';
    });
    chipRow.appendChild(chip);
  });
  section.appendChild(grundWrap);

  const sonstiges = simpleField({ id: 'grund-sonstiges', label: 'Grund (Freitext)' });
  const sonstigesWrap = sonstiges.wrap;
  sonstigesWrap.style.display = 'none';
  section.appendChild(sonstigesWrap);

  const bemerkung = simpleField({ id: 'bemerkung', label: 'Bemerkung (optional)', textarea: true });
  section.appendChild(bemerkung.wrap);

  // Fotos (bis zu MAX_PHOTOS, alle werden in die PDF eingebettet)
  const MAX_PHOTOS = 4;
  const photoWrap = document.createElement('div');
  photoWrap.className = 'field photo-field';
  photoWrap.innerHTML = `<label class="field-label">Fotos (optional, bis zu ${MAX_PHOTOS})</label>`;
  const photoBtn = document.createElement('button');
  photoBtn.type = 'button';
  photoBtn.className = 'btn btn-ghost';
  const photoGrid = document.createElement('div');
  photoGrid.className = 'photo-grid';
  const photos = [];

  function renderPhotoGrid() {
    photoGrid.innerHTML = '';
    photos.forEach((dataUrl, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'photo-thumb';
      thumb.innerHTML = `<img src="${dataUrl}" alt="Foto ${i + 1}" />`;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'photo-remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        photos.splice(i, 1);
        renderPhotoGrid();
      });
      thumb.appendChild(removeBtn);
      photoGrid.appendChild(thumb);
    });
    photoBtn.textContent = `📷 Foto hinzufügen (${photos.length}/${MAX_PHOTOS})`;
    photoBtn.disabled = photos.length >= MAX_PHOTOS;
  }
  renderPhotoGrid();

  photoBtn.addEventListener('click', async () => {
    if (photos.length >= MAX_PHOTOS) return;
    const dataUrl = await pickPhoto();
    if (dataUrl) {
      photos.push(dataUrl);
      renderPhotoGrid();
    }
  });
  photoWrap.appendChild(photoBtn);
  photoWrap.appendChild(photoGrid);
  section.appendChild(photoWrap);

  const melder = selectField({ id: 'melder', label: 'Gemeldet von *', options: mitarbeiterListe, value: getMelderName() });
  section.appendChild(melder.wrap);

  const actionBar = document.createElement('div');
  actionBar.className = 'action-bar';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-danger btn-block';
  saveBtn.textContent = 'Meldung senden';
  saveBtn.addEventListener('click', async () => {
    if (!artikel.input.value.trim()) {
      alert('Bitte eine Artikelnummer angeben.');
      artikel.input.focus();
      return;
    }
    if (!selectedGrund) {
      alert('Bitte einen Grund auswählen.');
      return;
    }
    if (selectedGrund === 'Sonstiges' && !sonstiges.input.value.trim()) {
      alert('Bitte den Grund im Freitext angeben.');
      sonstiges.input.focus();
      return;
    }
    if (!melder.input.value) {
      alert('Bitte deinen Namen auswählen.');
      melder.input.focus();
      return;
    }
    setMelderName(melder.input.value);
    saveBtn.disabled = true;
    saveBtn.textContent = 'Wird gesendet…';
    const meldung = {
      id: newId(),
      type: 'verschrottung',
      status: 'offen',
      createdAt: new Date().toISOString(),
      artikelnummer: artikel.input.value.trim(),
      artikelbezeichnung: bezeichnung.input.value.trim(),
      menge: menge.input.value.trim(),
      grund: selectedGrund,
      grundSonstiges: sonstiges.input.value.trim(),
      bemerkung: bemerkung.input.value.trim(),
      fotos: photos,
      melder: melder.input.value,
    };
    await MeldungStore.saveMeldung(meldung);
    try {
      const result = await sendVerschrottungMeldung(meldung);
      await MeldungStore.updateStatus(meldung.id, result.method === 'auto' ? 'gesendet' : 'manuell');
    } catch (err) {
      alert('Versand fehlgeschlagen: ' + err.message);
    }
    router.navigate('');
  });
  actionBar.appendChild(saveBtn);
  container.appendChild(actionBar);

  artikel.input.focus();
}

function simpleField({ id, label, type = 'text', textarea = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const control = textarea
    ? `<textarea id="${id}" rows="3"></textarea>`
    : `<input id="${id}" type="${type}" autocomplete="off" />`;
  wrap.innerHTML = `<label class="field-label" for="${id}">${label}</label>${control}`;
  const input = wrap.querySelector(textarea ? 'textarea' : 'input');
  return { wrap, input };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
