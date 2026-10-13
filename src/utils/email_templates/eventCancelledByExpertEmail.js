const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: ({ eventTitle, dateStr }) => `Event cancelled: ${eventTitle} on ${dateStr}`,
    title: "Event Cancelled – Sage Nest",
    greeting: (parentFirstName, expertName, eventTitle, dateStr, timeStr, tzLabel) =>
      `Hi ${parentFirstName},<br><br>We are sorry to let you know that <strong>${expertName}</strong> has had to cancel <strong>${eventTitle}</strong>, which was scheduled for ${dateStr} at ${timeStr} ${tzLabel}.`,
    labels: { bookingRef: "Booking Ref" },
    reasonHeading: (expertName) => `Message from ${expertName}`,
    refundHeading: "Refund",
    refund: (amountStr) =>
      `You will receive a full refund of <strong>${amountStr}</strong> to the payment method you used. Refunds usually appear within 5–10 working days, depending on your bank.`,
    freeBody: "This was a complimentary event, so no payment was taken.",
    videoLinkInvalid: "The video link for this event is no longer valid.",
    closing: (url) => `We are sorry for the inconvenience. You can find other upcoming events <a href="${url}" style="color:#445446;text-decoration:underline;font-weight:600;">here</a>.`,
    signoff: "The Sage Nest team",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your booking, sent from ${email}.`,
  },
  it: {
    subject: ({ eventTitle, dateStr }) => `Evento annullato: ${eventTitle} il ${dateStr}`,
    title: "Evento Annullato – Sage Nest",
    greeting: (parentFirstName, expertName, eventTitle, dateStr, timeStr, tzLabel) =>
      `Ciao ${parentFirstName},<br><br>ci dispiace informarti che <strong>${expertName}</strong> ha dovuto annullare <strong>${eventTitle}</strong>, previsto per il ${dateStr} alle ${timeStr} ${tzLabel}.`,
    labels: { bookingRef: "Riferimento Prenotazione" },
    reasonHeading: (expertName) => `Messaggio da ${expertName}`,
    refundHeading: "Rimborso",
    refund: (amountStr) =>
      `Riceverai il rimborso completo di <strong>${amountStr}</strong> sul metodo di pagamento che hai utilizzato. Di solito il rimborso è visibile entro 5–10 giorni lavorativi, a seconda della tua banca.`,
    freeBody: "Questo era un evento gratuito, quindi non è stato addebitato alcun importo.",
    videoLinkInvalid: "Il link della videochiamata per questo evento non è più valido.",
    closing: (url) => `Ci scusiamo per l'inconveniente. Puoi trovare altri eventi in programma <a href="${url}" style="color:#445446;text-decoration:underline;font-weight:600;">qui</a>.`,
    signoff: "Il team di Sage Nest",
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
 * Event-cancelled-by-expert email — sent to every participant when the
 * expert cancels the whole event. Dedicated event template (Sage Nest Event
 * Module Feedback, annex G/H) — replaces expertCancelledSessionEmail for a
 * bulk whole-event cancel only; a single attendee removed from an otherwise
 * still-active event continues to use the generic template (no dedicated
 * copy was specified for that narrower case).
 *
 * @param {{
 *   parentName: string, expertName: string, eventTitle: string, scheduledAt: Date,
 *   format: 'ONLINE' | 'IN_PERSON', cancellationReason?: string,
 *   isFree: boolean, amount?: number | string | null, currency?: string,
 *   bookingId: number, recipientTimezone?: string | null, language?: 'en' | 'it',
 *   clientUrl: string, contactEmail: string, supportEmail: string, eventsListingUrl: string,
 * }} params
 */
const eventCancelledByExpertEmailHtml = ({
  parentName,
  expertName,
  eventTitle,
  scheduledAt,
  format,
  cancellationReason,
  isFree,
  amount,
  currency,
  bookingId,
  recipientTimezone,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
  eventsListingUrl,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const parentFirstName = parentName?.split(" ")[0] || "there";
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, recipientTimezone, lang);
  const priceStr = formatPrice(amount, currency, lang);

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
            ${t.greeting(parentFirstName, expertName, eventTitle, dateStr, timeStr, tzLabel)}
          </p>

          <p style="margin:0 0 24px;font-size:12px;color:#9aa596;">${t.labels.bookingRef}: ${formatBookingRef(bookingId)}</p>

          ${cancellationReason ? `
          <div style="background:#F5F7F5;border-radius:12px;padding:14px 24px;margin-bottom:24px;">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.reasonHeading(expertName)}</span><br>
            <span style="font-size:13px;font-weight:600;color:#445446;">${cancellationReason}</span>
          </div>` : ""}

          ${isFree ? `
          <p style="margin:0 0 24px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.freeBody}</p>` : `
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#065F46;">${t.refundHeading}</p>
            <p style="margin:0;font-size:13px;color:#065F46;line-height:1.6;">${t.refund(priceStr)}</p>
          </div>`}

          ${format === "ONLINE" ? `
          <p style="margin:0 0 24px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.videoLinkInvalid}</p>` : ""}

          <p style="margin:0 0 20px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.closing(eventsListingUrl)}</p>

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

const eventCancelledByExpertEmailSubject = ({ language, eventTitle, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ eventTitle, dateStr });
};

module.exports = { eventCancelledByExpertEmailHtml, eventCancelledByExpertEmailSubject };
