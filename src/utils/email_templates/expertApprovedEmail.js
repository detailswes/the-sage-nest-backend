const COPY = {
  en: {
    subject: "Your Sage Nest expert profile has been approved!",
    title: "You're approved! – Sage Nest",
    heading: "You're approved!",
    body: (name) =>
      `Hi ${name}, your expert profile on Sage Nest has been reviewed and <strong>approved</strong>. Parents can now discover and book your services.`,
    note: "Make sure your availability is up to date so parents can find the right time to book with you.",
    button: "View My Profile",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your account, sent from ${email}.`,
  },
  it: {
    subject: "Il tuo profilo professionista su Sage Nest è stato approvato!",
    title: "Sei stato/a approvato/a! – Sage Nest",
    heading: "Sei stato/a approvato/a!",
    body: (name) =>
      `Ciao ${name}, il tuo profilo professionista su Sage Nest è stato esaminato e <strong>approvato</strong>. I genitori possono ora scoprire e prenotare i tuoi servizi.`,
    note: "Assicurati che la tua disponibilità sia aggiornata, così i genitori possono trovare l'orario giusto per prenotare con te.",
    button: "Visualizza il Mio Profilo",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo account, inviata da ${email}.`,
  },
};

/**
 * Notify an expert that their profile has been approved.
 * @param {{
 *   name: string, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const expertApprovedEmailHtml = ({ name, language, clientUrl, contactEmail, supportEmail }) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];

  return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t.title}</title>
</head>
<body style="margin:0;padding:0;background:#F5F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td align="center" style="padding-bottom:24px;">
          <img src="${clientUrl}/assets/images/Sage-Nest_Final.png" alt="Sage Nest" width="60" style="display:block;width:60px;height:auto;border:0;" />
        </td></tr>

        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #c5ceba;padding:40px 36px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#445446;">${t.heading}</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#5e6d5b;line-height:1.6;">${t.body(name)}</p>
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.note}</p>
          <a href="${clientUrl}/dashboard" style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">${t.button}</a>
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

const expertApprovedEmailSubject = ({ language }) => COPY[language === "it" ? "it" : "en"].subject;

module.exports = { expertApprovedEmailHtml, expertApprovedEmailSubject };
