import { MeldungStore, newId, getMelderName, setMelderName, getStandortCode } from '../db.js';
import { scanField, selectField } from '../formFields.js';
import { loadArtikelLagerplatzListe, loadLagerplatzListe, loadMitarbeiterListe } from '../refData.js';
import { sendLagerplatzkorrekturBatch } from '../export.js';

export async function renderNewMassenkorrektur(container, router) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `
    <h1>Massen-Lagerplatzkorrektur</h1>
    <p class="view-subtitle">Zur Inventurvorbereitung: Artikel scannen, aktuellen Hauptlagerplatz prüfen und bei Bedarf korrigieren.</p>
  `;
  const backBtn = document.createElement('button');
  backBtn.className = 'btn-back';
  backBtn.textContent = '← Zurück';
  backBtn.addEventListener('click', () => router.navigate(''));
  container.appendChild(backBtn);
  container.appendChild(header);

  const notice = document.createElement('div');
  notice.className = 'notice-box';
  notice.innerHTML =
    '⚠️ Hier lässt sich nur der <strong>Hauptlagerplatz</strong> ändern (SAP-Massenupload). ' +
    'Für einen zusätzlichen <strong>Referenzlagerplatz</strong> bitte einzeln über ' +
    '„Lagerplatzänderung melden" auf der Startseite melden.';
  container.appendChild(notice);

  const loading = document.createElement('div');
  loading.className = 'empty-state';
  loading.textContent = 'Lade Referenzlisten…';
  container.appendChild(loading);

  const [artikelLagerplatzListe, lagerplatzListe, mitarbeiterListe] = await Promise.all([
    loadArtikelLagerplatzListe(),
    loadLagerplatzListe(),
    loadMitarbeiterListe(),
  ]);
  loading.remove();

  const status = document.createElement('div');
  status.className = 'ref-data-status';
  status.innerHTML = `
    <span>${artikelLagerplatzListe.length ? `📋 Referenzliste: ${artikelLagerplatzListe.length} Artikel mit Lagerplatz` : `⚠️ Referenzliste nicht gefunden (data/${getStandortCode()}/artikel-lagerplatz.xlsx)`}</span>
    <span>${lagerplatzListe.length ? `📋 Lagerplatzliste: ${lagerplatzListe.length} Plätze` : `⚠️ Lagerplatzliste nicht gefunden (data/${getStandortCode()}/lagerplatzliste.xlsx)`}</span>
    <span>${mitarbeiterListe.length ? `📋 Mitarbeiterliste: ${mitarbeiterListe.length} Personen` : `⚠️ Mitarbeiterliste nicht gefunden (data/${getStandortCode()}/mitarbeiter.xlsx)`}</span>
  `;
  container.appendChild(status);

  const section = document.createElement('div');
  section.className = 'section';
  container.appendChild(section);

  const infoBox = document.createElement('div');
  infoBox.className = 'vehicle-selected';
  infoBox.style.display = 'none';
  let currentMatch = null;

  const artikel = scanField({
    id: 'artikelnummer',
    label: 'Artikelnummer',
    placeholder: 'Artikelnummer scannen, eingeben oder suchen',
    items: artikelLagerplatzListe,
    valueKey: 'nummer',
    labelKey: 'bezeichnung',
    onSelect: (m) => {
      currentMatch = m;
      infoBox.style.display = 'block';
      infoBox.innerHTML = `
        <strong>${escapeHtml(m.bezeichnung || '(keine Bezeichnung)')}</strong><br>
        Aktueller Hauptlagerplatz (laut System): <strong>${escapeHtml(m.lagerplatz || '–')}</strong>
      `;
    },
  });
  section.appendChild(artikel.wrap);
  section.appendChild(infoBox);

  // Wenn die Artikelnummer manuell geändert wird und nicht mehr zum zuletzt gefundenen
  // Treffer passt, die angezeigten Referenzinfos verstecken statt veraltete Werte zu zeigen.
  artikel.input.addEventListener('input', () => {
    if (!currentMatch || artikel.input.value.trim().toLowerCase() !== currentMatch.nummer.toLowerCase()) {
      currentMatch = null;
      infoBox.style.display = 'none';
    }
  });

  const neuPlatz = scanField({
    id: 'neuer-lagerplatz',
    label: 'Neuer Hauptlagerplatz (Ist-Zustand)',
    placeholder: 'Lagerplatz scannen, eingeben oder suchen',
    items: lagerplatzListe,
    valueKey: 'code',
    labelKey: 'bezeichnung',
  });
  section.appendChild(neuPlatz.wrap);

  const melder = selectField({ id: 'melder', label: 'Gemeldet von *', options: mitarbeiterListe, value: getMelderName() });
  section.appendChild(melder.wrap);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary btn-block';
  addBtn.textContent = '+ Zur Liste hinzufügen';
  addBtn.addEventListener('click', async () => {
    if (!artikel.input.value.trim()) {
      alert('Bitte eine Artikelnummer angeben.');
      artikel.input.focus();
      return;
    }
    if (!neuPlatz.input.value.trim()) {
      alert('Bitte den (ggf. korrigierten) Lagerplatz angeben.');
      neuPlatz.input.focus();
      return;
    }
    if (!melder.input.value) {
      alert('Bitte deinen Namen auswählen.');
      melder.input.focus();
      return;
    }
    setMelderName(melder.input.value);
    await MeldungStore.saveMeldung({
      id: newId(),
      type: 'lagerplatzkorrektur',
      status: 'offen',
      createdAt: new Date().toISOString(),
      artikelnummer: artikel.input.value.trim(),
      artikelbezeichnung: currentMatch ? currentMatch.bezeichnung : '',
      bisherigerLagerplatz: currentMatch ? currentMatch.lagerplatz : '',
      neuerLagerplatz: neuPlatz.input.value.trim(),
      melder: melder.input.value,
    });
    artikel.input.value = '';
    neuPlatz.input.value = '';
    currentMatch = null;
    infoBox.style.display = 'none';
    await refreshList();
    artikel.input.focus();
  });
  section.appendChild(addBtn);

  const listSection = document.createElement('div');
  listSection.className = 'section';
  const listTitle = document.createElement('h3');
  listTitle.className = 'section-title';
  listTitle.textContent = 'Erfasste Korrekturen (noch nicht gesendet)';
  const list = document.createElement('div');
  list.className = 'protocol-list';
  listSection.appendChild(listTitle);
  listSection.appendChild(list);
  container.appendChild(listSection);

  const actionBar = document.createElement('div');
  actionBar.className = 'action-bar';
  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn btn-primary btn-block';
  container.appendChild(actionBar);
  actionBar.appendChild(sendBtn);

  async function refreshList() {
    const alle = await MeldungStore.listMeldungen();
    const offen = alle.filter((m) => m.type === 'lagerplatzkorrektur' && m.status !== 'gesendet');

    list.innerHTML = '';
    if (!offen.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Noch keine Korrekturen erfasst.';
      list.appendChild(empty);
    } else {
      offen.forEach((m) => list.appendChild(korrekturRow(m, refreshList)));
    }

    sendBtn.textContent = offen.length
      ? `📤 ${offen.length} Korrektur(en) senden`
      : 'Keine offenen Korrekturen';
    sendBtn.disabled = !offen.length;
    sendBtn.onclick = async () => {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Wird gesendet…';
      try {
        const result = await sendLagerplatzkorrekturBatch(offen);
        const newStatus = result.method === 'auto' ? 'gesendet' : 'manuell';
        for (const m of offen) {
          await MeldungStore.updateStatus(m.id, newStatus);
        }
      } catch (err) {
        alert('Versand fehlgeschlagen: ' + err.message);
      }
      await refreshList();
    };
  }

  function korrekturRow(m, onChange) {
    const row = document.createElement('div');
    row.className = 'protocol-card';
    row.innerHTML = `
      <div class="protocol-card-title">${escapeHtml(m.artikelnummer || '(keine Artikelnummer)')}</div>
      <div class="protocol-card-sub">${escapeHtml(m.artikelbezeichnung || '–')}</div>
      <div class="protocol-card-sub">Hauptlagerplatz: ${escapeHtml(m.bisherigerLagerplatz || '–')} → ${escapeHtml(m.neuerLagerplatz || '–')}</div>
    `;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-sm';
    delBtn.textContent = 'Entfernen';
    delBtn.addEventListener('click', async () => {
      await MeldungStore.deleteMeldung(m.id);
      await onChange();
    });
    actions.appendChild(delBtn);
    row.appendChild(actions);
    return row;
  }

  await refreshList();
  artikel.input.focus();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
