const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: ({ serviceTitle, parentFirstName, dateStr }) =>
      `Cancellation confirmed — ${serviceTitle} with ${parentFirstName} on ${dateStr}`,
    title: "Cancellation Confirmed – Sage Nest",
    greeting: (expertFirstName) =>
      `Hi ${expertFirstName},<br><br>This confirms that you have cancelled the following session.`,
    cancelledSession: "Cancelled Session",
    labels: { parentName: "Parent Name", service: "Service", date: "Date", time: "Time", bookingRef: "Booking Ref" },
    consequenceHeading: "What happens next",
    consequence: "The parent has been notified and has received a full refund. No payout will be made for this booking.",
    reminder: "We know cancelling is sometimes unavoidable. Where possible, offering to reschedule instead helps parents keep the support they need — each booking can be rescheduled once. Repeated cancellations may be reviewed under your Expert Agreement (clause 9.3).",
    button: "Go to your dashboard",
    closing: (email) => `If this cancellation was made in error, or you have any questions, write to us at <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "The Sage Nest Team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about a booking, sent from ${email}.`,
  },
  it: {
    subject: ({ serviceTitle, parentFirstName, dateStr }) =>
      `Cancellazione confermata — ${serviceTitle} con ${parentFirstName} il ${dateStr}`,
    title: "Cancellazione Confermata – Sage Nest",
    greeting: (expertFirstName) =>
      `Ciao ${expertFirstName},<br><br>ti confermiamo la cancellazione della seguente sessione.`,
    cancelledSession: "Sessione Cancellata",
    labels: { parentName: "Nome del Genitore", service: "Servizio", date: "Data", time: "Orario", bookingRef: "Riferimento Prenotazione" },
    consequenceHeading: "Cosa succede ora",
    consequence: "Il genitore è stato informato e ha ricevuto un rimborso integrale. Per questa prenotazione non verrà corrisposto alcun compenso.",
    reminder: "Sappiamo che a volte cancellare è inevitabile. Quando possibile, proporre una modifica della prenotazione aiuta i genitori a mantenere il supporto di cui hanno bisogno — ogni prenotazione può essere modificata una sola volta. Cancellazioni ripetute possono essere esaminate ai sensi del tuo Contratto per Esperti (articolo 9.3).",
    button: "Vai alla tua dashboard",
    closing: (email) => `Se questa cancellazione è avvenuta per errore, o per qualsiasi domanda, scrivici a <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
  },
};

/**
 * Confirmation email sent to an expert after they cancel one of their own
 * sessions — their durable record that the parent was notified and refunded
 * in full, and that no payout will be made. Only call this once the parent's
 * full refund has actually succeeded (same gate as the parent-facing notice
 * — the two share one trigger point).
 *
 * @param {{
 *   expertName: string, parentName: string, serviceTitle: string,
 *   scheduledAt: Date, bookingId: number, timezone?: string | null,
 *   language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const expertCancellationConfirmationEmailHtml = ({
  expertName,
  parentName,
  serviceTitle,
  scheduledAt,
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
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;
  const dashboardUrl = `${clientUrl}/dashboard/expert/appointments`;

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
            ${t.greeting(expertFirstName)}
          </p>

          <!-- Cancelled session -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.cancelledSession}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.parentName}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${parentName}</span>
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

          <!-- Consequence box -->
          <div style="background:#FFF7ED;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400E;">${t.consequenceHeading}</p>
            <p style="margin:0;font-size:13px;color:#92400E;line-height:1.6;">${t.consequence}</p>
          </div>

          <!-- Reschedule reminder -->
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.reminder}</p>

          <!-- Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${dashboardUrl}" style="display:inline-block;background:#445446;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;">${t.button}</a>
            </td></tr>
          </table>

          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            ${t.closing(supportEmail)}
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

const expertCancellationConfirmationEmailSubject = ({ language, serviceTitle, parentName, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const parentFirstName = parentName?.split(" ")[0] || "";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ serviceTitle, parentFirstName, dateStr });
};

module.exports = { expertCancellationConfirmationEmailHtml, expertCancellationConfirmationEmailSubject };
