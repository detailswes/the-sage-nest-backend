const COPY = {
  en: {
    subject: "Sage Nest — Profile update required",
    title: "Sage Nest — Profile update required",
    heading: "Profile update required",
    intro: (name) => `Hi ${name}, our team has reviewed your expert profile and has a few items that need to be corrected before it can be approved.`,
    feedbackLabel: "Feedback from our team",
    body: "Please log in to your dashboard, make the necessary updates, and save your profile. Once saved, your profile will automatically be resubmitted for review.",
    button: "Update My Profile",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your expert profile, sent from ${email}.`,
  },
  it: {
    subject: "Sage Nest — Aggiornamento del profilo richiesto",
    title: "Sage Nest — Aggiornamento del profilo richiesto",
    heading: "Aggiornamento del profilo richiesto",
    intro: (name) => `Ciao ${name}, il nostro team ha esaminato il tuo profilo professionista e ha individuato alcuni elementi da correggere prima che possa essere approvato.`,
    feedbackLabel: "Feedback dal nostro team",
    body: "Accedi alla tua dashboard, apporta le modifiche necessarie e salva il tuo profilo. Una volta salvato, il profilo verrà automaticamente inviato di nuovo per la revisione.",
    button: "Aggiorna il Mio Profilo",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo profilo professionista, inviata da ${email}.`,
  },
};

/**
 * Email sent to a specialist when admin requests profile corrections.
 * @param {{
 *   name: string, note: string, dashboardUrl: string, clientUrl: string,
 *   language?: 'en' | 'it', contactEmail: string, supportEmail: string,
 * }} param0
 */
const changesRequestedEmailHtml = ({ name, note, dashboardUrl, clientUrl, language, contactEmail, supportEmail }) => {
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
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#445446;">
                ${t.heading}
              </h1>
              <p style="margin:0 0 20px;font-size:15px;color:#5e6d5b;line-height:1.6;">
                ${t.intro(name)}
              </p>

              <!-- Admin note box -->
              <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
                <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400E;">
                  ${t.feedbackLabel}
                </p>
                <p style="margin:0;font-size:14px;color:#78350F;line-height:1.6;white-space:pre-wrap;">${note}</p>
              </div>

              <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">
                ${t.body}
              </p>

              <a href="${dashboardUrl}" style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;margin-top:8px;">
                ${t.button}
              </a>
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

const changesRequestedEmailSubject = ({ language }) => COPY[language === "it" ? "it" : "en"].subject;

module.exports = { changesRequestedEmailHtml, changesRequestedEmailSubject };
