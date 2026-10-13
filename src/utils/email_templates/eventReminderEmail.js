const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");
const { formatEventVenue } = require("../eventVenue");

const COPY = {
  en: {
    subject: ({ eventTitle, dateStr }) => `Reminder: ${eventTitle} is coming up — ${dateStr}`,
    title: "Event Reminder – Sage Nest",
    greeting: (parentFirstName, eventTitle, expertName) =>
      `Hi ${parentFirstName},<br><br>Just a reminder that <strong>${eventTitle}</strong> with ${expertName} is coming up.`,
    eventDetails: "Event Details",
    labels: { bookingRef: "Booking Ref", date: "Date", time: "Time", location: "Location" },
    joinHeading: "How to join",
    joinBody: "Here is your video link for the event — please don't share it.",
    joinButton: "Join the event",
    linkPendingHeading: "Video link",
    linkPendingBody: (supportEmail) =>
      `Your expert hasn't added the video link yet. We'll email it to you as soon as it's added — if you don't receive it in time, please contact us at <a href="mailto:${supportEmail}" style="color:#445446;">${supportEmail}</a>.`,
    button: "View booking in your dashboard",
    signoff: "See you there,<br>The Sage Nest team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your booking, sent from ${email}.`,
  },
  it: {
    subject: ({ eventTitle, dateStr }) => `Promemoria: ${eventTitle} è in programma — ${dateStr}`,
    title: "Promemoria Evento – Sage Nest",
    greeting: (parentFirstName, eventTitle, expertName) =>
      `Ciao ${parentFirstName},<br><br>ti ricordiamo che <strong>${eventTitle}</strong> con ${expertName} è in programma a breve.`,
    eventDetails: "Dettagli dell'Evento",
    labels: { bookingRef: "Riferimento Prenotazione", date: "Data", time: "Orario", location: "Luogo" },
    joinHeading: "Come partecipare",
    joinBody: "Ecco il link della videochiamata per l'evento — ti chiediamo di non condividerlo.",
    joinButton: "Partecipa all'evento",
    linkPendingHeading: "Link della videochiamata",
    linkPendingBody: (supportEmail) =>
      `Il tuo Professionista non ha ancora inserito il link della videochiamata. Te lo invieremo via email non appena sarà disponibile — se non lo ricevi in tempo, scrivici a <a href="mailto:${supportEmail}" style="color:#445446;">${supportEmail}</a>.`,
    button: "Visualizza la prenotazione nella tua dashboard",
    signoff: "A presto,<br>Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa alla tua prenotazione, inviata da ${email}.`,
  },
};

/**
 * Event reminder email — sent to the parent once, 24 hours before the event
 * (or immediately after booking, if they booked less than 24 hours out).
 * Carries the video call link for online events (never included in the
 * booking confirmation — see eventBookingConfirmationEmail), or the venue
 * for in-person events. Dedicated event template — never shared with the
 * generic 1:1 session reminder (bookingReminderEmail).
 *
 * @param {{
 *   parentName: string, expertName: string, eventTitle: string,
 *   format: 'ONLINE' | 'IN_PERSON', scheduledAt: Date,
 *   eventVenueName?: string, eventAddress?: string, eventPostcode?: string, eventCity?: string,
 *   videoLink?: string | null,
 *   bookingId: number, recipientTimezone?: string | null, language?: 'en' | 'it',
 *   clientUrl: string, contactEmail: string, supportEmail: string,
 * }} params
 */
const eventReminderEmailHtml = ({
  parentName,
  expertName,
  eventTitle,
  format,
  scheduledAt,
  eventVenueName,
  eventAddress,
  eventPostcode,
  eventCity,
  videoLink,
  bookingId,
  recipientTimezone,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const parentFirstName = parentName?.split(" ")[0] || "there";
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, recipientTimezone, lang);
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
                <td style="padding:12px 0;border-top:1px solid #c5ceba;${format === "IN_PERSON" && location ? "" : "padding-bottom:0;"}">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.time}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${timeStr} ${tzLabel}</span>
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

          ${format === "ONLINE" ? (videoLink ? `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1E40AF;">${t.joinHeading}</p>
            <p style="margin:0 0 12px;font-size:13px;color:#1E40AF;line-height:1.5;">${t.joinBody}</p>
            <a href="${videoLink}" style="display:inline-block;background:#445446;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:8px;">${t.joinButton}</a>
          </div>` : `
          <div style="background:#FFF7ED;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400E;">${t.linkPendingHeading}</p>
            <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">${t.linkPendingBody(supportEmail)}</p>
          </div>`) : ""}

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

const eventReminderEmailSubject = ({ language, eventTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ eventTitle, dateStr });
};

module.exports = { eventReminderEmailHtml, eventReminderEmailSubject };
