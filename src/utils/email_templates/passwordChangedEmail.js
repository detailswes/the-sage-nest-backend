const COPY = {
  en: {
    subject: "Your Sage Nest password has been changed",
    title: "Password changed – Sage Nest",
    heading: "Password changed",
    body: (name) => `Hi ${name}, your Sage Nest password was just successfully changed.`,
    note: "If you made this change, no further action is needed. If you did not change your password, reset it immediately using the button below.",
    button: "Reset My Password",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your account, sent from ${email}.`,
  },
  it: {
    subject: "La tua password Sage Nest è stata modificata",
    title: "Password modificata – Sage Nest",
    heading: "Password modificata",
    body: (name) => `Ciao ${name}, la tua password Sage Nest è stata modificata con successo.`,
    note: "Se sei stato tu a effettuare questa modifica, non è richiesta alcuna azione. Se non hai modificato la password, reimpostala subito usando il pulsante qui sotto.",
    button: "Reimposta la Mia Password",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo account, inviata da ${email}.`,
  },
};

/**
 * Notification sent to a user after a successful password change.
 * @param {{
 *   name: string, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const passwordChangedEmailHtml = ({ name, language, clientUrl, contactEmail, supportEmail }) => {
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
          <a href="${clientUrl}/forgot-password" style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">${t.button}</a>
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

const passwordChangedEmailSubject = ({ language }) => COPY[language === "it" ? "it" : "en"].subject;

module.exports = { passwordChangedEmailHtml, passwordChangedEmailSubject };
