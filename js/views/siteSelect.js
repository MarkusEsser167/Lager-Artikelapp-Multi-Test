import { loadStandorteListe } from '../refData.js';
import { setStandortCode, getStandortCode } from '../db.js';

// Einmalige (bzw. bei Bedarf wiederholte) Standortauswahl für dieses Gerät. WICHTIG: das ist
// nur eine Geräte-/Komfort-Einstellung ohne Anmeldung dahinter – siehe Hinweis in db.js und
// README. Wird von app.js vor jeder anderen Seite erzwungen, solange kein Standort gewählt ist,
// und zusätzlich über den "Standort wechseln"-Link auf der Startseite erreichbar.
export async function renderSiteSelect(container, router) {
  container.innerHTML = '';

  const current = getStandortCode();
  const header = document.createElement('div');
  header.className = 'view-header';
  header.innerHTML = `
    <div class="app-brand">
      <img src="./icons/logo-wego-vti.png" alt="WEGO VTI" class="app-logo" />
    </div>
    <h1>Standort wählen</h1>
    <p class="view-subtitle">Für welchen Standort sollen auf diesem Gerät Meldungen erfasst werden?
      Die Auswahl wird lokal auf diesem Tablet gespeichert.</p>
  `;
  if (current) {
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-back';
    backBtn.textContent = '← Zurück';
    backBtn.addEventListener('click', () => router.navigate(''));
    container.appendChild(backBtn);
  }
  container.appendChild(header);

  const loading = document.createElement('div');
  loading.className = 'empty-state';
  loading.textContent = 'Lade Standortliste…';
  container.appendChild(loading);

  const standorte = await loadStandorteListe();
  loading.remove();

  if (!standorte.length) {
    const err = document.createElement('div');
    err.className = 'error-box';
    err.textContent = 'Standortliste nicht gefunden oder leer (data/standorte.xlsx).';
    container.appendChild(err);
    return;
  }

  const list = document.createElement('div');
  list.className = 'home-actions';
  standorte.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-tile';
    btn.innerHTML = `🏭<br>${escapeHtml(s.name || s.code)}`;
    btn.addEventListener('click', () => {
      setStandortCode(s.code);
      router.navigate('');
    });
    list.appendChild(btn);
  });
  container.appendChild(list);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
