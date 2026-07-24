const { formatDateTime } = require("../emailDateTimeFormat");

const COPY = {
  en: {
    subject: (parentName, delayMinutes) => `[Sage Nest] ${parentName} is running ~${delayMinutes} min late`,
    title: "Running Late – Sage Nest",
    badge: "Running Late Notice",
    greeting: (expertFirst) => `Hi <strong>${expertFirst}</strong>,`,
    body: (parentName, delayMinutes) =>
      `Your client <strong>${parentName}</strong> is running approximately <strong>${delayMinutes} minute${delayMinutes > 1 ? "s" : ""} late</strong> for today's session.`,
    labels: { service: "Service", sessionTime: "Session time", delay: "Expected delay" },
    noteFrom: (parentFirst) => `Message from ${parentFirst}:`,
    closing: "Please hold tight — your client is on their way. You do not need to take any action.",
    questions: (email) => `Questions? Reply to this email or contact us at <a href="mailto:${email}" style="color:#445446;text-decoration:none;">${email}</a>.`,
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about a booking, sent from ${email}.`,
  },
  it: {
    subject: (parentName, delayMinutes) => `[Sage Nest] ${parentName} è in ritardo di ~${delayMinutes} min`,
    title: "In Ritardo – Sage Nest",
    badge: "Avviso di Ritardo",
    greeting: (expertFirst) => `Ciao <strong>${expertFirst}</strong>,`,
    body: (parentName, delayMinutes) =>
      `<strong>${parentName}</strong> è in ritardo di circa <strong>${delayMinutes} minut${delayMinutes > 1 ? "i" : "o"}</strong> per la sessione di oggi.`,
    labels: { service: "Servizio", sessionTime: "Orario della sessione", delay: "Ritardo previsto" },
    noteFrom: (parentFirst) => `Messaggio da ${parentFirst}:`,
    closing: "Attendi con calma — il tuo cliente sta arrivando. Non è richiesta alcuna azione da parte tua.",
    questions: (email) => `Domande? Rispondi a questa email o contattaci a <a href="mailto:${email}" style="color:#445446;text-decoration:none;">${email}</a>.`,
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
  },
};

/**
 * @param {{
 *   expertName: string, parentName: string, serviceTitle: string,
 *   scheduledAt: Date, timezone: string, delayMinutes: number,
 *   note: string | null, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const imLateEmailHtml = ({
  expertName,
  parentName,
  serviceTitle,
  scheduledAt,
  timezone,
  delayMinutes,
  note,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, timezone, lang);
  const datetimeStr = `${dateStr} ${timeStr} ${tzLabel}`;
  const expertFirst = expertName.split(" ")[0];
  const parentFirst = parentName.split(" ")[0];
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;
  const noteRow = note
    ? `<tr><td colspan="2" style="padding:8px 0;"><div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 14px;font-size:13px;color:#92400E;line-height:1.5;"><strong>${t.noteFrom(parentFirst)}</strong><br>${note}</div></td></tr>`
    : "";

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
        <tr><td style="padding-bottom:24px;text-align:center;">
          <img src="${logoUrl}" alt="Sage Nest" height="36" style="height:36px;display:inline-block;" />
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #E4E7E4;overflow:hidden;">

          <!-- Alert header -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#FEF3C7;border-bottom:1px solid #FCD34D;padding:16px 28px;text-align:center;">
              <p style="margin:0;font-size:28px;">⏱️</p>
              <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#92400E;">${t.badge}</p>
            </td></tr>
          </table>

          <!-- Body -->
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px;">
            <tr><td>
              <p style="margin:0 0 16px;font-size:15px;color:#1F2933;line-height:1.6;">
                ${t.greeting(expertFirst)}
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:#4B5563;line-height:1.6;">
                ${t.body(parentName, delayMinutes)}
              </p>

              <!-- Session details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F5;border-radius:10px;border:1px solid #E4E7E4;padding:16px;margin-bottom:20px;">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#6B7280;width:110px;">${t.labels.service}</td>
                  <td style="padding:6px 0;font-size:13px;color:#1F2933;font-weight:600;">${serviceTitle}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#6B7280;">${t.labels.sessionTime}</td>
                  <td style="padding:6px 0;font-size:13px;color:#1F2933;font-weight:600;">${datetimeStr}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#6B7280;">${t.labels.delay}</td>
                  <td style="padding:6px 0;font-size:13px;color:#D97706;font-weight:700;">~${delayMinutes} min</td>
                </tr>
                ${noteRow}
              </table>

              <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">
                ${t.closing}
              </p>

              <p style="margin:0;font-size:14px;color:#6B7280;">
                ${t.questions(supportEmail)}
              </p>
            </td></tr>
          </table>

          <!-- Footer -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E4E7E4;padding:16px 28px;">
            <tr><td style="text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#5e6d5b;">${t.footerAddress}</p>
              <p style="margin:0 0 8px;font-size:12px;color:#5e6d5b;">${t.footerContact(supportEmail)}</p>
              <p style="margin:0;font-size:11px;color:#9aa596;">${t.transactional(contactEmail)}</p>
            </td></tr>
          </table>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const imLateEmailSubject = ({ language, parentName, delayMinutes }) => {
  const lang = language === "it" ? "it" : "en";
  return COPY[lang].subject(parentName, delayMinutes);
};

module.exports = { imLateEmailHtml, imLateEmailSubject };
