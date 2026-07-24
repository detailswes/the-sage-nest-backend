const COPY = {
  en: {
    subject: "Your Sage Nest account has been suspended",
    title: "Account Suspended – Sage Nest",
    heading: "Your account has been suspended",
    greeting: (parentFirstName) => `Hi ${parentFirstName},`,
    intro: "Your Sage Nest account has been suspended by our team. You will no longer be able to log in or make new bookings.",
    bookingLine: (cancelledBookingCount) =>
      `Any upcoming confirmed session${cancelledBookingCount !== 1 ? "s have" : " has"} been cancelled and refunded according to our standard Cancellation and Rescheduling Policy, where applicable. Refunds typically appear within 5–10 business days.`,
    helpLabel: "Need help?",
    help: (email) => `If you believe this is an error or would like to appeal, please contact us at <a href="mailto:${email}" style="color:#445446;text-decoration:none;font-weight:600;">${email}</a> and include your registered email address.`,
    signoff: "The Sage Nest Team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your account, sent from ${email}.`,
  },
  it: {
    subject: "Il tuo account Sage Nest è stato sospeso",
    title: "Account Sospeso – Sage Nest",
    heading: "Il tuo account è stato sospeso",
    greeting: (parentFirstName) => `Ciao ${parentFirstName},`,
    intro: "Il tuo account Sage Nest è stato sospeso dal nostro team. Non potrai più accedere né effettuare nuove prenotazioni.",
    bookingLine: () =>
      "Le eventuali sessioni confermate in programma sono state cancellate e rimborsate secondo le nostre Condizioni di Cancellazione e Modifica della Prenotazione, ove applicabili. I rimborsi sono solitamente visibili entro 5–10 giorni lavorativi.",
    helpLabel: "Hai bisogno di aiuto?",
    help: (email) => `Se ritieni che si tratti di un errore o desideri presentare ricorso, contattaci a <a href="mailto:${email}" style="color:#445446;text-decoration:none;font-weight:600;">${email}</a> indicando il tuo indirizzo email registrato.`,
    signoff: "Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo account, inviata da ${email}.`,
  },
};

/**
 * Email sent to a parent when their account is suspended by an admin.
 * Bookings are cancelled as part of the same action.
 *
 * @param {{
 *   parentName: string, cancelledBookingCount: number, language?: 'en' | 'it',
 *   clientUrl: string, contactEmail: string, supportEmail: string,
 * }} params
 */
const parentSuspendedEmailHtml = ({ parentName, cancelledBookingCount, language, clientUrl, contactEmail, supportEmail }) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const parentFirstName = parentName?.split(" ")[0] || "there";
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const bookingLine = cancelledBookingCount > 0
    ? `<p style="margin:0 0 16px;font-size:15px;color:#5e6d5b;line-height:1.6;">${t.bookingLine(cancelledBookingCount)}</p>`
    : "";

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

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:24px;">
          <img src="${logoUrl}" alt="Sage Nest" width="60" style="display:block;width:60px;height:auto;border:0;" />
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #c5ceba;padding:40px 36px;">

          <!-- Alert icon -->
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:#FFF7ED;border-radius:50%;width:56px;height:56px;line-height:56px;text-align:center;">
              <span style="font-size:26px;">⚠️</span>
            </div>
          </div>

          <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#445446;text-align:center;">
            ${t.heading}
          </h1>

          <p style="margin:0 0 16px;font-size:15px;color:#5e6d5b;line-height:1.6;">
            ${t.greeting(parentFirstName)}
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#5e6d5b;line-height:1.6;">
            ${t.intro}
          </p>

          ${bookingLine}

          <!-- Contact box -->
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#445446;">${t.helpLabel}</p>
            <p style="margin:0;font-size:13px;color:#5e6d5b;line-height:1.6;">${t.help(supportEmail)}</p>
          </div>

          <!-- Sign-off -->
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#445446;">${t.signoff}</p>

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

const parentSuspendedEmailSubject = ({ language }) => COPY[language === "it" ? "it" : "en"].subject;

module.exports = { parentSuspendedEmailHtml, parentSuspendedEmailSubject };
