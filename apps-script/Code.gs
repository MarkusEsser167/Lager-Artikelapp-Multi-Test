/**
 * WeGoVTI-Lagermeldungmail – Google Apps Script Web App.
 *
 * WICHTIG für diese Multi-Standort-Testversion: Dieses Script ist komplett generisch
 * (Empfänger, Betreff, Anhänge kommen alle aus dem Request) und wird bereits für die
 * einzelnen Standort-Repos betrieben. Diese App nutzt DIESELBE Bereitstellung weiter -
 * hier ist NICHTS erneut zu deployen. Diese Datei liegt nur zu Dokumentationszwecken im Repo.
 *
 * Nimmt einen POST von der Lagermeldungen-PWA entgegen und verschickt den
 * mitgeschickten Haupt-Anhang (Excel-Export) plus optionale weitere Anhänge
 * (z.B. Verschrottungs-Fotos) per GmailApp an den angegebenen Empfänger.
 * Analog zum bestehenden Skript "WeGoVTI-Unfallmail" der Unfallaufnahme-App –
 * hier aber generisch für beliebige Dateitypen (mime_type statt fest "application/pdf").
 *
 * Deployment (nur falls doch mal eine eigene Instanz nötig wird): script.google.com ->
 * neues Projekt -> diesen Code einfügen -> "Bereitstellen" -> "Web-App" -> Ausführen als "Ich",
 * Zugriff "Jeder" -> Bereitstellen. Bei jeder Code-Änderung: "Bereitstellungen verwalten" ->
 * Stift -> NEUE VERSION -> Bereitstellen (sonst läuft weiterhin der alte Code).
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const attachments = [];
    if (data.file_base64) {
      attachments.push(Utilities.newBlob(
        Utilities.base64Decode(data.file_base64),
        data.mime_type || 'application/octet-stream',
        data.filename
      ));
    }
    (data.extra_attachments || []).forEach((att) => {
      attachments.push(Utilities.newBlob(
        Utilities.base64Decode(att.base64),
        att.mime_type || 'application/octet-stream',
        att.filename
      ));
    });

    // Optionen-Objekt nur mit den Feldern bauen, die tatsächlich gebraucht werden -
    // "attachments: []" (leeres Array, z.B. bei der Fehlbestandsmeldung ohne Anhang) wird
    // bewusst weggelassen statt explizit mitgeschickt, um diesen Fall als möglichen
    // Fehlerkandidaten auszuschließen.
    const options = { name: 'WeGo VTI Lagermeldungen' };
    if (attachments.length) options.attachments = attachments;

    GmailApp.sendEmail(data.to, data.subject, data.message || '', options);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // Landet in den "Ausführungen" im Apps-Script-Editor (Protokolle-Tab) - wichtig, um
    // Fehler wie "Service invoked too many times for one day: email" (Gmail-Tagesquote,
    // z.B. 100 Mails/Tag bei einem normalen Gmail-Konto, gemeinsam genutzt von allen
    // Standort-Apps) oder ungültige Empfängeradressen zu erkennen.
    Logger.log('doPost-Fehler: ' + err.message + '\n' + err.stack);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
