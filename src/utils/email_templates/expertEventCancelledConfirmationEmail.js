const { formatDateTime } = require("../emailDateTimeFormat");

const COPY = {
  en: {
    subject: ({ eventTitle, dateStr }) => `Event cancellation confirmed — ${eventTitle} on ${dateStr}`,
    title: "Event Cancellation Confirmed – Sage Nest",
    greeting: (expertFirstName) =>
      `Hi ${expertFirstName},<br><br>This confirms that you have cancelled the following event.`,
    cancelledEvent: "Cancelled Event",
    labels: { event: "Event", date: "Date", time: "Time", attendees: "Attendees notified" },
    consequenceHeading: "What happens next",
    consequence: "Every attendee has been notified and, where they paid, refunded in full. No payout will be made for this event, and it no longer accepts bookings.",
    reminder: "We know cancelling an event is sometimes unavoidable. Repeated cancellations may be reviewed under your Expert Agreement (clause 9.3).",
    button: "Go to your dashboard",
    closing: (email) => `If this cancellation was made in error, or you have any questions, write to us at <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "The Sage Nest Team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about an event, sent from ${email}.`,
  },
  it: {
    subject: ({ eventTitle, dateStr }) => `Cancellazione evento confermata — ${eventTitle} il ${dateStr}`,
    title: "Cancellazione Evento Confermata – Sage Nest",
    greeting: (expertFirstName) =>
      `Ciao ${expertFirstName},<br><br>ti confermiamo la cancellazione del seguente evento.`,
    cancelledEvent: "Evento Cancellato",
    labels: { event: "Evento", date: "Data", time: "Orario", attendees: "Partecipanti informati" },
    consequenceHeading: "Cosa succede ora",
    consequence: "Tutti i partecipanti sono stati informati e, se avevano pagato, rimborsati integralmente. Per questo evento non verrà corrisposto alcun compenso e non accetterà più prenotazioni.",
    reminder: "Sappiamo che a volte cancellare un evento è inevitabile. Cancellazioni ripetute possono essere esaminate ai sensi del tuo Contratto per Esperti (articolo 9.3).",
    button: "Vai alla tua dashboard",
    closing: (email) => `Se questa cancellazione è avvenuta per errore, o per qualsiasi domanda, scrivici a <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a un evento, inviata da ${email}.`,
  },
};

/**
 * Confirmation sent once to an expert after they cancel a whole event — the
 * event-level counterpart of expertCancellationConfirmationEmail (which is per
 * booking and is suppressed in a bulk cancel). Carries the calendar
 * cancellation for the expert's single event entry.
 *
 * @param {{
 *   expertName: string, eventTitle: string, scheduledAt: Date, attendeeCount: number,
 *   timezone?: string | null, language?: 'en' | 'it',
 *   clientUrl: string, contactEmail: string, supportEmail: string,
 * }} params
 */
const expertEventCancelledConfirmationEmailHtml = ({
  expertName,
  eventTitle,
  scheduledAt,
  attendeeCount,
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

  const row = (label, value, first = false) => `
              <tr>
                <td style="padding:${first ? "0 0 12px" : "12px 0"};${first ? "" : "border-top:1px solid #c5ceba;"}">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${label}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${value}</span>
                </td>
              </tr>`;

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

          <p style="margin:0 0 28px;font-size:15px;color:#445446;line-height:1.6;">${t.greeting(expertFirstName)}</p>

          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.cancelledEvent}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${row(t.labels.event, eventTitle, true)}
              ${row(t.labels.date, dateStr)}
              ${row(t.labels.time, `${timeStr} ${tzLabel}`)}
              ${row(t.labels.attendees, String(attendeeCount))}
            </table>
          </div>

          <div style="background:#FFF7ED;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400E;">${t.consequenceHeading}</p>
            <p style="margin:0;font-size:13px;color:#92400E;line-height:1.6;">${t.consequence}</p>
          </div>

          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.reminder}</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${dashboardUrl}" style="display:inline-block;background:#445446;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;">${t.button}</a>
            </td></tr>
          </table>

          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.closing(supportEmail)}</p>
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#445446;">${t.signoff}</p>

        </td></tr>

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

const expertEventCancelledConfirmationEmailSubject = ({ language, eventTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ eventTitle, dateStr });
};

module.exports = { expertEventCancelledConfirmationEmailHtml, expertEventCancelledConfirmationEmailSubject };
