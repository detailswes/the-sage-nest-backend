const { formatDateTime, formatTimeOnly } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: ({ eventTitle, dateStr }) => `Cancellation for your event: ${eventTitle} on ${dateStr}`,
    title: "Event Cancellation – Sage Nest",
    greeting: (expertFirstName, parentFullName, eventTitle) =>
      `Hi ${expertFirstName},<br><br>${parentFullName} has cancelled their place at your event <strong>${eventTitle}</strong>.`,
    eventDetails: "Event Details",
    labels: { bookingRef: "Booking Ref", date: "Date", time: "Time", released: "Spots released", remaining: "Spots now available" },
    spotsRemaining: (remaining, total) => `${remaining} of ${total}`,
    refundHeading: "Payout outcome",
    refundFull: "The parent has received a full refund, so there is no payout for this booking.",
    refundNone: "The cancellation came less than 7 days before the event, so the parent is not refunded. Your payout for this booking follows the terms of your Expert Agreement.",
    freeBody: "This was a complimentary booking, so no payment is involved.",
    reopenedHeading: "Event reopened",
    reopenedBody: "Your event had been full: it is now open again for new bookings.",
    button: "View in your dashboard",
    signoff: "Thank you,<br>The Sage Nest team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about a booking, sent from ${email}.`,
  },
  it: {
    subject: ({ eventTitle, dateStr }) => `Cancellazione per il tuo evento: ${eventTitle} il ${dateStr}`,
    title: "Cancellazione Evento – Sage Nest",
    greeting: (expertFirstName, parentFullName, eventTitle) =>
      `Ciao ${expertFirstName},<br><br>${parentFullName} ha cancellato la sua prenotazione per il tuo evento <strong>${eventTitle}</strong>.`,
    eventDetails: "Dettagli dell'Evento",
    labels: { bookingRef: "Riferimento Prenotazione", date: "Data", time: "Orario", released: "Posti liberati", remaining: "Posti ora disponibili" },
    spotsRemaining: (remaining, total) => `${remaining} su ${total}`,
    refundHeading: "Esito per il tuo compenso",
    refundFull: "Il genitore ha ricevuto il rimborso completo, quindi per questa prenotazione non è previsto alcun pagamento a tuo favore.",
    refundNone: "La cancellazione è arrivata a meno di 7 giorni dall'evento, quindi il genitore non viene rimborsato. Il pagamento a tuo favore per questa prenotazione segue le condizioni del tuo Expert Agreement.",
    freeBody: "Si trattava di una prenotazione gratuita, quindi non è coinvolto alcun pagamento.",
    reopenedHeading: "Evento riaperto",
    reopenedBody: "Il tuo evento era al completo: ora è di nuovo aperto a nuove prenotazioni.",
    button: "Visualizza nella tua dashboard",
    signoff: "Grazie,<br>Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
  },
};

/**
 * Expert notification email — sent when a parent cancels their place at the
 * expert's event. Dedicated event template (Sage Nest Event Module Feedback,
 * annex E/F) — replaces cancellationNotificationEmail for events only.
 *
 * @param {{
 *   expertName: string, parentName: string, eventTitle: string,
 *   scheduledAt: Date, durationMinutes: number,
 *   spotsRemaining: number, totalSpots: number, eventWasFull?: boolean,
 *   isFree: boolean, refundPercent: 0 | 100,
 *   bookingId: number, timezone?: string | null, language?: 'en' | 'it',
 *   clientUrl: string, contactEmail: string, supportEmail: string,
 * }} params
 */
const eventParentCancelledNotificationEmailHtml = ({
  expertName,
  parentName,
  eventTitle,
  scheduledAt,
  durationMinutes,
  spotsRemaining,
  totalSpots,
  eventWasFull,
  isFree,
  refundPercent,
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
  const dashboardUrl = `${clientUrl}/dashboard/expert/services`;

  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, timezone, lang);
  const endTimeStr = formatTimeOnly(new Date(scheduledAt).getTime() + durationMinutes * 60 * 1000, timezone, lang);

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
            ${t.greeting(expertFirstName, parentName, eventTitle)}
          </p>

          <!-- Event details card -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.eventDetails}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.bookingRef}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${formatBookingRef(bookingId)}</span>
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
                  <span style="font-size:15px;font-weight:600;color:#445446;">${timeStr}&ndash;${endTimeStr} ${tzLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.released}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">1</span>
                </td>
              </tr>
              <tr>
                <td style="padding-top:12px;border-top:1px solid #c5ceba;padding-bottom:0;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.remaining}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${t.spotsRemaining(spotsRemaining, totalSpots)}</span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Payout outcome -->
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#065F46;">${t.refundHeading}</p>
            <p style="margin:0;font-size:13px;color:#065F46;line-height:1.6;">${isFree ? t.freeBody : refundPercent === 100 ? t.refundFull : t.refundNone}</p>
          </div>

          ${eventWasFull ? `
          <!-- Event reopened -->
          <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#5B21B6;">${t.reopenedHeading}</p>
            <p style="margin:0;font-size:13px;color:#5B21B6;line-height:1.5;">${t.reopenedBody}</p>
          </div>` : ""}

          <!-- Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${dashboardUrl}" style="display:inline-block;background:#445446;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;">${t.button}</a>
            </td></tr>
          </table>

          <!-- Sign-off -->
          <p style="margin:0;font-size:14px;font-weight:600;color:#445446;">${t.signoff}</p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#5e6d5b;">${t.footerAddress}</p>
          <p style="margin:0 0 8px;font-size:12px;color:#5e6d5b;">${t.footerContact(supportEmail || contactEmail)}</p>
          <p style="margin:0;font-size:11px;color:#9aa596;">${t.transactional(contactEmail)}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const eventParentCancelledNotificationEmailSubject = ({ language, eventTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ eventTitle, dateStr });
};

module.exports = { eventParentCancelledNotificationEmailHtml, eventParentCancelledNotificationEmailSubject };
