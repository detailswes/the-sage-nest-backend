const COPY = {
  en: {
    title: "Verify your Sage Nest account",
    greeting: (name) => `Hi ${name},`,
    button: "Verify my email",
    fallbackIntro: "If the button doesn't work, copy and paste this link into your browser:",
    ignoreNote: "If you didn't create a Sage Nest account, you can safely ignore this email.",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your account, sent from ${email}.`,
    variants: {
      default: {
        subject: "Verify your Sage Nest email address",
        heading: "Verify your email address",
        body: "Thanks for signing up on Sage Nest!<br />Click the button below to verify your email and activate your account.",
      },
      emailChange: {
        subject: "Verify your new Sage Nest email address",
        heading: "Verify your new email address",
        body: "You recently changed your email address on Sage Nest. Click the button below to verify your new address and restore access to your account.",
      },
    },
  },
  it: {
    title: "Verifica il tuo account Sage Nest",
    greeting: (name) => `Ciao ${name},`,
    button: "Verifica la mia email",
    fallbackIntro: "Se il pulsante non funziona, copia e incolla questo link nel tuo browser:",
    ignoreNote: "Se non hai creato un account Sage Nest, puoi ignorare questa email in tutta sicurezza.",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo account, inviata da ${email}.`,
    variants: {
      default: {
        subject: "Verifica il tuo indirizzo email Sage Nest",
        heading: "Verifica il tuo indirizzo email",
        body: "Grazie per esserti registrato su Sage Nest!<br />Clicca sul pulsante qui sotto per verificare la tua email e attivare il tuo account.",
      },
      emailChange: {
        subject: "Verifica il tuo nuovo indirizzo email Sage Nest",
        heading: "Verifica il tuo nuovo indirizzo email",
        body: "Hai recentemente modificato il tuo indirizzo email su Sage Nest. Clicca sul pulsante qui sotto per verificare il nuovo indirizzo e ripristinare l'accesso al tuo account.",
      },
    },
  },
};

/**
 * Verification email HTML template.
 *
 * @param {{
 *   name: string, verificationUrl: string, variant?: 'default' | 'emailChange',
 *   language?: 'en' | 'it', clientUrl: string, contactEmail: string, supportEmail: string,
 * }} params
 * @returns {string} Full HTML string ready to send
 */
const verificationEmailHtml = ({
  name,
  verificationUrl,
  variant = "default",
  language,
  clientUrl,
  contactEmail,
  supportEmail,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const v = t.variants[variant] || t.variants.default;

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
                <div style="display:inline-block;background-color:#EDF2ED;border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;">
                  <span style="font-size:28px;">✉️</span>
                </div>
              </div>

              <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#445446;text-align:center;">
                ${v.heading}
              </h1>
              <p style="margin:0 0 8px;font-size:15px;color:#5e6d5b;line-height:1.6;text-align:center;">
                ${t.greeting(name)}
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.7;text-align:center;">
                ${v.body}
              </p>

              <!-- CTA Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a
                  href="${verificationUrl}"
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
              <p style="margin:0;font-size:11px;color:#445446;word-break:break-all;text-align:center;">
                ${verificationUrl}
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0 0 16px;font-size:12px;color:#5e6d5b;">${t.ignoreNote}</p>
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

const verificationEmailSubject = ({ language, variant = "default" }) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  return (t.variants[variant] || t.variants.default).subject;
};

module.exports = { verificationEmailHtml, verificationEmailSubject };
