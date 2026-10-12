const { formatDateTime } = require("../emailDateTimeFormat");

const COPY = {
  en: {
    subject: ({ serviceTitle, dateStr }) =>
      `Your event is fully booked — ${serviceTitle} on ${dateStr}`,
    title: "Event Fully Booked – Sage Nest",
    greeting: (expertFirstName, serviceTitle) =>
      `Hi ${expertFirstName},<br><br>Good news — <strong>${serviceTitle}</strong> has reached its number of spots. It's no longer listed as bookable, so no further sign-ups will come in.`,
    labels: { service: "Event", date: "Date", time: "Time" },
    body: "You can see the full attendee list any time from your dashboard. If a spot frees up later — for example if someone cancels — the event will automatically become bookable again.",
    button: "View event in your dashboard",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your event, sent from ${email}.`,
  },
  it: {
    subject: ({ serviceTitle, dateStr }) =>
      `Il tuo evento è al completo — ${serviceTitle} il ${dateStr}`,
    title: "Evento al Completo – Sage Nest",
    greeting: (expertFirstName, serviceTitle) =>
      `Ciao ${expertFirstName},<br><br>buone notizie — <strong>${serviceTitle}</strong> ha raggiunto il numero massimo di posti. Non è più elencato come prenotabile, quindi non arriveranno altre iscrizioni.`,
    labels: { service: "Evento", date: "Data", time: "Orario" },
    body: "Puoi consultare l'elenco completo dei partecipanti in qualsiasi momento dalla tua dashboard. Se un posto si libera in seguito — ad esempio per una cancellazione — l'evento diventerà automaticamente di nuovo prenotabile.",
    button: "Visualizza l'evento nella tua dashboard",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo evento, inviata da ${email}.`,
  },
};

/**
 * Sent to the expert the moment an event's last spot is booked and it
 * auto-deactivates. Purely informational — no action required.
 *
 * @param {{
 *   expertName: string, serviceTitle: string, scheduledAt: Date,
 *   timezone?: string | null, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const eventFullyBookedEmailHtml = ({
  expertName,
  serviceTitle,
  scheduledAt,
  timezone,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const expertFirstName = expertName?.split(" ")[0] || "";
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;
  const dashboardUrl = `${clientUrl}/dashboard/expert/services`;

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
            ${t.greeting(expertFirstName, serviceTitle)}
          </p>

          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
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
                <td style="padding-top:12px;border-top:1px solid #c5ceba;padding-bottom:0;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.time}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${timeStr} ${tzLabel}</span>
                </td>
              </tr>
            </table>
          </div>

          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            ${t.body}
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
            <tr><td align="center">
              <a href="${dashboardUrl}" style="display:inline-block;background:#445446;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;">${t.button}</a>
            </td></tr>
          </table>

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

const eventFullyBookedEmailSubject = ({ language, serviceTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ serviceTitle, dateStr });
};

module.exports = { eventFullyBookedEmailHtml, eventFullyBookedEmailSubject };
