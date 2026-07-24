const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: (bookingRef) => `Your refund has been processed — booking ${bookingRef}`,
    title: "Your Refund Has Been Processed – Sage Nest",
    heading: "Your refund has been processed",
    body: (parentFirstName, expertName) =>
      `Hi ${parentFirstName}, a refund has been issued for your booking with <strong>${expertName}</strong>. Funds will typically appear in your account within <strong>3–5 business days</strong>, depending on your bank.`,
    labels: { refundAmount: "Refund amount", booking: "Booking", specialist: "Specialist", date: "Date", time: "Time", bookingRef: "Booking Ref" },
    amountSuffix: (isPartial) => (isPartial ? "(partial refund)" : "(full refund)"),
    noteLabel: "Note:",
    closing: "If you have any questions about your refund, please don't hesitate to contact our support team.",
    button: "View My Bookings",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your booking, sent from ${email}.`,
  },
  it: {
    subject: (bookingRef) => `Il tuo rimborso è stato elaborato — prenotazione ${bookingRef}`,
    title: "Il Tuo Rimborso è Stato Elaborato – Sage Nest",
    heading: "Il tuo rimborso è stato elaborato",
    body: (parentFirstName, expertName) =>
      `Ciao ${parentFirstName}, è stato emesso un rimborso per la tua prenotazione con <strong>${expertName}</strong>. L'importo sarà solitamente visibile sul tuo conto entro <strong>5–10 giorni lavorativi</strong>, a seconda della tua banca.`,
    labels: { refundAmount: "Importo rimborsato", booking: "Prenotazione", specialist: "Professionista", date: "Data", time: "Orario", bookingRef: "Riferimento Prenotazione" },
    amountSuffix: (isPartial) => (isPartial ? "(rimborso parziale)" : "(rimborso completo)"),
    noteLabel: "Nota:",
    closing: "Per qualsiasi domanda sul tuo rimborso, non esitare a contattare il nostro team di assistenza.",
    button: "Visualizza le Mie Prenotazioni",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa alla tua prenotazione, inviata da ${email}.`,
  },
};

/**
 * Refund notification email sent to the parent when a refund is issued.
 *
 * @param {{
 *   parentName: string, expertName: string, serviceTitle: string,
 *   scheduledAt: Date, refundAmount: number, currency?: string,
 *   isPartial: boolean, reason?: string, bookingId: number,
 *   timezone?: string | null, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const refundParentEmailHtml = ({
  parentName,
  expertName,
  serviceTitle,
  scheduledAt,
  refundAmount,
  currency = "EUR",
  isPartial,
  reason,
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
  const amountStr = new Intl.NumberFormat(locale, { style: "currency", currency }).format(parseFloat(refundAmount));
  const bookingRef = formatBookingRef(bookingId);
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

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

        <tr><td align="center" style="padding-bottom:24px;">
          <img src="${logoUrl}" alt="Sage Nest" width="60" style="display:block;width:60px;height:auto;border:0;" />
        </td></tr>

        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #c5ceba;padding:40px 36px;">

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#445446;">
            ${t.heading}
          </h1>
          <p style="margin:0 0 24px;font-size:15px;color:#5e6d5b;line-height:1.6;">
            ${t.body(parentFirstName, expertName)}
          </p>

          <!-- Refund summary card -->
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.refundAmount}</span><br>
                  <span style="font-size:20px;font-weight:700;color:#065F46;">${amountStr}</span>
                  <span style="font-size:13px;color:#065F46;margin-left:6px;">${t.amountSuffix(isPartial)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #6EE7B7;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.booking}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #6EE7B7;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.specialist}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${expertName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #6EE7B7;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.date}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${dateStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #6EE7B7;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.time}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${timeStr} ${tzLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #6EE7B7;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.bookingRef}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${bookingRef}</span>
                </td>
              </tr>
            </table>
          </div>

          ${reason ? `
          <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">
              <strong>${t.noteLabel}</strong> ${reason}
            </p>
          </div>` : ""}

          <p style="margin:0 0 28px;font-size:13px;color:#5e6d5b;line-height:1.6;">
            ${t.closing}
          </p>

          <a href="${clientUrl}/dashboard/parent/upcoming"
             style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
            ${t.button}
          </a>

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

const refundParentEmailSubject = ({ language, bookingId }) => {
  const lang = language === "it" ? "it" : "en";
  return COPY[lang].subject(formatBookingRef(bookingId));
};

module.exports = { refundParentEmailHtml, refundParentEmailSubject };
