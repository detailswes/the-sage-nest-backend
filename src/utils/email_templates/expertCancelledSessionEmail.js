const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: ({ serviceTitle, dateStr }) =>
      `Your session has been cancelled — full refund issued — ${serviceTitle} on ${dateStr}`,
    title: "Session Cancelled – Sage Nest",
    greeting: (parentFirstName, expertFirstName) =>
      `Hi ${parentFirstName},<br><br>We're sorry to let you know that <strong>${expertFirstName}</strong> has had to cancel your upcoming session.`,
    cancelledSession: "Cancelled Session",
    labels: { expert: "Expert", service: "Service", date: "Date", time: "Time", bookingRef: "Booking Ref" },
    refundHeading: "Full refund issued",
    refund: (amountStr) =>
      `A full refund of <strong>${amountStr}</strong> has been issued to your original payment method. Please allow 5–10 business days for it to appear, depending on your bank.`,
    findHeading: "Find Another Expert",
    findBody: "We know your time and your family's wellbeing matter. If you'd like to book with another expert, you can browse available specialists and find a time that works for you.",
    findButton: "Find another expert",
    closing: (dashboardUrl) =>
      `You can view the details of this cancellation in <a href="${dashboardUrl}" style="color:#445446;text-decoration:underline;font-weight:600;">your dashboard</a> at any time. We're sorry again for the inconvenience — we hope to help you find the right support soon.`,
    signoff: "The Sage Nest Team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your booking, sent from ${email}.`,
  },
  it: {
    subject: ({ serviceTitle, dateStr }) =>
      `La tua sessione è stata cancellata — rimborso integrale effettuato — ${serviceTitle} il ${dateStr}`,
    title: "Sessione Cancellata – Sage Nest",
    greeting: (parentFirstName, expertFirstName) =>
      `Ciao ${parentFirstName},<br><br>ci dispiace informarti che <strong>${expertFirstName}</strong> ha dovuto cancellare la tua prossima sessione.`,
    cancelledSession: "Sessione Cancellata",
    labels: { expert: "Professionista", service: "Servizio", date: "Data", time: "Orario", bookingRef: "Riferimento Prenotazione" },
    refundHeading: "Rimborso integrale effettuato",
    refund: (amountStr) =>
      `Ti abbiamo rimborsato l'intero importo di <strong>${amountStr}</strong> sul metodo di pagamento originale. L'accredito potrà richiedere dai 5 ai 10 giorni lavorativi, a seconda della tua banca.`,
    findHeading: "Trova un Altro Professionista",
    findBody: "Sappiamo quanto contino il tuo tempo e il benessere della tua famiglia. Se desideri prenotare con un altro professionista, puoi consultare gli specialisti disponibili e scegliere l'orario più adatto a te.",
    findButton: "Trova un altro professionista",
    closing: (dashboardUrl) =>
      `Puoi consultare i dettagli di questa cancellazione nella <a href="${dashboardUrl}" style="color:#445446;text-decoration:underline;font-weight:600;">tua dashboard</a> in qualsiasi momento. Ci scusiamo ancora per l'inconveniente: speriamo di aiutarti presto a trovare il supporto giusto.`,
    signoff: "Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa alla tua prenotazione, inviata da ${email}.`,
  },
};

/**
 * Email sent to the parent when their expert cancels a confirmed booking.
 * A full refund is always issued in this case — only call this once the
 * refund has actually succeeded (never assert a refund the system hasn't
 * completed yet).
 *
 * @param {{
 *   parentName: string, expertName: string, serviceTitle: string,
 *   scheduledAt: Date, amount: number, currency?: string, bookingId: number,
 *   timezone?: string | null, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const expertCancelledSessionEmailHtml = ({
  parentName,
  expertName,
  serviceTitle,
  scheduledAt,
  amount,
  currency = "EUR",
  bookingId,
  timezone,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const locale = lang === "it" ? "it-IT" : "en-GB";
  const parentFirstName = parentName?.split(" ")[0] || "there";
  const expertFirstName = expertName?.split(" ")[0] || "";
  const amountStr = new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount));
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;
  const dashboardUrl = `${clientUrl}/dashboard/parent/upcoming`;
  const findExpertUrl = `${clientUrl}/book`;

  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, timezone, lang);

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

          <p style="margin:0 0 28px;font-size:15px;color:#445446;line-height:1.6;">
            ${t.greeting(parentFirstName, expertFirstName)}
          </p>

          <!-- Cancelled session -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.cancelledSession}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.expert}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${expertName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.service}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.date}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${dateStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.time}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${timeStr} ${tzLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-top:12px;border-top:1px solid #c5ceba;padding-bottom:0;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.bookingRef}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${formatBookingRef(bookingId)}</span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Full refund box -->
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:16px;margin-bottom:28px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#065F46;">${t.refundHeading}</p>
            <p style="margin:0;font-size:13px;color:#065F46;line-height:1.6;">
              ${t.refund(amountStr)}
            </p>
          </div>

          <!-- Find another expert -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.findHeading}</p>
          <p style="margin:0 0 20px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            ${t.findBody}
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${findExpertUrl}" style="display:inline-block;background:#445446;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;">${t.findButton}</a>
            </td></tr>
          </table>

          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            ${t.closing(dashboardUrl)}
          </p>

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

const expertCancelledSessionEmailSubject = ({ language, serviceTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ serviceTitle, dateStr });
};

module.exports = { expertCancelledSessionEmailHtml, expertCancelledSessionEmailSubject };
