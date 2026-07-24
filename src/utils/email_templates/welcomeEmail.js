const COPY = {
  en: {
    subject: "Welcome to Sage Nest!",
    title: "Welcome to Sage Nest",
    heading: (name) => `Welcome, ${name}!`,
    intro: "You're now part of Sage Nest — a community connecting families with trusted child-care experts.",
    roleNote: {
      EXPERT: "Complete your profile and connect your Stripe account to start receiving bookings.",
      PARENT: "Browse experts and book your first session whenever you're ready.",
    },
    button: "Go to Dashboard",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your account, sent from ${email}.`,
  },
  it: {
    subject: "Benvenuto/a su Sage Nest!",
    title: "Benvenuto/a su Sage Nest",
    heading: (name) => `Benvenuto/a, ${name}!`,
    intro: "Ora fai parte di Sage Nest — una community che mette in contatto le famiglie con professionisti della cura dei bambini di fiducia.",
    roleNote: {
      EXPERT: "Completa il tuo profilo e collega il tuo account Stripe per iniziare a ricevere prenotazioni.",
      PARENT: "Sfoglia i professionisti e prenota la tua prima sessione quando sei pronto/a.",
    },
    button: "Vai alla Dashboard",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo account, inviata da ${email}.`,
  },
};

/**
 * Welcome email after successful registration.
 * @param {{
 *   name: string, role: 'EXPERT' | 'PARENT', language?: 'en' | 'it',
 *   clientUrl: string, contactEmail: string, supportEmail: string,
 * }} params
 */
const welcomeEmailHtml = ({ name, role, language, clientUrl, contactEmail, supportEmail }) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const roleNote = t.roleNote[role] || t.roleNote.PARENT;

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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#445446;">${t.heading(name)}</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#5e6d5b;line-height:1.6;">${t.intro}</p>
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${roleNote}</p>
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

const welcomeEmailSubject = ({ language }) => COPY[language === "it" ? "it" : "en"].subject;

module.exports = { welcomeEmailHtml, welcomeEmailSubject };
