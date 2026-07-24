const COPY = {
  en: {
    title: "Your verification code – Sage Nest",
    purposes: {
      login: { subject: "Your Sage Nest sign-in code", heading: "Sign-in verification code", body: "Enter this code to complete your sign-in." },
      enable_2fa: { subject: "Confirm enabling two-factor authentication", heading: "Enable two-factor authentication", body: "Enter this code to turn on two-factor authentication for your account." },
      disable_2fa: { subject: "Confirm disabling two-factor authentication", heading: "Disable two-factor authentication", body: "Enter this code to turn off two-factor authentication for your account." },
    },
    greeting: (name) => `Hi ${name},`,
    validity: "Valid for <strong>5 minutes</strong> &nbsp;&middot;&nbsp; Single use only",
    ignoreNote: "If you didn't request this code, you can safely ignore this email.",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your account, sent from ${email}.`,
  },
  it: {
    title: "Il tuo codice di verifica – Sage Nest",
    purposes: {
      login: { subject: "Il tuo codice di accesso Sage Nest", heading: "Codice di verifica per l'accesso", body: "Inserisci questo codice per completare l'accesso." },
      enable_2fa: { subject: "Conferma l'attivazione dell'autenticazione a due fattori", heading: "Attiva l'autenticazione a due fattori", body: "Inserisci questo codice per attivare l'autenticazione a due fattori per il tuo account." },
      disable_2fa: { subject: "Conferma la disattivazione dell'autenticazione a due fattori", heading: "Disattiva l'autenticazione a due fattori", body: "Inserisci questo codice per disattivare l'autenticazione a due fattori per il tuo account." },
    },
    greeting: (name) => `Ciao ${name},`,
    validity: "Valido per <strong>5 minuti</strong> &nbsp;&middot;&nbsp; Utilizzabile una sola volta",
    ignoreNote: "Se non hai richiesto questo codice, puoi ignorare questa email in tutta sicurezza.",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo account, inviata da ${email}.`,
  },
};

/**
 * OTP email — subject and body copy vary by purpose.
 * @param {{
 *   name: string, code: string, purpose: 'login' | 'enable_2fa' | 'disable_2fa',
 *   language?: 'en' | 'it', clientUrl: string, contactEmail: string, supportEmail: string,
 * }} params
 */
const otpEmailHtml = ({ name, code, purpose = "login", language, clientUrl, contactEmail, supportEmail }) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const p = t.purposes[purpose] || t.purposes.login;

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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#445446;">${p.heading}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#5e6d5b;line-height:1.6;">${t.greeting(name)} ${p.body}</p>
          <div style="text-align:center;margin:0 0 24px;">
            <div style="display:inline-block;background:#F5F7F5;border:1px solid #E4E7E4;border-radius:12px;padding:20px 40px;">
              <span style="font-size:36px;font-weight:700;color:#445446;letter-spacing:10px;font-family:monospace;">${code}</span>
            </div>
          </div>
          <p style="margin:0 0 8px;font-size:13px;color:#9aa596;text-align:center;">${t.validity}</p>
          <p style="margin:0;font-size:13px;color:#9aa596;text-align:center;">${t.ignoreNote}</p>
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

const otpEmailSubject = ({ language, purpose = "login" }) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  return (t.purposes[purpose] || t.purposes.login).subject;
};

module.exports = { otpEmailHtml, otpEmailSubject };
