import { MeldungStore, newId, getMelderName, setMelderName } from '../db.js';
import { scanField, selectField } from '../formFields.js';
import { loadArtikelListe, loadLagerplatzListe, loadMitarbeiterListe, loadArtikelLagerplatzListe } from '../refData.js';
import { sendLagerplatzMeldung } from '../export.js';

export async function renderNewLagerplatz(container, router) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `<h1>Lagerplatzänderung melden</h1>`;
  const backBtn = document.createElement('button');
  backBtn.className = 'btn-back';
  backBtn.textContent = '← Zurück';
  backBtn.addEventListener('click', () => router.navigate(''));
  container.appendChild(backBtn);
  container.appendChild(header);

  const loading = document.createElement('div');
  loading.className = 'empty-state';
  loading.textContent = 'Lade Artikel-, Lagerplatz- und Mitarbeiterliste…';
  container.appendChild(loading);

  const [artikelListe, lagerplatzListe, mitarbeiterListe, artikelLagerplatzListe] = await Promise.all([
    loadArtikelListe(),
    loadLagerplatzListe(),
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

  const artWrap = document.createElement('div');
  artWrap.className = 'field';
  artWrap.innerHTML = `<label class="field-label">Art des neuen Lagerplatzes</label><div class="chip-row"></div>`;
  const artChipRow = artWrap.querySelector('.chip-row');
  let selectedArt = '';
  ['Hauptlagerplatz', 'Referenzlagerplatz'].forEach((art) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = art;
    chip.addEventListener('click', () => {
      selectedArt = art;
      artChipRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip-active'));
      chip.classList.add('chip-active');
    });
    artChipRow.appendChild(chip);
  });
  section.appendChild(artWrap);

  const neuPlatz = scanField({
    id: 'neu-lagerplatz',
    label: 'Neuer Lagerplatz',
    placeholder: 'Lagerplatz scannen, eingeben oder suchen',
    items: lagerplatzListe,
    valueKey: 'code',
    labelKey: 'bezeichnung',
  });
  section.appendChild(neuPlatz.wrap);

  const bemerkung = simpleField({ id: 'bemerkung', label: 'Bemerkung (optional)', textarea: true });
  section.appendChild(bemerkung.wrap);

  const melder = selectField({ id: 'melder', label: 'Gemeldet von *', options: mitarbeiterListe, value: getMelderName() });
  section.appendChild(melder.wrap);

  const actionBar = document.createElement('div');
  actionBar.className = 'action-bar';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary btn-block';
  saveBtn.textContent = 'Meldung senden';
  saveBtn.addEventListener('click', async () => {
    if (!artikel.input.value.trim()) {
      alert('Bitte eine Artikelnummer angeben.');
      artikel.input.focus();
      return;
    }
    if (!selectedArt) {
      alert('Bitte angeben, ob es sich um den neuen Hauptlagerplatz oder einen Referenzlagerplatz handelt.');
      return;
    }
    if (!neuPlatz.input.value.trim()) {
      alert('Bitte den neuen Lagerplatz angeben.');
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
      type: 'lagerplatz',
      status: 'offen',
      createdAt: new Date().toISOString(),
      artikelnummer: artikel.input.value.trim(),
      artikelbezeichnung: bezeichnung.input.value.trim(),
      lagerplatzArt: selectedArt,
      neuLagerplatz: neuPlatz.input.value.trim(),
      bemerkung: bemerkung.input.value.trim(),
      melder: melder.input.value,
    };
    await MeldungStore.saveMeldung(meldung);
    try {
      const result = await sendLagerplatzMeldung(meldung);
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
