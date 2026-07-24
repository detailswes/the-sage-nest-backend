const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: (parentName) => `Booking rescheduled — ${parentName}`,
    title: "Booking Rescheduled – Sage Nest",
    heading: "Booking Rescheduled",
    intro: (expertFirstName, parentName) =>
      `Hi ${expertFirstName}, <strong>${parentName}</strong> has rescheduled their session with you. Your calendar has been updated automatically — no action is needed on your part.`,
    timeChangeLabel: "Time Change",
    previousLabel: "Previous date &amp; time",
    newLabel: "New date &amp; time",
    clientLabel: "Client",
    clientEmailLabel: "Client Email",
    serviceLabel: "Service",
    newDateTimeLabel: "New Date &amp; Time",
    durationLabel: "Duration",
    formatLabel: "Format",
    bookingRefLabel: "Booking Ref",
    formatValue: { ONLINE: "Online Session", IN_PERSON: "In-Person Session" },
    onlineReminder: (parentFirstName) =>
      `<strong>Online session:</strong> Please send ${parentFirstName} the updated video call details no later than 24 hours before the new session time — or as soon as possible, if it starts sooner.`,
    paymentNoteLabel: "Payment:",
    paymentNote: "The original payment is carried over to the new session. No new charge has been made and no refund has been issued.",
    button: "View My Calendar",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about a booking, sent from ${email}.`,
  },
  it: {
    subject: (parentName) => `Prenotazione riprogrammata — ${parentName}`,
    title: "Prenotazione Riprogrammata – Sage Nest",
    heading: "Prenotazione Riprogrammata",
    intro: (expertFirstName, parentName) =>
      `Ciao ${expertFirstName}, <strong>${parentName}</strong> ha riprogrammato la sua sessione con te. Il tuo calendario è stato aggiornato automaticamente — non è richiesta alcuna azione da parte tua.`,
    timeChangeLabel: "Cambio Orario",
    previousLabel: "Data e orario precedenti",
    newLabel: "Nuova data e orario",
    clientLabel: "Cliente",
    clientEmailLabel: "Email del Cliente",
    serviceLabel: "Servizio",
    newDateTimeLabel: "Nuova Data e Orario",
    durationLabel: "Durata",
    formatLabel: "Modalità",
    bookingRefLabel: "Riferimento Prenotazione",
    formatValue: { ONLINE: "Sessione Online", IN_PERSON: "Sessione in Presenza" },
    onlineReminder: (parentFirstName) =>
      `<strong>Sessione online:</strong> invia a ${parentFirstName} i dettagli aggiornati per la videochiamata entro e non oltre 24 ore prima del nuovo orario della sessione — oppure il prima possibile, se la sessione inizia prima.`,
    paymentNoteLabel: "Pagamento:",
    paymentNote: "Il pagamento originale viene mantenuto per la nuova sessione. Non è stato effettuato alcun nuovo addebito e non è stato emesso alcun rimborso.",
    button: "Vai al Mio Calendario",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
  },
};

/**
 * Reschedule notification email sent to the expert when a parent reschedules.
 *
 * @param {{
 *   expertName: string, parentName: string, parentEmail: string, serviceTitle: string,
 *   format: 'ONLINE' | 'IN_PERSON', previousScheduledAt: Date, newScheduledAt: Date,
 *   durationMinutes: number, bookingId: number, timezone?: string | null,
 *   language?: 'en' | 'it', clientUrl: string, contactEmail: string, supportEmail: string,
 * }} params
 */
const rescheduleNotificationEmailHtml = ({
  expertName,
  parentName,
  parentEmail,
  serviceTitle,
  format,
  previousScheduledAt,
  newScheduledAt,
  durationMinutes,
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
  const parentFirstName = parentName?.split(" ")[0] || "";
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const prev = formatDateTime(previousScheduledAt, timezone, lang);
  const next = formatDateTime(newScheduledAt, timezone, lang);
  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} ${lang === "it" ? "minuti" : "minutes"}`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}min` : ""}`;

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

          <!-- Icon -->
          <div style="text-align:center;margin-bottom:20px;">
            <div style="display:inline-block;background:#FEF3C7;border-radius:50%;padding:16px;">
              <span style="font-size:28px;">🗓️</span>
            </div>
          </div>

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#445446;text-align:center;">
            ${t.heading}
          </h1>
          <p style="margin:0 0 28px;font-size:15px;color:#5e6d5b;line-height:1.6;text-align:center;">
            ${t.intro(expertFirstName, parentName)}
          </p>

          <!-- Old → New time change banner -->
          <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:12px;padding:18px 24px;margin-bottom:24px;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.5px;">${t.timeChangeLabel}</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:10px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#B45309;letter-spacing:0.4px;">${t.previousLabel}</span><br>
                  <span style="font-size:14px;color:#78350F;text-decoration:line-through;">
                    ${prev.dateStr} ${prev.timeStr} ${prev.tzLabel}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #FCD34D;padding-top:10px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#B45309;letter-spacing:0.4px;">${t.newLabel}</span><br>
                  <span style="font-size:15px;font-weight:700;color:#445446;">
                    ${next.dateStr} ${next.timeStr} ${next.tzLabel}
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Full session details -->
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.clientLabel}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${parentName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #c5ceba;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.clientEmailLabel}</span><br>
                  <a href="mailto:${parentEmail}" style="font-size:15px;font-weight:600;color:#445446;text-decoration:none;">${parentEmail}</a>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #c5ceba;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.serviceLabel}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #c5ceba;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.newDateTimeLabel}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${next.dateStr} ${next.timeStr} ${next.tzLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #c5ceba;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.durationLabel}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${durationLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #c5ceba;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.formatLabel}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${t.formatValue[format] || format}</span>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #c5ceba;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.bookingRefLabel}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${formatBookingRef(bookingId)}</span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Online session reminder -->
          ${format === "ONLINE" ? `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.5;">${t.onlineReminder(parentFirstName)}</p>
          </div>` : ""}

          <!-- Payment note -->
          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#166534;line-height:1.5;">
              <strong>${t.paymentNoteLabel}</strong> ${t.paymentNote}
            </p>
          </div>

          <!-- CTA -->
          <div style="text-align:center;">
            <a href="${clientUrl}/dashboard/expert/appointments"
               style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
              ${t.button}
            </a>
          </div>

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

const rescheduleNotificationEmailSubject = ({ language, parentName }) => {
  const lang = language === "it" ? "it" : "en";
  return COPY[lang].subject(parentName);
};

module.exports = { rescheduleNotificationEmailHtml, rescheduleNotificationEmailSubject };
