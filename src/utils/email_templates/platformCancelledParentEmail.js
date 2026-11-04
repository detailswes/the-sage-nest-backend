const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: ({ serviceTitle, dateStr }) => `Your booking has been cancelled — ${serviceTitle} on ${dateStr}`,
    title: "Booking Cancelled – Sage Nest",
    greeting: (parentFirstName) => `Hi ${parentFirstName},`,
    intro: {
      admin_cancelled: "Sage Nest has cancelled the following booking.",
      account_closure: "Your account has been suspended, so the following booking has been cancelled.",
    },
    cancelledSession: "Cancelled Session",
    labels: { expert: "Specialist", service: "Service", date: "Date", time: "Time", bookingRef: "Booking Ref" },
    reasonLabel: "Reason",
    refundHeading: "Your payment",
    refund: {
      issued: "A refund has been issued to your original payment method. It typically appears within 5–10 business days.",
      none: "Under our Cancellation and Rescheduling Policy, no refund applies to this booking.",
      review: "Our team is reviewing this booking and will contact you about any refund that is due.",
      free: "This was a free booking, so no payment was taken.",
    },
    closing: (email) => `If you have any questions, write to us at <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "The Sage Nest Team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about a booking, sent from ${email}.`,
  },
  it: {
    subject: ({ serviceTitle, dateStr }) => `La tua prenotazione è stata cancellata — ${serviceTitle} il ${dateStr}`,
    title: "Prenotazione Cancellata – Sage Nest",
    greeting: (parentFirstName) => `Ciao ${parentFirstName},`,
    intro: {
      admin_cancelled: "Sage Nest ha cancellato la seguente prenotazione.",
      account_closure: "Il tuo account è stato sospeso, quindi la seguente prenotazione è stata cancellata.",
    },
    cancelledSession: "Sessione Cancellata",
    labels: { expert: "Specialista", service: "Servizio", date: "Data", time: "Orario", bookingRef: "Riferimento Prenotazione" },
    reasonLabel: "Motivo",
    refundHeading: "Il tuo pagamento",
    refund: {
      issued: "È stato emesso un rimborso sul metodo di pagamento originale. Di solito è visibile entro 5–10 giorni lavorativi.",
      none: "In base alle nostre Condizioni di Cancellazione e Modifica della Prenotazione, per questa prenotazione non è previsto alcun rimborso.",
      review: "Il nostro team sta esaminando questa prenotazione e ti contatterà in merito a un eventuale rimborso dovuto.",
      free: "Si trattava di una prenotazione gratuita, quindi non è stato addebitato alcun pagamento.",
    },
    closing: (email) => `Per qualsiasi domanda, scrivici a <a href="mailto:${email}" style="color:#445446;">${email}</a>.`,
    signoff: "Il team di Sage Nest",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
  },
};

/**
 * Email sent to a parent when Sage Nest itself cancels one of their bookings —
 * an admin cancelling from Booking Management, or the parent's account being
 * suspended. (A cancel the parent made, or one the specialist made, has its
 * own email.) Carries the calendar cancellation so the event leaves the
 * parent's calendar.
 *
 * @param {{
 *   parentName: string, expertName: string, serviceTitle: string,
 *   scheduledAt: Date, bookingId: number, timezone?: string | null,
 *   language?: 'en' | 'it', clientUrl: string, contactEmail: string, supportEmail: string,
 *   refundOutcome: 'issued' | 'none' | 'review' | 'free',
 *   cancellationType?: 'admin_cancelled' | 'account_closure', adminReason?: string | null,
 * }} params
 */
const platformCancelledParentEmailHtml = ({
  parentName,
  expertName,
  serviceTitle,
  scheduledAt,
  bookingId,
  timezone,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
  refundOutcome = "review",
  cancellationType = "admin_cancelled",
  adminReason,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const parentFirstName = parentName?.split(" ")[0] || "there";
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;
  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, timezone, lang);

  const row = (label, value, first = false) => `
              <tr>
                <td style="padding:${first ? "0 0 12px" : "12px 0"};${first ? "" : "border-top:1px solid #c5ceba;"}">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${label}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${value}</span>
                </td>
              </tr>`;

  const reasonBlock =
    cancellationType === "admin_cancelled" && adminReason
      ? `<p style="margin:0 0 24px;font-size:14px;color:#5e6d5b;line-height:1.6;"><strong>${t.reasonLabel}:</strong> ${adminReason}</p>`
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

        <tr><td align="center" style="padding-bottom:24px;">
          <img src="${logoUrl}" alt="Sage Nest" width="60" style="display:block;width:60px;height:auto;border:0;" />
        </td></tr>

        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #c5ceba;padding:40px 36px;">

          <p style="margin:0 0 28px;font-size:15px;color:#445446;line-height:1.6;">
            ${t.greeting(parentFirstName)}<br><br>${t.intro[cancellationType] ?? t.intro.admin_cancelled}
          </p>

          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.cancelledSession}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${row(t.labels.expert, expertName, true)}
              ${row(t.labels.service, serviceTitle)}
              ${row(t.labels.date, dateStr)}
              ${row(t.labels.time, `${timeStr} ${tzLabel}`)}
              ${row(t.labels.bookingRef, formatBookingRef(bookingId))}
            </table>
          </div>

          ${reasonBlock}

          <div style="background:#FFF7ED;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400E;">${t.refundHeading}</p>
            <p style="margin:0;font-size:13px;color:#92400E;line-height:1.6;">${t.refund[refundOutcome] ?? t.refund.review}</p>
          </div>

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

const platformCancelledParentEmailSubject = ({ language, serviceTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ serviceTitle, dateStr });
};

module.exports = { platformCancelledParentEmailHtml, platformCancelledParentEmailSubject };
