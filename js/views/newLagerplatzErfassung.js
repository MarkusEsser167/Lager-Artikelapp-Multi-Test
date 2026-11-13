import { MeldungStore, newId, getMelderName, setMelderName } from '../db.js';
import { scanField, selectField, normEan } from '../formFields.js';
import { loadArtikelListe, loadArtikelLagerplatzListe, loadLagerplatzListe, loadMitarbeiterListe } from '../refData.js';
import { sendLagerplatzerfassung } from '../export.js';
import { startMultiScan, isMultiScanSupported } from '../massScan.js';

// Massenerfassung pro Lagerplatz: Lagerplatz wählen, dann per Kamera alle Barcodes im Bild
// erfassen (EAN oder Artikelnummer). Ergebnis = Liste der Artikel, die auf dem Lagerplatz
// stehen (keine Mengen).
//
// Erfassungsrunde: Mehrere Lagerplätze werden nacheinander erfasst ("Lagerplatz abschließen –
// nächsten erfassen") und am Ende GESAMMELT in einer Mail gesendet. Die Runde liegt als
// Entwurf (status "entwurf") in der IndexedDB und wird bei jeder Änderung gespeichert – so geht
// nichts verloren, wenn die App zwischendurch geschlossen wird oder abstürzt; beim nächsten
// Öffnen wird die Runde fortgesetzt.
export async function renderNewLagerplatzErfassung(container, router) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `
    <h1>Lagerplatz-Erfassung</h1>
    <p class="view-subtitle">Lagerplätze nacheinander erfassen – am Schluss wird alles zusammen gesendet.</p>
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
    'Nach jedem Lagerplatz auf <strong>„Lagerplatz abschließen"</strong> tippen und den nächsten erfassen. ' +
    'Erst <strong>„Alles senden"</strong> verschickt die gesammelten Lagerplätze in einer Mail. ' +
    'Zwischenstand wird automatisch auf dem Tablet gespeichert.';
  container.appendChild(notice);

  const loading = document.createElement('div');
  loading.className = 'empty-state';
  loading.textContent = 'Lade Artikel-, Lagerplatz- und Mitarbeiterliste…';
  container.appendChild(loading);

  const [artikelListe, artikelLagerplatzListe, lagerplatzListe, mitarbeiterListe, alleMeldungen] = await Promise.all([
    loadArtikelListe(),
    loadArtikelLagerplatzListe(),
    loadLagerplatzListe(),
    loadMitarbeiterListe(),
    MeldungStore.listMeldungen(),
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

  // ---- Erfassungsrunde (Entwurf) laden oder neu anlegen ----
  const vorhanden = alleMeldungen.find((m) => m.type === 'lagerplatzerfassung' && m.status === 'entwurf');
  const runde = vorhanden || {
    id: newId(),
    type: 'lagerplatzerfassung',
    status: 'entwurf',
    createdAt: new Date().toISOString(),
    artikelnummer: '',
    melder: getMelderName(),
    plaetze: [],
    aktuell: { lagerplatz: '', items: [] },
  };
  runde.plaetze = runde.plaetze || [];
  runde.aktuell = runde.aktuell || { lagerplatz: '', items: [] };
  let gespeichert = !!vorhanden;

  if (vorhanden && (runde.plaetze.length || runde.aktuell.items.length)) {
    const resume = document.createElement('div');
    resume.className = 'notice-box';
    resume.innerHTML = `🔄 <strong>Begonnene Erfassung fortgesetzt</strong> (gestartet ${escapeHtml(formatDate(runde.createdAt))}): ` +
      `${runde.plaetze.length} ${runde.plaetze.length === 1 ? 'Lagerplatz' : 'Lagerplätze'} abgeschlossen${runde.aktuell.items.length ? `, ${runde.aktuell.items.length} Artikel auf dem aktuellen Platz` : ''}.`;
    container.appendChild(resume);
  }

  // ---- Abgeschlossene Lagerplätze dieser Runde ----
  const doneSection = document.createElement('div');
  doneSection.className = 'section';
  const doneTitle = document.createElement('h3');
  doneTitle.className = 'section-title';
  const doneList = document.createElement('div');
  doneList.className = 'protocol-list';
  doneSection.appendChild(doneTitle);
  doneSection.appendChild(doneList);
  container.appendChild(doneSection);

  // ---- Aktueller Lagerplatz ----
  const section = document.createElement('div');
  section.className = 'section';
  const curTitle = document.createElement('h3');
  curTitle.className = 'section-title';
  section.appendChild(curTitle);
  container.appendChild(section);

  const lagerplatz = scanField({
    id: 'erfassung-lagerplatz',
    label: 'Lagerplatz *',
    placeholder: 'Lagerplatz scannen, eingeben oder suchen',
    items: lagerplatzListe,
    valueKey: 'code',
    labelKey: 'bezeichnung',
  });
  lagerplatz.input.value = runde.aktuell.lagerplatz || '';
  section.appendChild(lagerplatz.wrap);

  // Artikel des aktuellen Lagerplatzes (wird beim Abschließen in runde.plaetze übernommen).
  let items = runde.aktuell.items;

  function addByCode(raw) {
    const code = String(raw).trim();
    if (!code) return false;
    if (items.some((i) => i.code === code)) return false;
    const kandidaten = resolveCode(code);
    if (!kandidaten.length) {
      // Ein Lagerplatz-Etikett im Bild ist kein Artikel – nicht als „unbekannt" aufführen.
      if (lagerplatzCodes.has(code.toLowerCase())) return false;
      items.push({ code, nummer: '', bezeichnung: '', ean: '', kandidaten: [] });
      persist();
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
    persist();
    return true;
  }

  function addByArtikel(a) {
    if (items.some((i) => i.nummer === a.nummer)) return;
    items.push({ code: a.nummer, nummer: a.nummer, bezeichnung: a.bezeichnung, ean: a.ean || '', kandidaten: [] });
    persist();
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
    const ziel = String(platz || '').trim().toLowerCase();
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

  // Auf welchen ANDEREN Lagerplätzen dieser Runde wurde der Artikel ebenfalls erfasst? Solche
  // Artikel kommen nicht in die SAP-Datei (ein Artikel hat nur einen Hauptlagerplatz – welcher
  // richtig ist, muss geklärt werden).
  function auchAuf(nummer, platz) {
    if (!nummer) return [];
    const p = String(platz || '').trim().toLowerCase();
    return runde.plaetze
      .filter((pl) => pl.lagerplatz.trim().toLowerCase() !== p && pl.items.some((i) => i.nummer === nummer))
      .map((pl) => pl.lagerplatz);
  }

  // ---- Zwischenspeichern ----
  let saveTimer = null;
  // Nach dem Absenden darf kein (verzögertes) Zwischenspeichern den gesendeten Datensatz wieder
  // mit dem Entwurf überschreiben.
  let abgeschlossen = false;
  function persist() {
    if (abgeschlossen) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    if (abgeschlossen) return;
    runde.aktuell = { lagerplatz: lagerplatz.input.value.trim(), items };
    runde.melder = melder.input.value || runde.melder || '';
    const leer = !runde.plaetze.length && !items.length;
    if (leer) {
      if (gespeichert) {
        await MeldungStore.deleteMeldung(runde.id);
        gespeichert = false;
      }
      return;
    }
    await MeldungStore.saveMeldung(runde);
    gespeichert = true;
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
    renderAll();
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
      renderAll();
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

  const nextBar = document.createElement('div');
  nextBar.className = 'section';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-secondary btn-block';
  nextBar.appendChild(nextBtn);
  container.appendChild(nextBar);

  // ---- Abschluss der Runde ----
  const sendSection = document.createElement('div');
  sendSection.className = 'section';
  const melder = selectField({ id: 'melder', label: 'Gemeldet von *', options: mitarbeiterListe, value: runde.melder || getMelderName() });
  melder.input.addEventListener('change', persist);
  sendSection.appendChild(melder.wrap);
  container.appendChild(sendSection);

  const actionBar = document.createElement('div');
  actionBar.className = 'action-bar';
  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn btn-primary btn-block';
  actionBar.appendChild(sendBtn);
  const discardBtn = document.createElement('button');
  discardBtn.className = 'btn btn-ghost btn-block';
  discardBtn.textContent = 'Erfassung verwerfen';
  discardBtn.style.marginTop = '8px';
  actionBar.appendChild(discardBtn);
  container.appendChild(actionBar);

  function zaehle(platzItems, platz) {
    const c = { abweichend: 0, referenz: 0, unbekannt: 0 };
    platzItems.forEach((i) => {
      const k = abgleich(i, platz).key;
      if (k in c) c[k]++;
    });
    return c;
  }

  function renderDone() {
    doneSection.style.display = runde.plaetze.length ? 'block' : 'none';
    const nArt = runde.plaetze.reduce((s, p) => s + p.items.length, 0);
    doneTitle.textContent = `✅ Abgeschlossene Lagerplätze (${runde.plaetze.length} · ${nArt} Artikel)`;
    doneList.innerHTML = '';
    runde.plaetze.forEach((pl, idx) => {
      const c = zaehle(pl.items, pl.lagerplatz);
      const teile = [`${pl.items.length} Artikel`];
      if (c.abweichend) teile.push(`${c.abweichend} abweichend`);
      if (c.referenz) teile.push(`${c.referenz} Referenzplatz`);
      if (c.unbekannt) teile.push(`${c.unbekannt} unbekannt`);
      const card = document.createElement('div');
      card.className = 'protocol-card' + (c.referenz ? ' row-warn' : '');
      card.innerHTML = `
        <div class="protocol-card-title">Lagerplatz ${escapeHtml(pl.lagerplatz)}</div>
        <div class="protocol-card-sub">${escapeHtml(teile.join(' · '))}</div>
      `;
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-ghost btn-sm';
      editBtn.textContent = 'Bearbeiten';
      editBtn.addEventListener('click', () => {
        if (items.length) {
          alert('Bitte zuerst den aktuellen Lagerplatz abschließen (oder seine Artikel entfernen).');
          return;
        }
        runde.plaetze.splice(idx, 1);
        lagerplatz.input.value = pl.lagerplatz;
        items = pl.items.map(({ abgleich: _a, ...rest }) => rest);
        persist();
        renderAll();
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-ghost btn-sm';
      delBtn.textContent = 'Entfernen';
      delBtn.addEventListener('click', () => {
        if (!confirm(`Lagerplatz ${pl.lagerplatz} mit ${pl.items.length} Artikeln aus dieser Erfassung entfernen?`)) return;
        runde.plaetze.splice(idx, 1);
        persist();
        renderAll();
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);
      doneList.appendChild(card);
    });
  }

  function renderList() {
    const platz = lagerplatz.input.value.trim();
    curTitle.textContent = runde.plaetze.length ? `Lagerplatz Nr. ${runde.plaetze.length + 1}` : 'Lagerplatz';
    listTitle.textContent = `Erfasste Artikel auf diesem Lagerplatz (${items.length})`;
    list.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Noch nichts erfasst.';
      list.appendChild(empty);
    }
    items.forEach((item, idx) => {
      const ab = abgleich(item, platz);
      const andere = auchAuf(item.nummer, platz);
      const row = document.createElement('div');
      row.className = 'protocol-card' + (ab.key === 'referenz' ? ' row-warn' : '');
      const titel = item.nummer
        ? `${escapeHtml(item.nummer)} – ${escapeHtml(item.bezeichnung || '')}`
        : `Unbekannter Code ${escapeHtml(item.code)}`;
      row.innerHTML = `
        <div class="protocol-card-top"><span class="badge ${badgeClass(ab.key)}">${escapeHtml(BADGE_TEXT[ab.key] || 'Ohne Referenz')}</span></div>
        <div class="protocol-card-title">${titel}</div>
        <div class="protocol-card-sub">${escapeHtml(ab.text)}${item.ean ? ' · EAN ' + escapeHtml(item.ean) : ''}</div>
        ${andere.length ? `<div class="protocol-card-sub">↔️ In dieser Erfassung auch auf ${escapeHtml(andere.join(', '))} – kommt nicht in die SAP-Datei.</div>` : ''}
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
          persist();
          renderAll();
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
        persist();
        renderAll();
      });
      actions.appendChild(del);
      row.appendChild(actions);
      list.appendChild(row);
    });
    const nAend = items.filter((i) => abgleich(i, platz).key === 'abweichend').length;
    changeInfo.style.display = items.length ? 'block' : 'none';
    changeInfo.innerHTML = nAend
      ? `📎 <strong>${nAend} Artikel</strong> stehen laut System woanders. Sie kommen in die <strong>SAP-Massenänderungs-Datei</strong> (neuer Hauptlagerplatz ${escapeHtml(platz || '–')}).`
      : 'Kein Artikel auf diesem Lagerplatz weicht vom System ab.';
    const refItems = items.filter((i) => abgleich(i, platz).key === 'referenz');
    refWarn.style.display = refItems.length ? 'block' : 'none';
    refWarn.innerHTML = refItems.length
      ? `⚠️ <strong>${refItems.length} Artikel</strong> haben ${escapeHtml(platz || 'diesen Lagerplatz')} bereits als <strong>Referenzlagerplatz</strong> eingetragen ` +
        `(${refItems.map((i) => escapeHtml(i.nummer)).join(', ')}). Mit dieser Funktion lassen sich nur Hauptlagerplätze ändern – ` +
        'diese Artikel kommen nicht in die SAP-Datei und müssen ggf. einzeln geklärt werden.'
      : '';
    nextBtn.textContent = items.length
      ? `✅ Lagerplatz ${platz || ''} abschließen (${items.length} Artikel) – nächsten erfassen`
      : '✅ Lagerplatz abschließen – nächsten erfassen';
    nextBtn.disabled = !items.length;
  }

  function renderSend() {
    const nPl = runde.plaetze.length + (items.length ? 1 : 0);
    const nArt = runde.plaetze.reduce((s, p) => s + p.items.length, 0) + items.length;
    sendBtn.textContent = nArt
      ? `📤 Alles senden (${nPl} ${nPl === 1 ? 'Lagerplatz' : 'Lagerplätze'} · ${nArt} Artikel)`
      : 'Noch nichts erfasst';
    sendBtn.disabled = !nArt;
    discardBtn.style.display = nArt ? 'block' : 'none';
  }

  function renderAll() {
    renderDone();
    renderList();
    renderSend();
  }

  // Aktuellen Platz in die Runde übernehmen. Wurde derselbe Lagerplatz schon abgeschlossen,
  // werden die Artikel dort ergänzt (ohne Dubletten) statt einen zweiten Eintrag anzulegen.
  function abschliessen() {
    const platz = lagerplatz.input.value.trim();
    if (!platz) {
      alert('Bitte den Lagerplatz angeben.');
      lagerplatz.input.focus();
      return false;
    }
    if (!items.length) return true;
    const vorher = runde.plaetze.find((p) => p.lagerplatz.trim().toLowerCase() === platz.toLowerCase());
    if (vorher) {
      items.forEach((i) => {
        const doppelt = vorher.items.some((v) => (i.nummer && v.nummer === i.nummer) || v.code === i.code);
        if (!doppelt) vorher.items.push(i);
      });
      vorher.abgeschlossenAt = new Date().toISOString();
    } else {
      runde.plaetze.push({ lagerplatz: platz, items, abgeschlossenAt: new Date().toISOString() });
    }
    items = [];
    lagerplatz.input.value = '';
    return true;
  }

  nextBtn.addEventListener('click', async () => {
    const platz = lagerplatz.input.value.trim();
    const schonDa = platz && runde.plaetze.some((p) => p.lagerplatz.trim().toLowerCase() === platz.toLowerCase());
    if (!abschliessen()) return;
    await saveNow();
    renderAll();
    if (schonDa) alert(`Lagerplatz ${platz} war schon erfasst – die Artikel wurden dort ergänzt.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    lagerplatz.input.focus();
  });

  // Abgleich hängt am Lagerplatz – bei Änderung neu bewerten.
  lagerplatz.input.addEventListener('input', () => { renderList(); persist(); });
  lagerplatz.input.addEventListener('change', () => { renderList(); persist(); });

  discardBtn.addEventListener('click', async () => {
    if (!confirm('Die gesamte Erfassung (alle Lagerplätze) verwerfen? Das lässt sich nicht rückgängig machen.')) return;
    runde.plaetze = [];
    items = [];
    lagerplatz.input.value = '';
    await saveNow();
    abgeschlossen = true;
    router.navigate('');
  });

  sendBtn.addEventListener('click', async () => {
    if (items.length && !lagerplatz.input.value.trim()) {
      alert('Für die zuletzt erfassten Artikel fehlt noch der Lagerplatz.');
      lagerplatz.input.focus();
      return;
    }
    if (!melder.input.value) {
      alert('Bitte deinen Namen auswählen.');
      melder.input.focus();
      return;
    }
    if (!abschliessen()) return;
    abgeschlossen = true;
    clearTimeout(saveTimer);
    setMelderName(melder.input.value);
    sendBtn.disabled = true;
    sendBtn.textContent = 'Wird gesendet…';
    const plaetze = runde.plaetze.map((pl) => ({
      lagerplatz: pl.lagerplatz,
      abgeschlossenAt: pl.abgeschlossenAt,
      items: pl.items.map((i) => ({ ...i, abgleich: abgleich(i, pl.lagerplatz) })),
    }));
    const meldung = {
      id: runde.id,
      type: 'lagerplatzerfassung',
      status: 'offen',
      createdAt: new Date().toISOString(),
      artikelnummer: '',
      lagerplatz: plaetze.map((p) => p.lagerplatz).join(', '),
      melder: melder.input.value,
      plaetze,
      items: plaetze.flatMap((p) => p.items),
    };
    await MeldungStore.saveMeldung(meldung); // ersetzt den Entwurf (gleiche ID)
    gespeichert = false;
    try {
      const result = await sendLagerplatzerfassung(meldung);
      await MeldungStore.updateStatus(meldung.id, result.method === 'auto' ? 'gesendet' : 'manuell');
    } catch (err) {
      alert('Versand fehlgeschlagen: ' + err.message + '\nDie Erfassung bleibt auf der Startseite gespeichert und kann dort erneut gesendet werden.');
    }
    router.navigate('');
  });

  renderAll();
  lagerplatz.input.focus();
}

const BADGE_TEXT = { ok: 'Passt', referenz: 'Warnung: Referenzplatz', abweichend: 'Abweichend', unbekannt: 'Unbekannt', ohne: 'Ohne Referenz' };

function badgeClass(key) {
  return key === 'ok' ? 'badge-fertig' : key === 'abweichend' || key === 'unbekannt' || key === 'referenz' ? 'badge-verschrottung' : 'badge-lager';
}

function formatDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
