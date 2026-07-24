const COPY = {
  en: {
    docLabel: { PRIVACY_POLICY: "Privacy Policy", TERMS_CONDITIONS: "Terms &amp; Conditions" },
    subject: (docLabel) => `We've updated our ${docLabel}`,
    title: (docLabel) => `We've updated our ${docLabel}`,
    heading: (docLabel) => `We've updated our ${docLabel}`,
    body: (name, docLabel, dateStr) =>
      `Hi ${name}, we wanted to let you know that our ${docLabel} has been updated, effective <strong>${dateStr}</strong>.`,
    note: "No action is needed right now — you'll be asked to confirm the current version the next time you complete a booking.",
    button: (docLabel) => `View ${docLabel}`,
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your account, sent from ${email}.`,
  },
  it: {
    docLabel: { PRIVACY_POLICY: "Informativa sulla Privacy", TERMS_CONDITIONS: "Termini e Condizioni" },
    subject: (docLabel) => `Abbiamo aggiornato: ${docLabel}`,
    title: (docLabel) => `Abbiamo aggiornato: ${docLabel}`,
    heading: (docLabel) => `Abbiamo aggiornato: ${docLabel}`,
    body: (name, docLabel, dateStr) =>
      `Ciao ${name}, ti informiamo che la nostra ${docLabel} è stata aggiornata, con effetto dal <strong>${dateStr}</strong>.`,
    note: "Non è richiesta alcuna azione in questo momento — ti verrà chiesto di confermare la versione attuale alla prossima prenotazione.",
    button: (docLabel) => `Visualizza ${docLabel}`,
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo account, inviata da ${email}.`,
  },
};

/**
 * Non-blocking notice that a legal document (Terms & Conditions or Privacy
 * Policy) has been updated. Informational only — no acceptance is requested
 * by this email; the user will formally (re-)accept the next time they
 * complete a booking.
 *
 * @param {{
 *   name: string, docType: 'PRIVACY_POLICY' | 'TERMS_CONDITIONS', effectiveDate: Date,
 *   docUrl?: string | null, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const legalDocumentUpdatedEmailHtml = ({ name, docType, effectiveDate, docUrl, language, clientUrl, contactEmail, supportEmail }) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const docLabel = t.docLabel[docType] || docType;
  const locale = lang === "it" ? "it-IT" : "en-GB";
  const dateStr = new Date(effectiveDate).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t.title(docLabel)}</title>
</head>
<body style="margin:0;padding:0;background:#F5F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td align="center" style="padding-bottom:24px;">
          <img src="${clientUrl}/assets/images/Sage-Nest_Final.png" alt="Sage Nest" width="60" style="display:block;width:60px;height:auto;border:0;" />
        </td></tr>

        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #c5ceba;padding:40px 36px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#445446;">${t.heading(docLabel)}</h1>
          <p style="margin:0 0 20px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.body(name, docLabel, dateStr)}</p>
          <p style="margin:0 0 28px;font-size:13px;color:#5e6d5b;line-height:1.6;">${t.note}</p>
          ${docUrl ? `<a href="${docUrl}" style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">${t.button(docLabel)}</a>` : ""}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#5e6d5b;">${t.footerAddress}</p>
          <p style="margin:0 0 8px;font-size:12px;color:#5e6d5b;">${t.footerContact(supportEmail)}</p>
          <p style="margin:0;font-size:11px;color:#9aa596;">${t.transactional(contactEmail)}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const legalDocumentUpdatedEmailSubject = ({ language, docType }) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  return t.subject(t.docLabel[docType] || docType);
};

module.exports = { legalDocumentUpdatedEmailHtml, legalDocumentUpdatedEmailSubject };
