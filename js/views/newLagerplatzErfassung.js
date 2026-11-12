import { MeldungStore, newId, getMelderName, setMelderName } from '../db.js';
import { scanField, selectField, normEan } from '../formFields.js';
import { loadArtikelListe, loadArtikelLagerplatzListe, loadLagerplatzListe, loadMitarbeiterListe } from '../refData.js';
import { sendLagerplatzerfassung } from '../export.js';
import { startMultiScan, isMultiScanSupported } from '../massScan.js';

// Massenerfassung pro Lagerplatz: Lagerplatz wählen, dann per Kamera alle Barcodes im Bild
// erfassen (EAN oder Artikelnummer). Ergebnis = Liste der Artikel, die auf dem Lagerplatz
// stehen (keine Mengen), als Excel per Mail an die zentrale Adresse des Standorts.
export async function renderNewLagerplatzErfassung(container, router) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `
    <h1>Lagerplatz-Erfassung</h1>
    <p class="view-subtitle">Lagerplatz wählen, dann mit der Kamera alle Artikel-Barcodes auf diesem Platz erfassen.</p>
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
    'ℹ️ Erfasst wird, <strong>welche Artikel</strong> auf dem Lagerplatz stehen – <strong>nicht die Menge</strong>. ' +
    'Derselbe Artikel wird nur einmal aufgeführt. Gelesen werden EAN-Codes und Artikelnummern.';
  container.appendChild(notice);

  const loading = document.createElement('div');
  loading.className = 'empty-state';
  loading.textContent = 'Lade Artikel-, Lagerplatz- und Mitarbeiterliste…';
  container.appendChild(loading);

  const [artikelListe, artikelLagerplatzListe, lagerplatzListe, mitarbeiterListe] = await Promise.all([
    loadArtikelListe(),
    loadArtikelLagerplatzListe(),
    loadLagerplatzListe(),
    loadMitarbeiterListe(),
  ]);
  loading.remove();

  // Nachschlage-Indizes: Artikelnummer und (normalisierte) EAN -> Artikel. Eine EAN kann mehrere
  // Artikel haben (Dubletten im Stamm) – dann gibt es mehrere Kandidaten zur Auswahl.
  const byNummer = new Map();
  const byEan = new Map();
  artikelListe.forEach((a) => {
    byNummer.set(a.nummer.toLowerCase(), a);
    const e = normEan(a.ean);
    if (e) {
      if (!byEan.has(e)) byEan.set(e, []);
      byEan.get(e).push(a);
    }
  });
  const systemByNummer = new Map(artikelLagerplatzListe.map((a) => [a.nummer, a]));
  const lagerplatzCodes = new Set(lagerplatzListe.map((l) => l.code.toLowerCase()));

  // Gescannten Rohwert einem Artikel zuordnen (Artikelnummer zuerst, dann EAN).
  function resolveCode(raw) {
    const direkt = byNummer.get(String(raw).trim().toLowerCase());
    if (direkt) return [direkt];
    const n = normEan(raw);
    return n.length >= 6 ? byEan.get(n) || [] : [];
  }

  const section = document.createElement('div');
  section.className = 'section';
  container.appendChild(section);

  const lagerplatz = scanField({
    id: 'erfassung-lagerplatz',
    label: 'Lagerplatz *',
    placeholder: 'Lagerplatz scannen, eingeben oder suchen',
    items: lagerplatzListe,
    valueKey: 'code',
    labelKey: 'bezeichnung',
  });
  section.appendChild(lagerplatz.wrap);

  const melder = selectField({ id: 'melder', label: 'Gemeldet von *', options: mitarbeiterListe, value: getMelderName() });
  section.appendChild(melder.wrap);

  // ---- Erfasste Artikel (Zustand dieser Sitzung) ----
  const items = [];

  function addByCode(raw) {
    const code = String(raw).trim();
    if (!code) return false;
    if (items.some((i) => i.code === code)) return false;
    const kandidaten = resolveCode(code);
    if (!kandidaten.length) {
      // Ein Lagerplatz-Etikett im Bild ist kein Artikel – nicht als „unbekannt" aufführen.
      if (lagerplatzCodes.has(code.toLowerCase())) return false;
      items.push({ code, nummer: '', bezeichnung: '', ean: '', kandidaten: [] });
      return true;
    }
    const a = kandidaten[0];
    if (items.some((i) => i.nummer === a.nummer)) return false; // Artikel schon erfasst (z.B. EAN + Artikelnummer)
    items.push({
      code,
      nummer: a.nummer,
      bezeichnung: a.bezeichnung,
      ean: a.ean || '',
      kandidaten: kandidaten.map((k) => ({ nummer: k.nummer, bezeichnung: k.bezeichnung })),
    });
    return true;
  }

  function addByArtikel(a) {
    if (items.some((i) => i.nummer === a.nummer)) return;
    items.push({ code: a.nummer, nummer: a.nummer, bezeichnung: a.bezeichnung, ean: a.ean || '', kandidaten: [] });
  }

  // Vergleich mit der Referenzliste (welcher Artikel steht laut System auf welchem Lagerplatz).
  // Ergebnis-Schlüssel: ok | referenz | abweichend | ohne | unbekannt.
  // "referenz": Der erfasste Platz ist für den Artikel bereits als REFERENZlagerplatz (nicht als
  // Hauptlagerplatz) eingetragen. Die SAP-Massenänderung kann nur Hauptlagerplätze setzen – solche
  // Artikel werden deshalb gewarnt und nicht in die SAP-Datei übernommen.
  function abgleichNummer(nummer, platz) {
    if (!nummer) return { key: 'unbekannt', text: 'Code nicht in Artikelliste' };
    const ref = systemByNummer.get(nummer);
    if (!ref || !ref.lagerplatz) return { key: 'ohne', text: 'Kein Lagerplatz im System hinterlegt' };
    const locs = ref.locations && ref.locations.length
      ? ref.locations
      : ref.lagerplatz.split(',').map((p) => ({ code: p.replace(/\s*\(Haupt\)\s*$/, '').trim(), haupt: /\(Haupt\)/.test(p) }));
    const ziel = platz.trim().toLowerCase();
    const treffer = locs.find((l) => String(l.code).trim().toLowerCase() === ziel);
    if (!treffer) return { key: 'abweichend', text: `Laut System auf: ${ref.lagerplatz}`, system: ref.lagerplatz };
    // Nur bei mehreren Plätzen MIT Haupt-Kennzeichen lässt sich Referenz sicher von Haupt unterscheiden
    // (ein einzelner Platz gilt als Hauptlagerplatz, auch ohne Kennzeichen).
    const hauptPlatz = locs.find((l) => l.haupt);
    if (!treffer.haupt && locs.length > 1 && hauptPlatz) {
      return {
        key: 'referenz',
        text: `⚠️ Lagerplatz ist bereits als Referenzlagerplatz eingetragen – Hauptlagerplatz laut System: ${hauptPlatz.code}. Per Massenänderung nicht änderbar.`,
        system: ref.lagerplatz,
      };
    }
    return { key: 'ok', text: 'Laut System auf diesem Lagerplatz (Hauptlagerplatz)', system: ref.lagerplatz };
  }
  function abgleich(item, platz) {
    return abgleichNummer(item.nummer, platz);
  }

  // ---- UI: Kamera + Liste ----
  const cameraWrap = document.createElement('div');
  cameraWrap.className = 'section';
  const camBtn = document.createElement('button');
  camBtn.className = 'btn btn-primary btn-block';
  camBtn.textContent = '📷 Kamera starten – Artikel erfassen';
  cameraWrap.appendChild(camBtn);
  if (!isMultiScanSupported()) {
    const warn = document.createElement('div');
    warn.className = 'error-box';
    warn.style.marginTop = '10px';
    warn.textContent = 'Die Kamera-Erkennung wird auf diesem Gerät/Browser nicht unterstützt. Artikel lassen sich unten manuell hinzufügen.';
    cameraWrap.appendChild(warn);
    camBtn.disabled = true;
  }
  container.appendChild(cameraWrap);

  camBtn.addEventListener('click', async () => {
    if (!lagerplatz.input.value.trim()) {
      alert('Bitte zuerst den Lagerplatz angeben.');
      lagerplatz.input.focus();
      return;
    }
    await startMultiScan({
      title: `Lagerplatz ${lagerplatz.input.value.trim()}`,
      initial: items.map((i) => i.code),
      lookup: (raw) => {
        const k = resolveCode(raw);
        if (!k.length) return null;
        const ab = abgleichNummer(k[0].nummer, lagerplatz.input.value);
        const warn = ab.key === 'referenz';
        return {
          known: true,
          warn,
          short: k[0].nummer,
          label: `${warn ? '⚠️ REFERENZLAGERPLATZ – ' : ''}${k[0].nummer} – ${k[0].bezeichnung}`,
        };
      },
      onCapture: (raw) => addByCode(raw),
    });
    renderList();
  });

  const listSection = document.createElement('div');
  listSection.className = 'section';
  const listTitle = document.createElement('h3');
  listTitle.className = 'section-title';
  const list = document.createElement('div');
  list.className = 'protocol-list';
  listSection.appendChild(listTitle);
  listSection.appendChild(list);
  container.appendChild(listSection);

  // Manuell ergänzen (z.B. Etikett nicht lesbar): Artikelsuche, Treffer wird direkt übernommen.
  const manual = scanField({
    id: 'erfassung-manuell',
    label: 'Artikel manuell hinzufügen',
    placeholder: 'Artikelnummer, EAN oder Text eingeben/scannen',
    items: artikelListe,
    valueKey: 'nummer',
    labelKey: 'bezeichnung',
    onSelect: (a) => {
      addByArtikel(a);
      manual.input.value = '';
      renderList();
    },
  });
  listSection.appendChild(manual.wrap);

  // Hinweis, welche Artikel in die SAP-Massenänderungsdatei (2. Mailanhang) kommen.
  const changeInfo = document.createElement('div');
  changeInfo.className = 'notice-box';
  container.appendChild(changeInfo);
  // Warnung für Artikel, bei denen der Platz schon Referenzlagerplatz ist (nicht änderbar).
  const refWarn = document.createElement('div');
  refWarn.className = 'error-box';
  container.appendChild(refWarn);

  const actionBar = document.createElement('div');
  actionBar.className = 'action-bar';
  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn btn-primary btn-block';
  actionBar.appendChild(sendBtn);
  container.appendChild(actionBar);

  function renderList() {
    const platz = lagerplatz.input.value.trim();
    listTitle.textContent = `Erfasste Artikel (${items.length})`;
    list.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Noch nichts erfasst.';
      list.appendChild(empty);
    }
    items.forEach((item, idx) => {
      const ab = abgleich(item, platz);
      const row = document.createElement('div');
      row.className = 'protocol-card' + (ab.key === 'referenz' ? ' row-warn' : '');
      const titel = item.nummer
        ? `${escapeHtml(item.nummer)} – ${escapeHtml(item.bezeichnung || '')}`
        : `Unbekannter Code ${escapeHtml(item.code)}`;
      row.innerHTML = `
        <div class="protocol-card-top"><span class="badge ${badgeClass(ab.key)}">${escapeHtml(BADGE_TEXT[ab.key] || 'Ohne Referenz')}</span></div>
        <div class="protocol-card-title">${titel}</div>
        <div class="protocol-card-sub">${escapeHtml(ab.text)}${item.ean ? ' · EAN ' + escapeHtml(item.ean) : ''}</div>
      `;
      if (item.kandidaten && item.kandidaten.length > 1) {
        const sel = document.createElement('select');
        sel.className = 'candidate-select';
        sel.innerHTML = item.kandidaten
          .map((k) => `<option value="${escapeHtml(k.nummer)}"${k.nummer === item.nummer ? ' selected' : ''}>${escapeHtml(k.nummer)} – ${escapeHtml(k.bezeichnung)}</option>`)
          .join('');
        sel.addEventListener('change', () => {
          const k = byNummer.get(sel.value.toLowerCase());
          if (k) {
            item.nummer = k.nummer;
            item.bezeichnung = k.bezeichnung;
            item.ean = k.ean || '';
          }
          renderList();
        });
        const hint = document.createElement('div');
        hint.className = 'protocol-card-sub';
        hint.textContent = `Diese EAN gehört zu ${item.kandidaten.length} Artikeln – bitte den richtigen wählen:`;
        row.appendChild(hint);
        row.appendChild(sel);
      }
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const del = document.createElement('button');
      del.className = 'btn btn-ghost btn-sm';
      del.textContent = 'Entfernen';
      del.addEventListener('click', () => {
        items.splice(idx, 1);
        renderList();
      });
      actions.appendChild(del);
      row.appendChild(actions);
      list.appendChild(row);
    });
    const nAend = items.filter((i) => abgleich(i, platz).key === 'abweichend').length;
    changeInfo.style.display = items.length ? 'block' : 'none';
    changeInfo.innerHTML = nAend
      ? `📎 <strong>${nAend} Artikel</strong> stehen laut System woanders. Für sie wird zusätzlich eine <strong>SAP-Massenänderungs-Datei</strong> (neuer Hauptlagerplatz ${escapeHtml(platz || '–')}) angehängt.`
      : 'Kein Artikel weicht vom System ab – es wird nur der Erfassungsbericht gesendet.';
    const refItems = items.filter((i) => abgleich(i, platz).key === 'referenz');
    refWarn.style.display = refItems.length ? 'block' : 'none';
    refWarn.innerHTML = refItems.length
      ? `⚠️ <strong>${refItems.length} Artikel</strong> haben ${escapeHtml(platz || 'diesen Lagerplatz')} bereits als <strong>Referenzlagerplatz</strong> eingetragen ` +
        `(${refItems.map((i) => escapeHtml(i.nummer)).join(', ')}). Mit dieser Funktion lassen sich nur Hauptlagerplätze ändern – ` +
        'diese Artikel kommen nicht in die SAP-Datei und müssen ggf. einzeln geklärt werden.'
      : '';
    sendBtn.textContent = items.length ? `📤 ${items.length} Artikel für Lagerplatz senden` : 'Noch nichts erfasst';
    sendBtn.disabled = !items.length;
  }
  // Abgleich hängt am Lagerplatz – bei Änderung neu bewerten.
  lagerplatz.input.addEventListener('input', renderList);
  lagerplatz.input.addEventListener('change', renderList);

  sendBtn.addEventListener('click', async () => {
    const platz = lagerplatz.input.value.trim();
    if (!platz) {
      alert('Bitte den Lagerplatz angeben.');
      lagerplatz.input.focus();
      return;
    }
    if (!melder.input.value) {
      alert('Bitte deinen Namen auswählen.');
      melder.input.focus();
      return;
    }
    setMelderName(melder.input.value);
    sendBtn.disabled = true;
    sendBtn.textContent = 'Wird gesendet…';
    const meldung = {
      id: newId(),
      type: 'lagerplatzerfassung',
      status: 'offen',
      createdAt: new Date().toISOString(),
      artikelnummer: '',
      lagerplatz: platz,
      melder: melder.input.value,
      items: items.map((i) => ({ ...i, abgleich: abgleich(i, platz) })),
    };
    await MeldungStore.saveMeldung(meldung);
    try {
      const result = await sendLagerplatzerfassung(meldung);
      await MeldungStore.updateStatus(meldung.id, result.method === 'auto' ? 'gesendet' : 'manuell');
    } catch (err) {
      alert('Versand fehlgeschlagen: ' + err.message);
    }
    router.navigate('');
  });

  renderList();
  lagerplatz.input.focus();
}

const BADGE_TEXT = { ok: 'Passt', referenz: 'Warnung: Referenzplatz', abweichend: 'Abweichend', unbekannt: 'Unbekannt', ohne: 'Ohne Referenz' };

function badgeClass(key) {
  return key === 'ok' ? 'badge-fertig' : key === 'abweichend' || key === 'unbekannt' || key === 'referenz' ? 'badge-verschrottung' : 'badge-lager';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
