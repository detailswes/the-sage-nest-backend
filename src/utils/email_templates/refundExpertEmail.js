const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: (bookingRef) => `A refund has been issued for booking ${bookingRef}`,
    title: "Refund Issued – Sage Nest",
    heading: (bookingRef) => `Refund issued — booking ${bookingRef}`,
    body: (expertFirstName, isPartial, amountStr, parentName) =>
      `Hi ${expertFirstName}, a ${isPartial ? "partial" : "full"} refund of <strong>${amountStr}</strong> has been issued to <strong>${parentName}</strong> for the booking below. This action was initiated by the Sage Nest admin team.`,
    labels: { parentClient: "Parent / Client", service: "Service", date: "Date", time: "Time", amountRefunded: "Amount Refunded", bookingRef: "Booking Ref" },
    amountSuffix: (isPartial) => (isPartial ? "(partial)" : "(full)"),
    payoutNoteLabel: "Payout note:",
    payoutNotePartial: "As a partial refund has been issued, the remaining balance for this booking will not be paid out automatically. Please contact support if you have questions.",
    payoutNoteFull: "As a full refund has been issued, the payout for this booking will not be processed.",
    closing: (email) => `If you have any questions about this refund, please contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    button: "View My Appointments",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about a booking, sent from ${email}.`,
  },
  it: {
    subject: (bookingRef) => `È stato emesso un rimborso per la prenotazione ${bookingRef}`,
    title: "Rimborso Emesso – Sage Nest",
    heading: (bookingRef) => `Rimborso emesso — prenotazione ${bookingRef}`,
    body: (expertFirstName, isPartial, amountStr, parentName) =>
      `Ciao ${expertFirstName}, un rimborso ${isPartial ? "parziale" : "completo"} di <strong>${amountStr}</strong> è stato emesso a <strong>${parentName}</strong> per la prenotazione qui sotto. Questa azione è stata avviata dal team di amministrazione di Sage Nest.`,
    labels: { parentClient: "Genitore / Cliente", service: "Servizio", date: "Data", time: "Orario", amountRefunded: "Importo Rimborsato", bookingRef: "Riferimento Prenotazione" },
    amountSuffix: (isPartial) => (isPartial ? "(parziale)" : "(completo)"),
    payoutNoteLabel: "Nota sul compenso:",
    payoutNotePartial: "Poiché è stato emesso un rimborso parziale, il saldo residuo di questa prenotazione non verrà corrisposto automaticamente. Contatta l'assistenza per qualsiasi domanda.",
    payoutNoteFull: "Poiché è stato emesso un rimborso completo, il compenso per questa prenotazione non verrà corrisposto.",
    closing: (email) => `Per qualsiasi domanda su questo rimborso, contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    button: "Visualizza i Miei Appuntamenti",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
  },
};

/**
 * Refund notification email sent to the expert when a refund is issued for one of their bookings.
 *
 * @param {{
 *   expertName: string, parentName: string, serviceTitle: string,
 *   scheduledAt: Date, refundAmount: number, currency?: string,
 *   isPartial: boolean, bookingId: number, timezone?: string | null,
 *   language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const refundExpertEmailHtml = ({
  expertName,
  parentName,
  serviceTitle,
  scheduledAt,
  refundAmount,
  currency = "EUR",
  isPartial,
  bookingId,
  timezone,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const expertFirstName = expertName?.split(" ")[0] || "there";
  const locale = lang === "it" ? "it-IT" : "en-GB";
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
            ${t.heading(bookingRef)}
          </h1>
          <p style="margin:0 0 24px;font-size:15px;color:#5e6d5b;line-height:1.6;">
            ${t.body(expertFirstName, isPartial, amountStr, parentName)}
          </p>

          <!-- Booking details card -->
          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.parentClient}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${parentName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #FED7AA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.service}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #FED7AA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.date}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${dateStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #FED7AA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.time}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${timeStr} ${tzLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #FED7AA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.amountRefunded}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#C2410C;">${amountStr} ${t.amountSuffix(isPartial)}</span>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #FED7AA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.bookingRef}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${bookingRef}</span>
                </td>
              </tr>
            </table>
          </div>

          <div style="background:#F5F7F5;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#5e6d5b;line-height:1.5;">
              <strong>${t.payoutNoteLabel}</strong> ${isPartial ? t.payoutNotePartial : t.payoutNoteFull}
            </p>
          </div>

          <p style="margin:0 0 28px;font-size:13px;color:#5e6d5b;line-height:1.6;">
            ${t.closing(supportEmail)}
          </p>

          <a href="${clientUrl}/dashboard/expert/appointments"
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

const refundExpertEmailSubject = ({ language, bookingId }) => {
  const lang = language === "it" ? "it" : "en";
  return COPY[lang].subject(formatBookingRef(bookingId));
};

module.exports = { refundExpertEmailHtml, refundExpertEmailSubject };
