// Versand-Helfer: Datei herunterladen + vorbereiteter mailto-Entwurf.

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export function openMailto({ to, subject, body }) {
  const qs = new URLSearchParams();
  if (subject) qs.set('subject', subject);
  if (body) qs.set('body', body);
  window.location.href = `mailto:${encodeURIComponent(to)}?${qs.toString()}`;
}
