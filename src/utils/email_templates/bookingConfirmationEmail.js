const { getConsentWording } = require("../legalConsentWording");
const { formatDateTime } = require("../emailDateTimeFormat");
const { formatBookingRef } = require("../bookingRef");

const COPY = {
  en: {
    subject: ({ serviceTitle, expertName, dateStr }) =>
      `Your Sage Nest booking is confirmed — ${serviceTitle} with ${expertName} on ${dateStr}`,
    title: "Booking Confirmed – Sage Nest",
    greetingLead: (name) => `Hi ${name},`,
    greetingSub: "Your booking is confirmed. Here are your session details:",
    bookingDetails: "Booking Details",
    labels: { expert: "Expert", service: "Service", date: "Date", time: "Time", duration: "Duration", format: "Format", location: "Location", price: "Price Paid", bookingRef: "Booking Ref" },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In-Person" },
    onlineNotice: "For online sessions: your expert will send you the video call details no later than 24 hours before your session — or promptly after booking, if your session starts sooner.",
    paymentHeading: "Payment",
    payment: (amountStr, expertName) =>
      `Your payment of ${amountStr} has been processed securely via Stripe. Your session is provided by ${expertName}, who is responsible for the service and appears as the merchant for this transaction; Sage Nest operates the platform through which the booking and payment are made.`,
    withdrawalHeading: "Your Right of Withdrawal",
    cancellationHeading: "Cancellation & Rescheduling",
    cancellationIntro: "We understand that life happens and plans sometimes change. To honour the commitment made by both you and your expert — who has dedicated this time exclusively for you — the following cancellation policy applies:",
    cancellationTiers: [
      { strong: "More than 24 hours", rest: "before your session &rarr; Full refund" },
      { strong: "Between 12 and 24 hours", rest: "before your session &rarr; 50% refund" },
      { strong: "Less than 12 hours", rest: "before your session, or no-show &rarr; No refund" },
    ],
    reschedule: "Need to change your time? You can reschedule your session once, free of charge, as long as you do so more than 12 hours before your session — simply use the Reschedule option in your dashboard.",
    expertCancel: "If your expert cancels for any reason, you will always receive a full refund, regardless of timing.",
    fullPolicy: (url) => `The full policy is available here: <a href="${url}" style="color:#445446;text-decoration:underline;">Cancellation and Rescheduling Policy</a>`,
    button: "View booking in your dashboard",
    termsLine: (termsUrl, privacyUrl) =>
      `This booking is governed by the Sage Nest <a href="${termsUrl}" style="color:#445446;">Consumer Terms &amp; Conditions</a> you accepted when you booked and the applicable <a href="${privacyUrl}" style="color:#445446;">Privacy Policy</a>. Links open the same language version you accepted.`,
    footerAddress: "Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark",
    footerContact: (email) => `Questions? Contact us at <a href="mailto:${email}" style="color:#445446;">${email}</a>`,
    transactional: (email) => `This is a transactional message about your booking, sent from ${email}.`,
  },
  it: {
    subject: ({ serviceTitle, expertName, dateStr }) =>
      `La tua prenotazione Sage Nest è confermata — ${serviceTitle} con ${expertName} il ${dateStr}`,
    title: "Prenotazione Confermata – Sage Nest",
    greetingLead: (name) => `Ciao ${name},`,
    greetingSub: "la tua prenotazione è confermata. Ecco i dettagli della tua sessione:",
    bookingDetails: "Dettagli della Prenotazione",
    labels: { expert: "Professionista", service: "Servizio", date: "Data", time: "Orario", duration: "Durata", format: "Modalità", location: "Luogo", price: "Prezzo Pagato", bookingRef: "Riferimento Prenotazione" },
    formatLabel: { ONLINE: "Online", IN_PERSON: "In presenza" },
    onlineNotice: "Per le sessioni online: il tuo Professionista ti invierà i dettagli per la videochiamata entro e non oltre 24 ore prima della sessione — oppure subito dopo la prenotazione, se la tua sessione inizia prima.",
    paymentHeading: "Pagamento",
    payment: (amountStr, expertName) =>
      `Il tuo pagamento di ${amountStr} è stato elaborato in modo sicuro tramite Stripe. La tua sessione è fornita da ${expertName}, che è responsabile del servizio e figura come esercente della transazione; Sage Nest gestisce la piattaforma attraverso la quale vengono effettuati la prenotazione e il pagamento.`,
    withdrawalHeading: "Il Tuo Diritto di Recesso",
    cancellationHeading: "Cancellazione e Modifica della Prenotazione",
    cancellationIntro: "Sappiamo che la vita è piena di imprevisti e i piani possono cambiare. Allo stesso tempo, il tuo Professionista ha riservato questo tempo esclusivamente a te: per rispettare l'impegno di entrambi, si applicano le seguenti condizioni di cancellazione:",
    cancellationTiers: [
      { strong: "Più di 24 ore", rest: "prima della sessione &rarr; Rimborso completo" },
      { strong: "Tra 12 e 24 ore", rest: "prima della sessione &rarr; Rimborso del 50%" },
      { strong: "Meno di 12 ore", rest: "prima della sessione, o mancata presentazione &rarr; Nessun rimborso" },
    ],
    reschedule: "Devi cambiare orario? Puoi modificare la tua prenotazione una sola volta, gratuitamente, purché tu lo faccia più di 12 ore prima della sessione — usa semplicemente l'opzione Modifica prenotazione nella tua dashboard.",
    expertCancel: "Se il tuo Professionista cancella per qualsiasi motivo, riceverai sempre un rimborso completo, indipendentemente dal momento.",
    fullPolicy: (url) => `Le condizioni complete sono disponibili qui: <a href="${url}" style="color:#445446;text-decoration:underline;">Condizioni di Cancellazione e Modifica della Prenotazione</a>`,
    button: "Visualizza la prenotazione nella tua dashboard",
    termsLine: (termsUrl, privacyUrl) =>
      `La presente prenotazione è disciplinata dai <a href="${termsUrl}" style="color:#445446;">Termini e Condizioni Consumatori</a> di Sage Nest che hai accettato al momento della prenotazione e dalla relativa <a href="${privacyUrl}" style="color:#445446;">Informativa sulla privacy</a>. I link aprono la stessa versione linguistica che hai accettato.`,
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

function withdrawalBlockHtml({ withdrawalApplicable, language, termsUrl }) {
  const wording = getConsentWording(language);
  const termsLabel = language === "it" ? "Termini e Condizioni Consumatori" : "Consumer Terms &amp; Conditions";
  const termsLink = `<a href="${termsUrl}" style="color:#445446;">${termsLabel}</a>`;

  if (withdrawalApplicable) {
    return `
          <p style="margin:0 0 12px;font-size:14px;color:#5e6d5b;line-height:1.6;">${wording.withdrawalConfirmedEmail}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#5e6d5b;line-height:1.6;">${wording.withdrawalInstructionsEmail.replace("{TERMS_LINK}", termsLink)}</p>`;
  }
  return `
          <p style="margin:0 0 24px;font-size:14px;color:#5e6d5b;line-height:1.6;">${wording.withdrawalPlainEmail.replace("{TERMS_LINK}", termsLink)}</p>`;
}

/**
 * Booking confirmation email sent to a parent after payment is verified (and
 * re-sent, with updated details, after a reschedule).
 *
 * @param {{
 *   name: string, expertName: string, serviceTitle: string,
 *   format: 'ONLINE' | 'IN_PERSON', scheduledAt: Date, durationMinutes: number,
 *   clientUrl: string, location?: string, contactEmail: string,
 *   language: 'en' | 'it', amount?: number | string | null, currency?: string,
 *   userTimezone?: string | null,
 *   withdrawalApplicable: boolean, bookingId: number,
 *   termsUrl: string, policyUrl: string, privacyUrl: string,
 * }} params
 */
const bookingConfirmationEmailHtml = ({
  name,
  expertName,
  serviceTitle,
  format,
  scheduledAt,
  durationMinutes,
  clientUrl,
  location,
  contactEmail,
  supportEmail,
  language,
  amount,
  currency,
  userTimezone,
  withdrawalApplicable,
  bookingId,
  termsUrl,
  policyUrl,
  privacyUrl,
}) => {
  const lang = language === "it" ? "it" : "en";
  const t = COPY[lang];

  const { dateStr, timeStr, tzLabel } = formatDateTime(scheduledAt, userTimezone, lang);
  const priceStr = formatPrice(amount, currency, lang);

  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} ${lang === "it" ? "minuti" : "minutes"}`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}min` : ""}`;

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

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:24px;">
          <img src="${logoUrl}" alt="Sage Nest" width="60" style="display:block;width:60px;height:auto;border:0;" />
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #c5ceba;padding:40px 36px;">

          <!-- Greeting -->
          <p style="margin:0 0 4px;font-size:15px;color:#445446;line-height:1.6;">
            ${t.greetingLead(name)}
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#5e6d5b;line-height:1.6;">
            ${t.greetingSub}
          </p>

          <!-- Booking details card -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.bookingDetails}</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.expert}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${expertName}</span>
                </td>
              </tr>
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
                <td style="padding:12px 0;border-top:1px solid #c5ceba;${format === "IN_PERSON" && location ? "" : "padding-bottom:0;"}">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.format}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${t.formatLabel[format] || format}</span>
                </td>
              </tr>
              ${format === "IN_PERSON" && location ? `
              <tr>
                <td style="padding-top:12px;border-top:1px solid #c5ceba;${priceStr ? "" : "padding-bottom:0;"}">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#5e6d5b;letter-spacing:0.5px;">${t.labels.location}</span><br>
                  <span style="font-size:15px;font-weight:600;color:#445446;">${location}</span>
                </td>
              </tr>` : ""}
              ${priceStr ? `
              <tr>
                <td style="padding-top:12px;border-top:1px solid #c5ceba;">
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

          ${format === "ONLINE" ? `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.5;">${t.onlineNotice}</p>
          </div>` : ""}

          <!-- Payment -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.paymentHeading}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            ${t.payment(priceStr || "", expertName)}
          </p>

          <!-- Right of withdrawal -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.withdrawalHeading}</p>
          ${withdrawalBlockHtml({ withdrawalApplicable, language: lang, termsUrl })}

          <!-- Cancellation & rescheduling -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">${t.cancellationHeading}</p>
          <p style="margin:0 0 12px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.cancellationIntro}</p>
          <ul style="margin:0 0 12px;padding-left:20px;">
            ${t.cancellationTiers.map((tier, i) => `<li style="font-size:14px;color:#5e6d5b;line-height:1.7;${i < t.cancellationTiers.length - 1 ? "margin-bottom:4px;" : ""}"><strong>${tier.strong}</strong> ${tier.rest}</li>`).join("")}
          </ul>
          <p style="margin:0 0 8px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.reschedule}</p>
          <p style="margin:0 0 12px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.expertCancel}</p>
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">${t.fullPolicy(policyUrl)}</p>

          <!-- Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${clientUrl}/dashboard" style="display:inline-block;background:#445446;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;">${t.button}</a>
            </td></tr>
          </table>

          <!-- Terms line -->
          <p style="margin:0 0 24px;font-size:12px;color:#5e6d5b;line-height:1.6;">${t.termsLine(termsUrl, privacyUrl)}</p>

          <!-- Footer -->
          <p style="margin:0 0 4px;font-size:12px;color:#445446;">${t.footerAddress}</p>
          <p style="margin:0 0 12px;font-size:12px;color:#445446;">${t.footerContact(supportEmail || contactEmail)}</p>
          <p style="margin:0;font-size:11px;color:#9aa596;">${t.transactional(contactEmail)}</p>

        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const bookingConfirmationEmailSubject = ({ language, serviceTitle, expertName, scheduledAt, userTimezone }) => {
  const lang = language === "it" ? "it" : "en";
  const { dateStr } = formatDateTime(scheduledAt, userTimezone, lang);
  return COPY[lang].subject({ serviceTitle, expertName, dateStr });
};

module.exports = { bookingConfirmationEmailHtml, bookingConfirmationEmailSubject };
