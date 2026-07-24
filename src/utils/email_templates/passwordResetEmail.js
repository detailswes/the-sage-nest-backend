const COPY = {
  en: {
    subject: "Reset your Sage Nest password",
    title: "Reset your Sage Nest password",
    heading: "Reset your password",
    greeting: (name) => `Hi ${name},`,
    body: "We received a request to reset the password for your Sage Nest account. Click the button below to choose a new password.",
    expiryWarning: "⚠️ This link expires in 1 hour.",
    button: "Reset my password",
    fallbackIntro: "If the button doesn't work, copy and paste this link into your browser:",
    securityNote: "If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your account, sent from ${email}.`,
  },
  it: {
    subject: "Reimposta la tua password Sage Nest",
    title: "Reimposta la tua password Sage Nest",
    heading: "Reimposta la tua password",
    greeting: (name) => `Ciao ${name},`,
    body: "Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account Sage Nest. Clicca sul pulsante qui sotto per scegliere una nuova password.",
    expiryWarning: "⚠️ Questo link scade tra 1 ora.",
    button: "Reimposta la mia password",
    fallbackIntro: "Se il pulsante non funziona, copia e incolla questo link nel tuo browser:",
    securityNote: "Se non hai richiesto la reimpostazione della password, puoi ignorare questa email in tutta sicurezza. La tua password rimarrà invariata.",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo account, inviata da ${email}.`,
  },
};

/**
 * Password reset email HTML template.
 *
 * @param {{ name: string, resetUrl: string, language?: 'en' | 'it', clientUrl: string, contactEmail: string, supportEmail: string }} params
 * @returns {string} Full HTML string ready to send
 */
const passwordResetEmailHtml = ({ name, resetUrl, language, clientUrl, contactEmail, supportEmail }) => {
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
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="${clientUrl}/assets/images/Sage-Nest_Final.png" alt="Sage Nest" width="60" style="display:block;width:60px;height:auto;border:0;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #c5ceba;padding:40px 36px;">

              <!-- Icon -->
              <div style="text-align:center;margin-bottom:28px;">
                <div style="display:inline-block;background-color:#FEF2F2;border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;">
                  <span style="font-size:28px;">🔑</span>
                </div>
              </div>

              <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#445446;text-align:center;">
                ${t.heading}
              </h1>
              <p style="margin:0 0 8px;font-size:15px;color:#5e6d5b;line-height:1.6;text-align:center;">
                ${t.greeting(name)}
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#5e6d5b;line-height:1.7;text-align:center;">
                ${t.body}
              </p>

              <!-- Expiry warning -->
              <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;margin-bottom:24px;text-align:center;">
                <p style="margin:0;font-size:13px;font-weight:600;color:#DC2626;">
                  ${t.expiryWarning}
                </p>
              </div>

              <!-- CTA Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a
                  href="${resetUrl}"
                  style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;"
                >
                  ${t.button}
                </a>
              </div>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #c5ceba;margin:0 0 20px;" />

              <!-- Fallback link -->
              <p style="margin:0 0 6px;font-size:12px;color:#5e6d5b;text-align:center;">
                ${t.fallbackIntro}
              </p>
              <p style="margin:0 0 20px;font-size:11px;color:#445446;word-break:break-all;text-align:center;">
                ${resetUrl}
              </p>

              <!-- Security note -->
              <p style="margin:0;font-size:12px;color:#5e6d5b;text-align:center;line-height:1.6;">
                ${t.securityNote}
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0 0 4px;font-size:12px;color:#5e6d5b;">${t.footerAddress}</p>
              <p style="margin:0 0 8px;font-size:12px;color:#5e6d5b;">${t.footerContact(supportEmail)}</p>
              <p style="margin:0;font-size:11px;color:#9aa596;">${t.transactional(contactEmail)}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const passwordResetEmailSubject = ({ language }) => COPY[language === "it" ? "it" : "en"].subject;

module.exports = { passwordResetEmailHtml, passwordResetEmailSubject };
