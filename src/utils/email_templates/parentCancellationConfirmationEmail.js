const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: ({ serviceTitle, dateStr }) =>
      `Cancellation confirmed — ${serviceTitle} on ${dateStr}`,
    title: "Cancellation Confirmed – Sage Nest",
    greeting: (parentFirstName) =>
      `Hi ${parentFirstName},<br><br>This confirms that you have cancelled the following session.`,
    cancelledSession: "Cancelled Session",
    labels: { expert: "Expert", service: "Service", date: "Date", time: "Time", format: "Format", bookingRef: "Booking Ref", reason: "Reason" },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In-Person", HOME_VISIT: "Home Visit" },
    refundOutcomeHeading: "Refund outcome",
    refundOutcome100: (amountStr) =>
      `As the cancellation was made more than 24 hours before the session, you have received a full refund of ${amountStr}.`,
    refundOutcome50: (halfAmountStr) =>
      `As the cancellation was made between 12 and 24 hours before the session, you have received a 50% refund of ${halfAmountStr}.`,
    refundOutcome0: () =>
      `As the cancellation was made less than 12 hours before the session, no refund has been issued.`,
    refundNote: "Please allow 5–10 business days for the refund to appear, depending on your bank.",
    findHeading: "Find Another Expert",
    findBody: "If you'd like to book with another expert, you can browse available specialists and find a time that works for you.",
    findButton: "Find another expert",
    closing: (dashboardUrl) =>
      `You can view the details of this cancellation in <a href="${dashboardUrl}" style="color:#445446;text-decoration:underline;font-weight:600;">your dashboard</a> at any time.`,
    closing2: (email) => `If this cancellation was made in error, or you have any questions, write to us at <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "The Sage Nest Team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your booking, sent from ${email}.`,
  },
  it: {
    subject: ({ serviceTitle, dateStr }) =>
      `Cancellazione confermata — ${serviceTitle} il ${dateStr}`,
    title: "Cancellazione Confermata – Sage Nest",
    greeting: (parentFirstName) =>
      `Ciao ${parentFirstName},<br><br>ti confermiamo la cancellazione della seguente sessione.`,
    cancelledSession: "Sessione Cancellata",
    labels: { expert: "Professionista", service: "Servizio", date: "Data", time: "Orario", format: "Modalità", bookingRef: "Riferimento Prenotazione", reason: "Motivo" },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In presenza", HOME_VISIT: "Visita a domicilio" },
    refundOutcomeHeading: "Esito del rimborso",
    refundOutcome100: (amountStr) =>
      `Poiché la cancellazione è avvenuta più di 24 ore prima della sessione, hai ricevuto un rimborso integrale di ${amountStr}.`,
    refundOutcome50: (halfAmountStr) =>
      `Poiché la cancellazione è avvenuta tra 12 e 24 ore prima della sessione, hai ricevuto un rimborso del 50% di ${halfAmountStr}.`,
    refundOutcome0: () =>
      `Poiché la cancellazione è avvenuta meno di 12 ore prima della sessione, non è stato emesso alcun rimborso.`,
    refundNote: "L'accredito potrà richiedere dai 5 ai 10 giorni lavorativi, a seconda della tua banca.",
    findHeading: "Trova un Altro Professionista",
    findBody: "Se desideri prenotare con un altro professionista, puoi consultare gli specialisti disponibili e scegliere l'orario più adatto a te.",
    findButton: "Trova un altro professionista",
    closing: (dashboardUrl) =>
      `Puoi consultare i dettagli di questa cancellazione nella <a href="${dashboardUrl}" style="color:#445446;text-decoration:underline;font-weight:600;">tua dashboard</a> in qualsiasi momento.`,
    closing2: (email) => `Se questa cancellazione è avvenuta per errore, o per qualsiasi domanda, scrivici a <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa alla tua prenotazione, inviata da ${email}.`,
  },
};

/**
 * Confirmation email sent to a parent after they cancel their own booking —
 * their durable record of what was cancelled and the refund outcome. Mirrors
 * expertCancellationConfirmationEmail (the expert-side equivalent) and shares
 * refund-tier copy with cancellationNotificationEmail (the expert-facing
 * notice sent from the same cancelBooking flow).
 *
 * @param {{
 *   parentName: string, expertName: string, serviceTitle: string,
 *   format: 'ONLINE' | 'IN_PERSON' | 'HOME_VISIT', scheduledAt: Date,
 *   cancellationReason?: string, refundPercent: 0 | 50 | 100,
 *   amount: number | string, currency?: string, bookingId: number,
 *   timezone?: string | null, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const parentCancellationConfirmationEmailHtml = ({
  parentName,
  expertName,
  serviceTitle,
  format,
  scheduledAt,
  cancellationReason,
  refundPercent,
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
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;
  const dashboardUrl = `${clientUrl}/dashboard/parent/upcoming`;
  const findExpertUrl = `${clientUrl}/book`;

  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, timezone, lang);

  const totalAmount = Number(amount) || 0;
  const halfAmount = totalAmount * 0.5;
  const fmt = (n) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);

  const refundOutcome =
    refundPercent === 100
      ? t.refundOutcome100(fmt(totalAmount))
      : refundPercent === 50
      ? t.refundOutcome50(fmt(halfAmount))
      : t.refundOutcome0();

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
            ${t.greeting(parentFirstName)}
          </p>

          <!-- Cancelled session -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.cancelledSession}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:${cancellationReason ? "16px" : "24px"};">
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
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.format}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${t.formatLabel[format] || format}</span>
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

          ${cancellationReason ? `
          <div style="background:#F5F7F5;border-radius:12px;padding:14px 24px;margin-bottom:24px;">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.reason}</span><br>
            <span style="font-size:13px;font-weight:600;color:#445446;">${cancellationReason}</span>
          </div>` : ""}

          <!-- Refund outcome -->
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:16px;margin-bottom:28px;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;color:#065F46;letter-spacing:0.6px;">${t.refundOutcomeHeading}</p>
            <p style="margin:0;font-size:13px;color:#065F46;line-height:1.6;">${refundOutcome} ${refundPercent > 0 ? t.refundNote : ""}</p>
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

          <p style="margin:0 0 12px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            ${t.closing(dashboardUrl)}
          </p>
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            ${t.closing2(supportEmail)}
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

const parentCancellationConfirmationEmailSubject = ({ language, serviceTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ serviceTitle, dateStr });
};

module.exports = { parentCancellationConfirmationEmailHtml, parentCancellationConfirmationEmailSubject };
