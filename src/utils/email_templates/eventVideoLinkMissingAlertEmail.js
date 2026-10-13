const { formatDateTime } = require("../emailDateTimeFormat");

const COPY = {
  en: {
    subject: ({ eventTitle, dateStr }) => `Action needed: add your video link — ${eventTitle} on ${dateStr}`,
    title: "Video Link Needed – Sage Nest",
    greeting: (expertFirstName, eventTitle) =>
      `Hi ${expertFirstName},<br><br>Your online event <strong>${eventTitle}</strong> is coming up, and you haven't added a video call link yet.`,
    labels: { event: "Event", date: "Date", time: "Time" },
    body: "We send the video link to participants in their reminder email 24 hours before the event — please add it in your dashboard as soon as possible so it reaches them in time.",
    button: "Add video link",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your event, sent from ${email}.`,
  },
  it: {
    subject: ({ eventTitle, dateStr }) => `Azione richiesta: aggiungi il link della videochiamata — ${eventTitle} il ${dateStr}`,
    title: "Link della Videochiamata Mancante – Sage Nest",
    greeting: (expertFirstName, eventTitle) =>
      `Ciao ${expertFirstName},<br><br>il tuo evento online <strong>${eventTitle}</strong> è in programma a breve e non hai ancora inserito il link della videochiamata.`,
    labels: { event: "Evento", date: "Data", time: "Orario" },
    body: "Inviamo il link della videochiamata ai partecipanti nell'email di promemoria 24 ore prima dell'evento — ti chiediamo di aggiungerlo nella tua dashboard il prima possibile, così da farlo arrivare in tempo.",
    button: "Aggiungi link videochiamata",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa al tuo evento, inviata da ${email}.`,
  },
};

/**
 * Sent to the expert once, when an online event is within 36 hours of its
 * start and still has no video link set. video_link_alert_sent guards this
 * from firing again every job cycle — it resets whenever the link changes
 * (service.controller.js) or a draft containing it is approved
 * (admin.controller.js).
 *
 * @param {{
 *   expertName: string, eventTitle: string, scheduledAt: Date,
 *   timezone?: string | null, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const eventVideoLinkMissingAlertEmailHtml = ({
  expertName,
  eventTitle,
  scheduledAt,
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

          <p style="margin:0 0 20px;font-size:15px;color:#445446;line-height:1.6;">
            ${t.greeting(expertFirstName, eventTitle)}
          </p>

          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.event}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${eventTitle}</span>
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

          <div style="background:#FFF7ED;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">${t.body}</p>
          </div>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
            <tr><td align="center">
              <a href="${dashboardUrl}" style="display:inline-block;background:#445446;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;">${t.button}</a>
            </td></tr>
          </table>

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

const eventVideoLinkMissingAlertEmailSubject = ({ language, eventTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ eventTitle, dateStr });
};

module.exports = { eventVideoLinkMissingAlertEmailHtml, eventVideoLinkMissingAlertEmailSubject };
