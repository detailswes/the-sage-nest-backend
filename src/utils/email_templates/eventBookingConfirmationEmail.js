const { formatDateTime, formatTimeOnly } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");
const { formatEventVenue } = require("../eventVenue");

const COPY = {
  en: {
    subject: ({ eventTitle, dateStr }) => `Your place is confirmed: ${eventTitle} on ${dateStr}`,
    title: "Event Booking Confirmed – Sage Nest",
    greeting: (parentFirstName, eventTitle, expertName) =>
      `Hi ${parentFirstName},<br><br>Your place at <strong>${eventTitle}</strong> with ${expertName} is confirmed.`,
    eventDetails: "Event Details",
    labels: { date: "Date", time: "Time", format: "Format", spots: "Spots booked", location: "Location", bookingRef: "Booking Ref" },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In-person" },
    onlineHeading: "How to join",
    onlineBody: (supportEmail) =>
      `You will receive the video link in a reminder email 24 hours before the event. If you have not received it by then, please contact us at <a href="mailto:${supportEmail}" style="color:#445446;">${supportEmail}</a>. The link is personal: please do not share it.`,
    paymentHeading: "Amount paid",
    withdrawalNote: "You asked for the event to take place within the 14-day withdrawal period, and you acknowledged that you lose your right of withdrawal once the event has taken place.",
    freeHeading: "Price",
    freeBody: "This is a complimentary event, so no payment was taken.",
    aboutHeading: "About the event",
    cancelHeading: "Can't make it?",
    cancelBody: "Please cancel from your account as soon as possible, so your place can go to another parent.",
    cancelPaidBody: "If you cancel at least 7 days before the event, you will receive a full refund. After that, no refund is possible.",
    eventTermsLine: (url) =>
      `Full details are in the <a href="${url}" style="color:#445446;text-decoration:underline;font-weight:600;">Event Terms</a> you accepted at booking.`,
    button: "View booking in your dashboard",
    signoff: "See you there,<br>The Sage Nest team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your booking, sent from ${email}.`,
  },
  it: {
    subject: ({ eventTitle, dateStr }) => `Il tuo posto è confermato: ${eventTitle} il ${dateStr}`,
    title: "Prenotazione Evento Confermata – Sage Nest",
    greeting: (parentFirstName, eventTitle, expertName) =>
      `Ciao ${parentFirstName},<br><br>il tuo posto per <strong>${eventTitle}</strong> con ${expertName} è confermato.`,
    eventDetails: "Dettagli dell'Evento",
    labels: { date: "Data", time: "Orario", format: "Formato", spots: "Posti prenotati", location: "Luogo", bookingRef: "Riferimento Prenotazione" },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In presenza" },
    onlineHeading: "Come partecipare",
    onlineBody: (supportEmail) =>
      `Riceverai il link della videochiamata in un'email di promemoria 24 ore prima dell'evento. Se non l'hai ricevuto entro quel momento, scrivici a <a href="mailto:${supportEmail}" style="color:#445446;">${supportEmail}</a>. Il link è personale: ti chiediamo di non condividerlo.`,
    paymentHeading: "Importo pagato",
    withdrawalNote: "Hai chiesto che l'evento si svolga durante il periodo di recesso di 14 giorni e hai preso atto che perdi il diritto di recesso una volta che l'evento si è svolto.",
    freeHeading: "Prezzo",
    freeBody: "Questo è un evento gratuito, quindi non è stato addebitato alcun importo.",
    aboutHeading: "L'evento",
    cancelHeading: "Non puoi più partecipare?",
    cancelBody: "Cancella la prenotazione dal tuo account il prima possibile, così il tuo posto può andare a un altro genitore.",
    cancelPaidBody: "Se cancelli almeno 7 giorni prima dell'evento, riceverai il rimborso completo. Dopo questo termine non è previsto alcun rimborso.",
    eventTermsLine: (url) =>
      `Tutti i dettagli sono nei <a href="${url}" style="color:#445446;text-decoration:underline;font-weight:600;">Termini per gli eventi</a> che hai accettato al momento della prenotazione.`,
    button: "Visualizza la prenotazione nella tua dashboard",
    signoff: "A presto,<br>Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa alla tua prenotazione, inviata da ${email}.`,
  },
};

function formatPrice(amount, currency, language) {
  if (amount == null) return null;
  const locale = language === "it" ? "it-IT" : "en-GB";
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "EUR" }).format(Number(amount));
}

/**
 * Event booking confirmation email — sent to the parent after their place at
 * an event is confirmed (paid or free). Dedicated event template (Sage Nest
 * Event Module Feedback, annex A/B) — never shared with 1:1 session bookings.
 *
 * @param {{
 *   parentName: string, expertName: string, eventTitle: string, eventDescription?: string,
 *   format: 'ONLINE' | 'IN_PERSON', scheduledAt: Date, durationMinutes: number,
 *   eventVenueName?: string, eventAddress?: string, eventPostcode?: string, eventCity?: string,
 *   amount?: number | string | null, currency?: string, withdrawalApplicable?: boolean,
 *   bookingId: number, recipientTimezone?: string | null, language?: 'en' | 'it',
 *   clientUrl: string, contactEmail: string, supportEmail: string, eventTermsUrl: string,
 * }} params
 */
const eventBookingConfirmationEmailHtml = ({
  parentName,
  expertName,
  eventTitle,
  eventDescription,
  format,
  scheduledAt,
  durationMinutes,
  eventVenueName,
  eventAddress,
  eventPostcode,
  eventCity,
  amount,
  currency,
  withdrawalApplicable,
  bookingId,
  recipientTimezone,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
  eventTermsUrl,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const parentFirstName = parentName?.split(" ")[0] || "there";
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, recipientTimezone, lang);
  const endTimeStr = formatTimeOnly(new Date(scheduledAt).getTime() + durationMinutes * 60 * 1000, recipientTimezone, lang);
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
            ${t.greeting(parentFirstName, eventTitle, expertName)}
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
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;${format === "IN_PERSON" && location ? "" : "padding-bottom:0;"}">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.spots}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">1</span>
                </td>
              </tr>
              ${format === "IN_PERSON" && location ? `
              <tr>
                <td style="padding-top:12px;border-top:1px solid #c5ceba;padding-bottom:0;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.location}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${location}</span>
                </td>
              </tr>` : ""}
            </table>
          </div>

          ${format === "ONLINE" ? `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1E40AF;">${t.onlineHeading}</p>
            <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.5;">${t.onlineBody(supportEmail)}</p>
          </div>` : ""}

          <!-- Payment -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${isFree ? t.freeHeading : t.paymentHeading}</p>
          ${isFree ? `
          <p style="margin:0 0 24px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.freeBody}</p>` : `
          <p style="margin:0 0 ${withdrawalApplicable ? "12px" : "24px"};font-size:14px;color:#5e6d5b;line-height:1.6;"><strong>${priceStr}</strong></p>
          ${withdrawalApplicable ? `<p style="margin:0 0 24px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.withdrawalNote}</p>` : ""}`}

          <!-- About the event -->
          ${eventDescription ? `
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.aboutHeading}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#5e6d5b;line-height:1.6;">${eventDescription}</p>` : ""}

          <!-- Can't make it? -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.cancelHeading}</p>
          <p style="margin:0 0 ${isFree ? "28px" : "8px"};font-size:14px;color:#5e6d5b;line-height:1.6;">${t.cancelBody}</p>
          ${!isFree ? `
          <p style="margin:0 0 8px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.cancelPaidBody}</p>
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.eventTermsLine(eventTermsUrl)}</p>` : ""}

          <!-- Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${clientUrl}/dashboard" style="display:inline-block;background:#445446;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;">${t.button}</a>
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

const eventBookingConfirmationEmailSubject = ({ language, eventTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ eventTitle, dateStr });
};

module.exports = { eventBookingConfirmationEmailHtml, eventBookingConfirmationEmailSubject };
