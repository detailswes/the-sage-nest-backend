const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COPY = {
  en: {
    subject: ({ serviceTitle, parentFirstName, dateStr }) =>
      `Booking cancelled — ${serviceTitle} with ${parentFirstName} on ${dateStr}`,
    title: "Session Cancelled – Sage Nest",
    reasonClause: {
      account_closure: " because the parent's account is no longer active on the platform",
      admin_cancelled: "",
    },
    greeting: (expertFirstName, reasonClause) =>
      `Hi ${expertFirstName},<br><br>We're sorry to let you know that an upcoming session has been cancelled by Sage Nest${reasonClause}. You don't need to take any action.`,
    noteLabel: "Note:",
    cancelledSession: "Cancelled Session",
    labels: { parentName: "Parent Name", service: "Service", date: "Date", time: "Time", bookingRef: "Booking Ref" },
    payoutHeading: "Payout for this session",
    payout: (policyUrl) =>
      `Your payout for this booking follows the same rules as a parent cancellation, based on when the cancellation occurred — see the <a href="${policyUrl}" style="color:#92400E;text-decoration:underline;">Cancellation and Rescheduling Policy</a>. If you have any questions, contact us and we'll review it with you.`,
    closing: (email) => `We're sorry for the disruption to your schedule. If you have any questions, write to us at <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "The Sage Nest Team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about a booking, sent from ${email}.`,
  },
  it: {
    subject: ({ serviceTitle, parentFirstName, dateStr }) =>
      `Prenotazione cancellata — ${serviceTitle} con ${parentFirstName} il ${dateStr}`,
    title: "Sessione Cancellata – Sage Nest",
    reasonClause: {
      account_closure: " in quanto l'account del genitore non è più attivo sulla piattaforma",
      admin_cancelled: "",
    },
    greeting: (expertFirstName, reasonClause) =>
      `Ciao ${expertFirstName},<br><br>ti informiamo che una sessione in programma è stata cancellata da Sage Nest${reasonClause}. Non è richiesta alcuna azione da parte tua.`,
    noteLabel: "Nota:",
    cancelledSession: "Sessione Cancellata",
    labels: { parentName: "Nome del Genitore", service: "Servizio", date: "Data", time: "Orario", bookingRef: "Riferimento Prenotazione" },
    payoutHeading: "Compenso per questa sessione",
    payout: (policyUrl) =>
      `Il compenso per questa prenotazione segue le regole previste per le cancellazioni da parte del genitore, in base al momento in cui la cancellazione è avvenuta — vedi le <a href="${policyUrl}" style="color:#92400E;text-decoration:underline;">Condizioni di Cancellazione e Modifica della Prenotazione</a>. Per qualsiasi domanda, contattaci: la verificheremo insieme.`,
    closing: (email) => `Ci scusiamo per l'eventuale disagio arrecato ai tuoi impegni. Per qualsiasi domanda, scrivici a <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
  },
};

/**
 * Email sent to an expert when one of their upcoming sessions is cancelled by
 * Sage Nest itself rather than by the parent directly — either because the
 * parent's account is no longer active (suspended or GDPR-deleted), or
 * because an admin cancelled the booking directly from Booking Management.
 *
 * @param {{
 *   expertName: string, parentName: string, serviceTitle: string,
 *   scheduledAt: Date, bookingId: number, timezone?: string | null,
 *   language?: 'en' | 'it', clientUrl: string,
 *   contactEmail: string, supportEmail: string, policyUrl: string,
 *   cancellationType?: 'account_closure' | 'admin_cancelled',
 *   adminReason?: string | null,
 * }} params
 */
const platformCancellationEmailHtml = ({
  expertName,
  parentName,
  serviceTitle,
  scheduledAt,
  bookingId,
  timezone,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
  policyUrl,
  cancellationType = "account_closure",
  adminReason,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const expertFirstName = expertName?.split(" ")[0] || "there";
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, timezone, lang);
  const reasonClause = t.reasonClause[cancellationType] ?? t.reasonClause.admin_cancelled;

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
            ${t.greeting(expertFirstName, reasonClause)}
          </p>

          ${cancellationType === "admin_cancelled" && adminReason ? `
          <div style="background:#F5F7F5;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#5e6d5b;line-height:1.5;"><strong>${t.noteLabel}</strong> ${escapeHtml(adminReason)}</p>
          </div>` : ""}

          <!-- Cancelled session -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.cancelledSession}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:10px;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">${t.labels.parentName}</span>
                </td>
                <td style="padding-bottom:10px;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${parentName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">${t.labels.service}</span>
                </td>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">${t.labels.date}</span>
                </td>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${dateStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">${t.labels.time}</span>
                </td>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${timeStr} ${tzLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-top:10px;border-top:1px solid #c5ceba;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">${t.labels.bookingRef}</span>
                </td>
                <td style="padding-top:10px;border-top:1px solid #c5ceba;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${formatBookingRef(bookingId)}</span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Payout note -->
          <div style="background:#FFF7ED;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:28px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400E;">${t.payoutHeading}</p>
            <p style="margin:0;font-size:13px;color:#92400E;line-height:1.6;">
              ${t.payout(policyUrl)}
            </p>
          </div>

          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            ${t.closing(supportEmail)}
          </p>

          <!-- Sign-off -->
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#445446;">${t.signoff}</p>

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

const platformCancellationEmailSubject = ({ language, serviceTitle, parentName, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const parentFirstName = parentName?.split(" ")[0] || "";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ serviceTitle, parentFirstName, dateStr });
};

module.exports = { platformCancellationEmailHtml, platformCancellationEmailSubject };
