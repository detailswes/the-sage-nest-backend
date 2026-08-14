const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    title: "Session Reminder – Sage Nest",
    subject: {
      parent: (timeLabel) => `Reminder: your session is ${timeLabel}`,
      expert: (otherPartyName, timeLabel) => `Reminder: upcoming session with ${otherPartyName} — ${timeLabel}`,
    },
    timeLabel: { "24h": "tomorrow", "1h": "in 1 hour" },
    badgeLabel: { "24h": "24-hour reminder", "1h": "1-hour reminder" },
    headline: {
      parent: (otherPartyName, timeLabel) => `Your session with ${otherPartyName} is ${timeLabel}`,
      expert: (otherPartyName, timeLabel) => `Upcoming session with ${otherPartyName} — ${timeLabel}`,
    },
    subtext: {
      parent: (recipientName, timeLabel) => `Hi ${recipientName}, this is a reminder that your session is coming up ${timeLabel}.`,
      expert: (recipientName, otherPartyName, timeLabel) => `Hi ${recipientName}, you have an upcoming session with <strong>${otherPartyName}</strong> ${timeLabel}.`,
    },
    labels: { service: "Service", dateTime: "Date &amp; Time", duration: "Duration", format: "Format", bookingRef: "Booking Ref" },
    formatLabel: { ONLINE: "Online Session", IN_PERSON: "In-Person Session", HOME_VISIT: "Home Visit" },
    onlineNote: {
      parent: "<strong>Online session:</strong> your expert will send you the video call details no later than 24 hours before your session — or as soon as possible, if the session starts sooner.",
      expert: (otherPartyName) => `<strong>Online session:</strong> please send <strong>${otherPartyName}</strong> the video call details no later than 24 hours before the session — or as soon as possible, if the session starts sooner.`,
    },
    homeVisitNote: {
      parent: "<strong>Home visit:</strong> your expert will travel to the address you agreed together. If anything has changed, please let them know as soon as possible.",
      expert: (otherPartyName) => `<strong>Home visit:</strong> you are travelling to <strong>${otherPartyName}</strong>'s address for this session. Please confirm the address and timing with them if you have not already.`,
    },
    ctaLabel: { parent: "View My Bookings", expert: "View My Calendar" },
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: {
      parent: (email) => `This is a transactional message about your booking, sent from ${email}.`,
      expert: (email) => `This is a transactional message about a booking, sent from ${email}.`,
    },
  },
  it: {
    title: "Promemoria Sessione – Sage Nest",
    subject: {
      parent: (timeLabel) => `Promemoria: la tua sessione è ${timeLabel}`,
      expert: (otherPartyName, timeLabel) => `Promemoria: sessione in programma con ${otherPartyName} — ${timeLabel}`,
    },
    timeLabel: { "24h": "domani", "1h": "tra 1 ora" },
    badgeLabel: { "24h": "Promemoria 24 ore", "1h": "Promemoria 1 ora" },
    headline: {
      parent: (otherPartyName, timeLabel) => `La tua sessione con ${otherPartyName} è ${timeLabel}`,
      expert: (otherPartyName, timeLabel) => `Sessione in programma con ${otherPartyName} — ${timeLabel}`,
    },
    subtext: {
      parent: (recipientName, timeLabel) => `Ciao ${recipientName}, ti ricordiamo che la tua sessione è in programma ${timeLabel}.`,
      expert: (recipientName, otherPartyName, timeLabel) => `Ciao ${recipientName}, hai una sessione in programma con <strong>${otherPartyName}</strong> ${timeLabel}.`,
    },
    labels: { service: "Servizio", dateTime: "Data e Orario", duration: "Durata", format: "Modalità", bookingRef: "Riferimento Prenotazione" },
    formatLabel: { ONLINE: "Sessione Online", IN_PERSON: "Sessione in Presenza", HOME_VISIT: "Visita a domicilio" },
    onlineNote: {
      parent: "<strong>Sessione online:</strong> il tuo Professionista ti invierà i dettagli per la videochiamata entro e non oltre 24 ore prima della sessione — oppure il prima possibile, se la sessione inizia prima.",
      expert: (otherPartyName) => `<strong>Sessione online:</strong> invia a <strong>${otherPartyName}</strong> i dettagli per la videochiamata entro e non oltre 24 ore prima della sessione — oppure il prima possibile, se la sessione inizia prima.`,
    },
    homeVisitNote: {
      parent: "<strong>Visita a domicilio:</strong> il tuo Professionista raggiungerà l'indirizzo che avete concordato. Se qualcosa è cambiato, faglielo sapere il prima possibile.",
      expert: (otherPartyName) => `<strong>Visita a domicilio:</strong> raggiungerai l'indirizzo di <strong>${otherPartyName}</strong> per questa sessione. Conferma l'indirizzo e l'orario se non l'hai già fatto.`,
    },
    ctaLabel: { parent: "Visualizza le Mie Prenotazioni", expert: "Vai al Mio Calendario" },
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: {
      parent: (email) => `Questa è una comunicazione di servizio relativa alla tua prenotazione, inviata da ${email}.`,
      expert: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
    },
  },
};

/**
 * Reminder email — used for both 24h and 1h reminders, for both parent and expert.
 *
 * @param {{
 *   recipientName: string, role: 'parent' | 'expert', otherPartyName: string,
 *   serviceTitle: string, format: 'ONLINE' | 'IN_PERSON', scheduledAt: Date,
 *   durationMinutes: number, reminderType: '24h' | '1h', bookingId: number,
 *   timezone?: string | null, language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string,
 * }} params
 */
const bookingReminderEmailHtml = ({
  recipientName,
  role,
  otherPartyName,
  serviceTitle,
  format,
  scheduledAt,
  durationMinutes,
  reminderType,
  bookingId,
  timezone,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, timezone, lang);
  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} ${lang === "it" ? "minuti" : "minutes"}`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}min` : ""}`;

  const timeLabel = t.timeLabel[reminderType];
  const accentColor = reminderType === "24h" ? "#FEF3C7" : "#DBEAFE";
  const borderColor = reminderType === "24h" ? "#FCD34D" : "#93C5FD";
  const textColor = reminderType === "24h" ? "#92400E" : "#1E40AF";
  const badgeLabel = t.badgeLabel[reminderType];

  const headline = t.headline[role](otherPartyName, timeLabel);
  const subtext = role === "parent" ? t.subtext.parent(recipientName, timeLabel) : t.subtext.expert(recipientName, otherPartyName, timeLabel);

  const dashboardUrl = role === "parent" ? `${clientUrl}/dashboard/parent/upcoming` : `${clientUrl}/dashboard/expert/appointments`;
  const ctaLabel = t.ctaLabel[role];
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

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

          <!-- Reminder badge -->
          <div style="text-align:center;margin-bottom:20px;">
            <span style="display:inline-block;background:${accentColor};border:1px solid ${borderColor};color:${textColor};font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;letter-spacing:0.3px;">
              ${badgeLabel}
            </span>
          </div>

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#445446;text-align:center;">
            ${headline}
          </h1>
          <p style="margin:0 0 28px;font-size:15px;color:#5e6d5b;line-height:1.6;text-align:center;">
            ${subtext}
          </p>

          <!-- Session details -->
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.service}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #c5ceba;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.dateTime}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${dateStr} ${timeStr} ${tzLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #c5ceba;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.duration}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${durationLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #c5ceba;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.format}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${t.formatLabel[format] || format}</span>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #c5ceba;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.bookingRef}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${formatBookingRef(bookingId)}</span>
                </td>
              </tr>
            </table>
          </div>

          ${(format === "ONLINE" || format === "HOME_VISIT") && role === "parent" ? `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.5;">${
              format === "HOME_VISIT" ? t.homeVisitNote.parent : t.onlineNote.parent
            }</p>
          </div>` : ""}

          ${(format === "ONLINE" || format === "HOME_VISIT") && role === "expert" ? `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.5;">${
              format === "HOME_VISIT" ? t.homeVisitNote.expert(otherPartyName) : t.onlineNote.expert(otherPartyName)
            }</p>
          </div>` : ""}

          <div style="text-align:center;">
            <a href="${dashboardUrl}"
               style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
              ${ctaLabel}
            </a>
          </div>

        </td></tr>

        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#5e6d5b;">${t.footerAddress}</p>
          <p style="margin:0 0 8px;font-size:12px;color:#5e6d5b;">${t.footerContact(supportEmail)}</p>
          <p style="margin:0;font-size:11px;color:#9aa596;">${t.transactional[role](contactEmail)}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const bookingReminderEmailSubject = ({ language, role, otherPartyName, reminderType }) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const timeLabel = t.timeLabel[reminderType];
  return role === "parent" ? t.subject.parent(timeLabel) : t.subject.expert(otherPartyName, timeLabel);
};

module.exports = { bookingReminderEmailHtml, bookingReminderEmailSubject };
