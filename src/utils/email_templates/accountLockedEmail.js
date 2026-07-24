const COPY = {
  en: {
    subject: "Your Sage Nest account has been temporarily locked",
    title: "Account temporarily locked – Sage Nest",
    heading: "Account temporarily locked",
    body: (name) =>
      `Hi ${name}, we detected 5 consecutive failed login attempts on your account and have temporarily locked it for <strong>15 minutes</strong>.`,
    note: (unlockTime) =>
      `Your account will automatically unlock at <strong>${unlockTime}</strong>. If this wasn't you, we recommend resetting your password immediately.`,
    button: "Reset My Password",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your account, sent from ${email}.`,
  },
  it: {
    subject: "Il tuo account Sage Nest è stato temporaneamente bloccato",
    title: "Account temporaneamente bloccato – Sage Nest",
    heading: "Account temporaneamente bloccato",
    body: (name) =>
      `Ciao ${name}, abbiamo rilevato 5 tentativi di accesso falliti consecutivi sul tuo account e lo abbiamo temporaneamente bloccato per <strong>15 minuti</strong>.`,
    note: (unlockTime) =>
      `Il tuo account si sbloccherà automaticamente alle <strong>${unlockTime}</strong>. Se non sei stato tu, ti consigliamo di reimpostare subito la password.`,
    button: "Reimposta la Mia Password",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo account, inviata da ${email}.`,
  },
};

/**
 * Account locked notification — sent after 5 consecutive failed login attempts.
 * @param {{
 *   name: string, unlockAt: Date, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const accountLockedEmailHtml = ({ name, unlockAt, language, clientUrl, contactEmail, supportEmail }) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const locale = lang === "it" ? "it-IT" : "en-GB";
  const unlockTime = new Date(unlockAt).toLocaleString(locale, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

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
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.note(unlockTime)}</p>
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

const accountLockedEmailSubject = ({ language }) => COPY[language === "it" ? "it" : "en"].subject;

module.exports = { accountLockedEmailHtml, accountLockedEmailSubject };
