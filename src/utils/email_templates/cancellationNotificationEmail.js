const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: ({ serviceTitle, dateStr }) => `Booking cancelled — ${serviceTitle} on ${dateStr}`,
    title: "Booking Cancelled – Sage Nest",
    greeting: (expertFirstName, parentFirstName) =>
      `Hi ${expertFirstName},<br><br>We are writing to let you know that <strong>${parentFirstName}</strong> has cancelled the following booking:`,
    cancelledBooking: "Cancelled Booking",
    labels: { parentName: "Parent name", service: "Service", date: "Date", time: "Time", format: "Format", bookingRef: "Booking Ref", reason: "Reason" },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In-Person" },
    refundOutcomeHeading: "Refund outcome",
    refundOutcome100: (parentFirstName, amountStr) =>
      `As the cancellation was made more than 24 hours before the session, ${parentFirstName} has received a full refund of ${amountStr}.`,
    refundOutcome50: (parentFirstName, halfAmountStr) =>
      `As the cancellation was made between 12 and 24 hours before the session, ${parentFirstName} has received a 50% refund of ${halfAmountStr}. The remaining 50% (${halfAmountStr}) will be transferred to you in line with the standard payout schedule.`,
    refundOutcome0: (totalAmountStr) =>
      `As the cancellation was made less than 12 hours before the session, no refund has been issued. The full amount (${totalAmountStr}) will be transferred to you in line with the standard payout schedule.`,
    body1: "We are sorry for the disruption to your schedule. You can view all your bookings and any updates in your Sage Nest expert dashboard.",
    body2: (email) => `If you have any questions, please do not hesitate to contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "The Sage Nest Team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about a booking, sent from ${email}.`,
  },
  it: {
    subject: ({ serviceTitle, dateStr }) => `Prenotazione cancellata — ${serviceTitle} il ${dateStr}`,
    title: "Prenotazione Cancellata – Sage Nest",
    greeting: (expertFirstName, parentFirstName) =>
      `Ciao ${expertFirstName},<br><br>ti informiamo che <strong>${parentFirstName}</strong> ha cancellato la seguente prenotazione:`,
    cancelledBooking: "Prenotazione Cancellata",
    labels: { parentName: "Nome del genitore", service: "Servizio", date: "Data", time: "Orario", format: "Modalità", bookingRef: "Riferimento Prenotazione", reason: "Motivo" },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In presenza" },
    refundOutcomeHeading: "Esito del rimborso",
    refundOutcome100: (parentFirstName, amountStr) =>
      `Poiché la cancellazione è avvenuta più di 24 ore prima della sessione, ${parentFirstName} ha ricevuto un rimborso completo di ${amountStr}.`,
    refundOutcome50: (parentFirstName, halfAmountStr) =>
      `Poiché la cancellazione è avvenuta tra 12 e 24 ore prima della sessione, ${parentFirstName} ha ricevuto un rimborso del 50% di ${halfAmountStr}. Il restante 50% (${halfAmountStr}) ti verrà trasferito secondo il consueto calendario dei pagamenti.`,
    refundOutcome0: (totalAmountStr) =>
      `Poiché la cancellazione è avvenuta meno di 12 ore prima della sessione, non è stato emesso alcun rimborso. L'importo completo (${totalAmountStr}) ti verrà trasferito secondo il consueto calendario dei pagamenti.`,
    body1: "Ci scusiamo per il disagio arrecato ai tuoi impegni. Puoi consultare tutte le tue prenotazioni e i relativi aggiornamenti nella tua dashboard esperti Sage Nest.",
    body2: (email) => `Per qualsiasi domanda, non esitare a contattarci a <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
  },
};

/**
 * Cancellation notification email sent to the expert when a parent cancels.
 *
 * @param {{
 *   expertName: string, parentName: string, serviceTitle: string,
 *   format: 'ONLINE' | 'IN_PERSON', scheduledAt: Date, cancellationReason?: string,
 *   refundPercent: 0 | 50 | 100, amount: number | string, currency?: string, bookingId: number,
 *   timezone?: string | null, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const cancellationNotificationEmailHtml = ({
  expertName,
  parentName,
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
  const expertFirstName = expertName.split(" ")[0];
  const parentFirstName = parentName.split(" ")[0];
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, timezone, lang);

  const totalAmount = Number(amount) || 0;
  const halfAmount = totalAmount * 0.5;
  const fmt = (n) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);

  const refundOutcome =
    refundPercent === 100
      ? t.refundOutcome100(parentFirstName, fmt(totalAmount))
      : refundPercent === 50
      ? t.refundOutcome50(parentFirstName, fmt(halfAmount))
      : t.refundOutcome0(fmt(totalAmount));

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
            ${t.greeting(expertFirstName, parentFirstName)}
          </p>

          <!-- Cancelled booking section -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.cancelledBooking}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:${cancellationReason ? "16px" : "24px"};">
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
            <p style="margin:0;font-size:13px;color:#065F46;line-height:1.6;">${refundOutcome}</p>
          </div>

          <!-- Body -->
          <p style="margin:0 0 12px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.body1}</p>
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.body2(supportEmail)}</p>

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

const cancellationNotificationEmailSubject = ({ language, serviceTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ serviceTitle, dateStr });
};

module.exports = { cancellationNotificationEmailHtml, cancellationNotificationEmailSubject };
