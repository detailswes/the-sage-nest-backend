const { formatDateTime, formatTimeOnly } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");
const { formatEventVenue } = require("../eventVenue");

const COPY = {
  en: {
    subject: ({ eventTitle, dateStr }) => `New booking for your event: ${eventTitle} on ${dateStr}`,
    title: "New Event Booking – Sage Nest",
    greeting: (expertFirstName, parentFullName, eventTitle) =>
      `Hi ${expertFirstName},<br><br>${parentFullName} has booked a place at your event <strong>${eventTitle}</strong>.`,
    eventDetails: "Event Details",
    labels: { bookingRef: "Booking Ref", date: "Date", time: "Time", format: "Format", spots: "Spots booked by this parent", remaining: "Spots remaining", location: "Location shown to parents" },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In-person" },
    spotsRemaining: (remaining, total) => `${remaining} of ${total}`,
    paymentHeading: "Amount paid by the parent",
    payment: (amountStr) => `${amountStr}. Your payout follows the terms of your Expert Agreement.`,
    freeHeading: "Price",
    freeBody: "This is a complimentary event, so no payment was taken.",
    fullHeading: "Event now full",
    fullBody: "Your event is now full and has been closed to new bookings.",
    linkAddedHeading: "Video link saved",
    linkAddedBody: "Your video link is saved. We will send it to participants in the reminder email 24 hours before the event.",
    linkMissingHeading: "Video link needed",
    linkMissingBody: "You have not added the video link yet. Please add it in your dashboard at least 36 hours before the event, so it reaches participants in the reminder email.",
    button: "View in your dashboard",
    signoff: "Thank you,<br>The Sage Nest team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about a booking, sent from ${email}.`,
  },
  it: {
    subject: ({ eventTitle, dateStr }) => `Nuova prenotazione per il tuo evento: ${eventTitle} il ${dateStr}`,
    title: "Nuova Prenotazione Evento – Sage Nest",
    greeting: (expertFirstName, parentFullName, eventTitle) =>
      `Ciao ${expertFirstName},<br><br>${parentFullName} ha prenotato un posto per il tuo evento <strong>${eventTitle}</strong>.`,
    eventDetails: "Dettagli dell'Evento",
    labels: { bookingRef: "Riferimento Prenotazione", date: "Data", time: "Orario", format: "Formato", spots: "Posti prenotati da questo genitore", remaining: "Posti ancora disponibili", location: "Luogo indicato ai genitori" },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In presenza" },
    spotsRemaining: (remaining, total) => `${remaining} su ${total}`,
    paymentHeading: "Importo pagato dal genitore",
    payment: (amountStr) => `${amountStr}. Il pagamento a tuo favore segue le condizioni del tuo Expert Agreement.`,
    freeHeading: "Prezzo",
    freeBody: "Questo è un evento gratuito, quindi non è stato addebitato alcun importo.",
    fullHeading: "Evento al completo",
    fullBody: "Il tuo evento è ora al completo ed è stato chiuso a nuove prenotazioni.",
    linkAddedHeading: "Link della videochiamata salvato",
    linkAddedBody: "Il link della videochiamata è salvato. Lo invieremo ai partecipanti nell'email di promemoria 24 ore prima dell'evento.",
    linkMissingHeading: "Link della videochiamata mancante",
    linkMissingBody: "Non hai ancora inserito il link della videochiamata. Inseriscilo nella tua dashboard almeno 36 ore prima dell'evento, così arriverà ai partecipanti nell'email di promemoria.",
    button: "Visualizza nella tua dashboard",
    signoff: "Grazie,<br>Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
  },
};

function formatPrice(amount, currency, language) {
  if (amount == null) return null;
  const locale = language === "it" ? "it-IT" : "en-GB";
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "EUR" }).format(Number(amount));
}

/**
 * New-booking notification email — sent to the expert when a parent books a
 * place at their event (paid or free). Dedicated event template (Sage Nest
 * Event Module Feedback, annex C/D) — never shared with 1:1 session bookings.
 * Folds in the "event now full" notice as a conditional block rather than a
 * separate email, per the client's spec.
 *
 * @param {{
 *   expertName: string, parentName: string, eventTitle: string,
 *   format: 'ONLINE' | 'IN_PERSON', scheduledAt: Date, durationMinutes: number,
 *   eventVenueName?: string, eventAddress?: string, eventPostcode?: string, eventCity?: string,
 *   spotsRemaining: number, totalSpots: number, eventNowFull?: boolean,
 *   videoLink?: string | null,
 *   amount?: number | string | null, currency?: string,
 *   bookingId: number, timezone?: string | null, language?: 'en' | 'it',
 *   clientUrl: string, contactEmail: string, supportEmail: string,
 * }} params
 */
const eventNewBookingNotificationEmailHtml = ({
  expertName,
  parentName,
  eventTitle,
  format,
  scheduledAt,
  durationMinutes,
  eventVenueName,
  eventAddress,
  eventPostcode,
  eventCity,
  spotsRemaining,
  totalSpots,
  eventNowFull,
  videoLink,
  amount,
  currency,
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
  const isFree = Number(amount) === 0;
  const priceStr = isFree ? null : formatPrice(amount, currency, lang);
  const location = formatEventVenue({ event_venue_name: eventVenueName, event_address: eventAddress, event_postcode: eventPostcode, event_city: eventCity });

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
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.format}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${t.formatLabel[format] || format}</span>
                </td>
              </tr>
              ${format === "IN_PERSON" && location ? `
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.location}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${location}</span>
                </td>
              </tr>` : ""}
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.spots}</span><br>
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

          <!-- Payment -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${isFree ? t.freeHeading : t.paymentHeading}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#5e6d5b;line-height:1.6;">${isFree ? t.freeBody : t.payment(priceStr)}</p>

          ${format === "ONLINE" ? `
          <div style="background:${videoLink ? "#ECFDF5" : "#FFF7ED"};border:1px solid ${videoLink ? "#6EE7B7" : "#FCD34D"};border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${videoLink ? "#065F46" : "#92400E"};">${videoLink ? t.linkAddedHeading : t.linkMissingHeading}</p>
            <p style="margin:0;font-size:13px;color:${videoLink ? "#065F46" : "#92400E"};line-height:1.5;">${videoLink ? t.linkAddedBody : t.linkMissingBody}</p>
          </div>` : ""}

          ${eventNowFull ? `
          <!-- Event now full -->
          <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#5B21B6;">${t.fullHeading}</p>
            <p style="margin:0;font-size:13px;color:#5B21B6;line-height:1.5;">${t.fullBody}</p>
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

const eventNewBookingNotificationEmailSubject = ({ language, eventTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ eventTitle, dateStr });
};

module.exports = { eventNewBookingNotificationEmailHtml, eventNewBookingNotificationEmailSubject };
