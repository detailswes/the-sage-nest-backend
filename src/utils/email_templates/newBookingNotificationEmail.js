const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: ({ serviceTitle, parentFirstName, dateStr }) =>
      `New booking — ${serviceTitle} with ${parentFirstName} on ${dateStr}`,
    title: "New Booking – Sage Nest",
    greeting: (expertFirstName) =>
      `Hi ${expertFirstName},<br><br>You have a new booking. Here are the details:`,
    bookingDetails: "Booking Details",
    labels: {
      parentName: "Parent Name",
      parentEmail: "Parent Email",
      parentPhone: "Parent Phone",
      service: "Service",
      date: "Date",
      time: "Time",
      duration: "Duration",
      format: "Format",
      location: "Location",
      price: "Session Price",
      bookingRef: "Booking Ref",
    },
    invoicingHeading: "Invoicing Details",
    invoicingIntro: "The parent provided the following details in case you need them for invoicing:",
    invoicingLabels: {
      invoiceHolder: "Invoice Holder",
      address: "Address",
      fiscalCode: "Fiscal Code",
    },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In-person", HOME_VISIT: "Home visit" },
    actionRequired: (parentFirstName, parentEmail) =>
      `<strong>Action required — online session:</strong> please send ${parentFirstName} the video call details at <a href="mailto:${parentEmail}" style="color:#065F46;">${parentEmail}</a> no later than 24 hours before the session — or as soon as possible, if the session starts sooner.`,
    actionRequiredHomeVisit: (parentFirstName, parentEmail, parentPhone) =>
      `<strong>Action required — home visit:</strong> please contact ${parentFirstName} to agree the address and any access details before the session. You can reach them at <a href="mailto:${parentEmail}" style="color:#065F46;">${parentEmail}</a>${parentPhone ? ` or on <a href="tel:${parentPhone}" style="color:#065F46;">${parentPhone}</a>` : ""}.`,
    actionPurposeLimitation:
      "The parent's contact details are shared with you solely for delivering this session and must not be used for any other purpose.",
    payoutLine:
      "The amount paid for this session is shown in your expert dashboard, together with the booking. Your payout, net of the platform fee, is made to your connected Stripe account on your usual payout schedule.",
    cancellationHeading: "Cancellation & Rescheduling",
    cancellationIntro: "This is how the cancellation policy applies to this booking:",
    cancellationTiers: [
      { strong: "More than 24 hours", rest: "before the session &rarr; the parent receives a full refund; no payout is made to you." },
      { strong: "Between 12 and 24 hours", rest: "before the session &rarr; the parent receives a 50% refund; you receive your payout on the retained amount, less the platform fee." },
      { strong: "Less than 12 hours", rest: "before the session, or no-show &rarr; no refund is issued; you receive your full payout, less the platform fee." },
    ],
    cancellationClosing: (policyUrl) =>
      `If you cancel, the parent always receives a full refund and no payout is made. Please cancel only where genuinely unavoidable. Each booking can be rescheduled once. The full policy is available here: <a href="${policyUrl}" style="color:#445446;text-decoration:underline;font-weight:600;">Cancellation and Rescheduling Policy</a>`,
    button: "View booking in your expert dashboard",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about a booking, sent from ${email}.`,
  },
  it: {
    subject: ({ serviceTitle, parentFirstName, dateStr }) =>
      `Nuova prenotazione — ${serviceTitle} con ${parentFirstName} il ${dateStr}`,
    title: "Nuova Prenotazione – Sage Nest",
    greeting: (expertFirstName) =>
      `Ciao ${expertFirstName},<br><br>hai una nuova prenotazione. Ecco i dettagli:`,
    bookingDetails: "Dettagli della Prenotazione",
    labels: {
      parentName: "Nome del Genitore",
      parentEmail: "Email del Genitore",
      parentPhone: "Telefono del Genitore",
      service: "Servizio",
      date: "Data",
      time: "Orario",
      duration: "Durata",
      format: "Modalità",
      location: "Luogo",
      price: "Prezzo della Sessione",
      bookingRef: "Riferimento Prenotazione",
    },
    invoicingHeading: "Dati per la Fatturazione",
    invoicingIntro: "Il genitore ha fornito questi dati nel caso ti servano per la fatturazione:",
    invoicingLabels: {
      invoiceHolder: "Intestatario Fattura",
      address: "Indirizzo",
      fiscalCode: "Codice Fiscale",
    },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In presenza", HOME_VISIT: "Visita a domicilio" },
    actionRequired: (parentFirstName, parentEmail) =>
      `<strong>Azione richiesta — sessione online:</strong> invia a ${parentFirstName} i dettagli per la videochiamata all'indirizzo <a href="mailto:${parentEmail}" style="color:#065F46;">${parentEmail}</a> almeno 24 ore prima della sessione. Se la prenotazione è stata effettuata con meno di 24 ore di anticipo, inviali il prima possibile.`,
    actionRequiredHomeVisit: (parentFirstName, parentEmail, parentPhone) =>
      `<strong>Azione richiesta — visita a domicilio:</strong> contatta ${parentFirstName} per concordare l'indirizzo ed eventuali dettagli di accesso prima della sessione. Puoi raggiungerlo all'indirizzo <a href="mailto:${parentEmail}" style="color:#065F46;">${parentEmail}</a>${parentPhone ? ` o al numero <a href="tel:${parentPhone}" style="color:#065F46;">${parentPhone}</a>` : ""}.`,
    actionPurposeLimitation:
      "I dati di contatto del genitore ti vengono forniti esclusivamente per questa sessione e non possono essere utilizzati per altre finalità.",
    payoutLine:
      "L'importo pagato per questa sessione è visibile nella tua dashboard, insieme alla prenotazione. Il tuo compenso, al netto della commissione della piattaforma, viene accreditato sul tuo account Stripe collegato secondo il consueto calendario.",
    cancellationHeading: "Cancellazione e Riprogrammazione",
    cancellationIntro: "Ecco come si applica la politica di cancellazione a questa prenotazione:",
    cancellationTiers: [
      { strong: "Più di 24 ore", rest: "prima della sessione &rarr; il genitore riceve un rimborso completo; nessun compenso ti viene corrisposto." },
      { strong: "Tra 12 e 24 ore", rest: "prima della sessione &rarr; il genitore riceve un rimborso del 50%; ricevi il compenso sull'importo trattenuto, al netto della commissione della piattaforma." },
      { strong: "Meno di 12 ore", rest: "prima della sessione, o mancata presentazione &rarr; nessun rimborso; ricevi il compenso pieno, al netto della commissione della piattaforma." },
    ],
    cancellationClosing: (policyUrl) =>
      `Se cancelli tu, il genitore riceve sempre un rimborso completo e nessun compenso ti viene corrisposto. Ti chiediamo di cancellare solo se davvero inevitabile. Ogni prenotazione può essere riprogrammata una sola volta. La politica completa è disponibile qui: <a href="${policyUrl}" style="color:#445446;text-decoration:underline;font-weight:600;">Condizioni di Cancellazione e Modifica della Prenotazione</a>`,
    button: "Visualizza la prenotazione nella tua dashboard",
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenaghen, Danimarca",
    footerContact: (email) => `Domande? Contattaci a <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `Questa è una comunicazione di servizio relativa a una prenotazione, inviata da ${email}.`,
  },
};

function formatPrice(amount, currency, language) {
  if (amount == null) return null;
  const locale = language === "it" ? "it-IT" : "en-GB";
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "EUR" }).format(Number(amount));
}

/**
 * Booking confirmation email sent to the expert when a new booking is
 * confirmed (payment succeeded). Expert emails follow the expert's own
 * profile language, independent of the parent's locale.
 *
 * @param {{
 *   expertName: string, parentName: string, parentEmail: string,
 *   parentPhone?: string | null,
 *   serviceTitle: string, format: 'ONLINE' | 'IN_PERSON' | 'HOME_VISIT', scheduledAt: Date,
 *   durationMinutes: number, location?: string, amount?: number | string | null,
 *   currency?: string, bookingId: number, timezone?: string | null, language?: 'en' | 'it',
 *   clientUrl: string, contactEmail: string, supportEmail: string, policyUrl: string,
 *   parentAddress?: string, parentFiscalCode?: string, parentInvoiceHolder?: string,
 * }} params
 */
const newBookingNotificationEmailHtml = ({
  expertName,
  parentName,
  parentEmail,
  // Only ever passed for HOME_VISIT bookings — the expert needs to reach the
  // parent to agree the address. Never included for online or in-person.
  parentPhone,
  serviceTitle,
  format,
  scheduledAt,
  durationMinutes,
  location,
  amount,
  currency,
  bookingId,
  timezone,
  language,
  clientUrl,
  contactEmail,
  supportEmail,
  policyUrl,
  parentAddress,
  parentFiscalCode,
  parentInvoiceHolder,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];
  const expertFirstName = expertName?.split(" ")[0] || "there";
  const parentFirstName = parentName?.split(" ")[0] || "";
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, timezone, lang);
  const priceStr = formatPrice(amount, currency, lang);
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

          <p style="margin:0 0 28px;font-size:15px;color:#445446;line-height:1.6;">
            ${t.greeting(expertFirstName)}
          </p>

          <!-- Booking details card -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.bookingDetails}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.parentName}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${parentName}</span>
                </td>
              </tr>
              ${parentEmail ? `
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.parentEmail}</span><br>
                  <a href="mailto:${parentEmail}" style="font-size:15px;font-weight:600;color:#445446;text-decoration:none;">${parentEmail}</a>
                </td>
              </tr>` : ""}
              ${format === "HOME_VISIT" && parentPhone ? `
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.parentPhone}</span><br>
                  <a href="tel:${parentPhone}" style="font-size:15px;font-weight:600;color:#445446;text-decoration:none;">${parentPhone}</a>
                </td>
              </tr>` : ""}
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
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
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.time}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${timeStr} ${tzLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.duration}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${durationLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.format}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${t.formatLabel[format] || format}</span>
                </td>
              </tr>
              ${format === "IN_PERSON" && location ? `
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.location}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${location}</span>
                </td>
              </tr>` : ""}
              ${priceStr ? `
              <tr>
                <td style="padding:12px 0;border-top:1px solid #c5ceba;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.price}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${priceStr}</span>
                </td>
              </tr>` : ""}
              <tr>
                <td style="padding-top:12px;border-top:1px solid #c5ceba;padding-bottom:0;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.bookingRef}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${formatBookingRef(bookingId)}</span>
                </td>
              </tr>
            </table>
          </div>

          ${(parentInvoiceHolder || parentAddress || parentFiscalCode) ? `
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.invoicingHeading}</p>
          <p style="margin:0 0 12px;font-size:13px;color:#5e6d5b;line-height:1.5;">${t.invoicingIntro}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${parentInvoiceHolder ? `
              <tr>
                <td style="padding-bottom:${(parentAddress || parentFiscalCode) ? "12px" : "0"};">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.invoicingLabels.invoiceHolder}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${parentInvoiceHolder}</span>
                </td>
              </tr>` : ""}
              ${parentAddress ? `
              <tr>
                <td style="padding-top:${parentInvoiceHolder ? "12px" : "0"};padding-bottom:${parentFiscalCode ? "12px" : "0"};${parentInvoiceHolder ? "border-top:1px solid #c5ceba;" : ""}">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.invoicingLabels.address}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${parentAddress}</span>
                </td>
              </tr>` : ""}
              ${parentFiscalCode ? `
              <tr>
                <td style="padding-top:${(parentInvoiceHolder || parentAddress) ? "12px" : "0"};${(parentInvoiceHolder || parentAddress) ? "border-top:1px solid #c5ceba;" : ""}">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.invoicingLabels.fiscalCode}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${parentFiscalCode}</span>
                </td>
              </tr>` : ""}
            </table>
          </div>` : ""}

          ${format === "ONLINE" || format === "HOME_VISIT" ? `
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:13px;color:#065F46;line-height:1.5;">${
              format === "HOME_VISIT"
                ? t.actionRequiredHomeVisit(parentFirstName, parentEmail, parentPhone)
                : t.actionRequired(parentFirstName, parentEmail)
            }</p>
            <p style="margin:0;font-size:13px;color:#065F46;line-height:1.5;">${t.actionPurposeLimitation}</p>
          </div>` : ""}

          <!-- Payout line -->
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.payoutLine}</p>

          <!-- Cancellation & rescheduling -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.cancellationHeading}</p>
          <p style="margin:0 0 12px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.cancellationIntro}</p>
          <ul style="margin:0 0 12px;padding-left:20px;">
            ${t.cancellationTiers.map((tier, i) => `<li style="font-size:14px;color:#5e6d5b;line-height:1.7;${i < t.cancellationTiers.length - 1 ? "margin-bottom:4px;" : ""}"><strong>${tier.strong}</strong> ${tier.rest}</li>`).join("")}
          </ul>
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.cancellationClosing(policyUrl)}</p>

          <!-- Button -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${clientUrl}/dashboard/expert/appointments" style="display:inline-block;background:#445446;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;">${t.button}</a>
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

const newBookingNotificationEmailSubject = ({ language, serviceTitle, parentName, scheduledAt, timezone }) => {
  const lang = language === "it" ? "it" : "en";
  const parentFirstName = parentName?.split(" ")[0] || "";
  const { dateStr } = formatDateTime(scheduledAt, timezone, lang);
  return COPY[lang].subject({ serviceTitle, parentFirstName, dateStr });
};

module.exports = { newBookingNotificationEmailHtml, newBookingNotificationEmailSubject };
