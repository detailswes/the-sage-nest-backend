const {
  verificationEmailHtml,
  verificationEmailSubject,
} = require("./email_templates/verificationEmail");
const {
  passwordResetEmailHtml,
  passwordResetEmailSubject,
} = require("./email_templates/passwordResetEmail");
const {
  bookingConfirmationEmailHtml,
  bookingConfirmationEmailSubject,
} = require("./email_templates/bookingConfirmationEmail");
const {
  cancellationNotificationEmailHtml,
  cancellationNotificationEmailSubject,
} = require("./email_templates/cancellationNotificationEmail");
const {
  newBookingNotificationEmailHtml,
  newBookingNotificationEmailSubject,
} = require("./email_templates/newBookingNotificationEmail");
const {
  bookingReminderEmailHtml,
  bookingReminderEmailSubject,
} = require("./email_templates/bookingReminderEmail");
const {
  changesRequestedEmailHtml,
  changesRequestedEmailSubject,
} = require("./email_templates/changesRequestedEmail");
const {
  refundParentEmailHtml,
  refundParentEmailSubject,
} = require("./email_templates/refundParentEmail");
const {
  refundExpertEmailHtml,
  refundExpertEmailSubject,
} = require("./email_templates/refundExpertEmail");
const {
  rescheduleNotificationEmailHtml,
  rescheduleNotificationEmailSubject,
} = require("./email_templates/rescheduleNotificationEmail");
const {
  expertCancelledSessionEmailHtml,
  expertCancelledSessionEmailSubject,
} = require("./email_templates/expertCancelledSessionEmail");
const {
  expertCancellationConfirmationEmailHtml,
  expertCancellationConfirmationEmailSubject,
} = require("./email_templates/expertCancellationConfirmationEmail");
const {
  parentSuspendedEmailHtml,
  parentSuspendedEmailSubject,
} = require("./email_templates/parentSuspendedEmail");
const {
  platformCancellationEmailHtml,
  platformCancellationEmailSubject,
} = require("./email_templates/platformCancellationEmail");
const {
  imLateEmailHtml,
  imLateEmailSubject,
} = require("./email_templates/imLateEmail");
const {
  welcomeEmailHtml,
  welcomeEmailSubject,
} = require("./email_templates/welcomeEmail");
const {
  legalDocumentUpdatedEmailHtml,
  legalDocumentUpdatedEmailSubject,
} = require("./email_templates/legalDocumentUpdatedEmail");
const {
  expertApprovedEmailHtml,
  expertApprovedEmailSubject,
} = require("./email_templates/expertApprovedEmail");
const {
  expertRejectedEmailHtml,
  expertRejectedEmailSubject,
} = require("./email_templates/expertRejectedEmail");
const {
  accountLockedEmailHtml,
  accountLockedEmailSubject,
} = require("./email_templates/accountLockedEmail");
const {
  otpEmailHtml,
  otpEmailSubject,
} = require("./email_templates/otpEmail");
const {
  passwordChangedEmailHtml,
  passwordChangedEmailSubject,
} = require("./email_templates/passwordChangedEmail");

const BREVO_API_URL     = 'https://api.brevo.com/v3/smtp/email';
const BREVO_SMS_API_URL = 'https://api.brevo.com/v3/transactionalSMS/send';

// ─── Sender identities ────────────────────────────────────────────────────────
// Transactional (confirmations, verification, OTP, refunds, reminders, etc.)
const SENDER_NOTIFICATIONS = {
  name:  'Sage Nest Notifications',
  email: process.env.EMAIL_FROM_NOTIFICATIONS,
};
// Marketing / promotional campaigns only
const SENDER_MARKETING = {
  name:  'Sage Nest',
  email: process.env.EMAIL_FROM_MARKETING,
};

// Contact email shown inside transactional email bodies (mailto links / "contact us" text)
const CONTACT_EMAIL = process.env.EMAIL_FROM_NOTIFICATIONS;
// "Questions? Contact us at ..." lines point at the monitored support mailbox,
// distinct from the notifications address the email is actually sent from.
const SUPPORT_EMAIL = process.env.EMAIL_FROM_MARKETING || CONTACT_EMAIL;

// ─── Verify config (call once at server startup) ──────────────────────────────
const verifyEmailConnection = async () => {
  const missing = ['BREVO_API_KEY', 'EMAIL_FROM_NOTIFICATIONS'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.warn(`⚠️  Brevo not configured — missing env vars: ${missing.join(', ')}`);
    return;
  }
  console.log(`✅ Brevo API configured — transactional: ${SENDER_NOTIFICATIONS.email}`);
  if (process.env.EMAIL_FROM_MARKETING) {
    console.log(`✅ Brevo API configured — marketing: ${SENDER_MARKETING.email}`);
  }
};

// ─── Base sender ─────────────────────────────────────────────────────────────
/**
 * @param {{ to: string, subject: string, html: string, text?: string, sender?: { name: string, email: string } }} options
 */
const sendEmail = async ({ to, subject, html, text, sender = SENDER_NOTIFICATIONS }) => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Brevo not configured — missing BREVO_API_KEY env var');
  }

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept':       'application/json',
      'content-type': 'application/json',
      'api-key':      process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender,
      to:          [{ email: to }],
      subject,
      textContent: text || subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }
};

// ─── Marketing sender (campaigns only) ───────────────────────────────────────
/**
 * Use this for promotional / marketing emails only.
 * Sender: "Sage Nest" <hello@sagenest.org>
 * @param {{ to: string, subject: string, html: string, text?: string }} options
 */
const sendMarketingEmail = (options) => sendEmail({ ...options, sender: SENDER_MARKETING });


// ─── HTML layout wrapper ──────────────────────────────────────────────────────
const layout = (bodyContent) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sage Nest</title>
</head>
<body style="margin:0;padding:0;background:#F5F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="${process.env.CLIENT_URL}/assets/images/Sage-Nest_Final.png" alt="Sage Nest" width="60" style="display:block;width:60px;height:auto;border:0;margin:0 auto;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #E4E7E4;padding:40px 36px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0 0 4px;font-size:12px;color:#5e6d5b;">Sage Nest ApS &middot; CVR 46566181 &middot; Copenhagen, Denmark</p>
              <p style="margin:0 0 8px;font-size:12px;color:#5e6d5b;">Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#445446;">${SUPPORT_EMAIL}</a></p>
              <p style="margin:0;font-size:11px;color:#9aa596;">This is a transactional message about your account, sent from ${CONTACT_EMAIL}.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ─── Button helper ────────────────────────────────────────────────────────────
const btn = (href, label) =>
  `<a href="${href}" style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;margin-top:8px;">${label}</a>`;

// ─── Template senders ─────────────────────────────────────────────────────────

/**
 * Welcome email after successful registration.
 * @param {{ to: string, name: string, role: 'EXPERT'|'PARENT', language?: 'en' | 'it' }} param0
 */
const sendWelcomeEmail = ({ to, name, role, language }) => {
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${name}, benvenuto/a su Sage Nest!`
      : `Hi ${name}, welcome to Sage Nest!`;
  return sendEmail({
    to,
    subject: welcomeEmailSubject({ language: lang }),
    text,
    html: welcomeEmailHtml({ name, role, language: lang, clientUrl: process.env.CLIENT_URL, contactEmail: CONTACT_EMAIL, supportEmail: SUPPORT_EMAIL }),
  });
};

/**
 * Non-blocking notice that a legal document (Terms & Conditions or Privacy Policy)
 * has been updated. Informational only — no acceptance is requested by this email;
 * the user will formally (re-)accept the next time they complete a booking.
 * @param {{
 *   to: string, name: string, docType: 'PRIVACY_POLICY' | 'TERMS_CONDITIONS',
 *   effectiveDate: Date, docUrl?: string|null, language?: 'en' | 'it',
 * }} param0
 */
const sendLegalDocumentUpdatedEmail = ({ to, name, docType, effectiveDate, docUrl, language }) => {
  const lang = language === "it" ? "it" : "en";
  const dateStr = new Date(effectiveDate).toLocaleDateString(lang === "it" ? "it-IT" : "en-GB", {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const text =
    lang === "it"
      ? `Ciao ${name}, abbiamo aggiornato un documento legale, con effetto dal ${dateStr}. ${docUrl ? `Consultalo qui: ${docUrl}` : ''}`
      : `Hi ${name}, we've updated a legal document, effective ${dateStr}. ${docUrl ? `View it here: ${docUrl}` : ''}`;

  return sendEmail({
    to,
    subject: legalDocumentUpdatedEmailSubject({ language: lang, docType }),
    text,
    html: legalDocumentUpdatedEmailHtml({ name, docType, effectiveDate, docUrl, language: lang, clientUrl: process.env.CLIENT_URL, contactEmail: CONTACT_EMAIL, supportEmail: SUPPORT_EMAIL }),
  });
};

/**
 * Notify an expert that their profile has been approved.
 * @param {{ to: string, name: string, language?: 'en' | 'it' }} param0
 */
const sendExpertApprovedEmail = ({ to, name, language }) => {
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${name}, ottime notizie — il tuo profilo professionista è stato approvato. Ora puoi ricevere prenotazioni.`
      : `Hi ${name}, great news — your expert profile has been approved. You can now receive bookings.`;
  return sendEmail({
    to,
    subject: expertApprovedEmailSubject({ language: lang }),
    text,
    html: expertApprovedEmailHtml({ name, language: lang, clientUrl: process.env.CLIENT_URL, contactEmail: CONTACT_EMAIL, supportEmail: SUPPORT_EMAIL }),
  });
};

/**
 * Notify an expert that their profile has been rejected.
 * @param {{ to: string, name: string, reason?: string, language?: 'en' | 'it' }} param0
 */
const sendExpertRejectedEmail = ({ to, name, reason, language }) => {
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${name}, purtroppo il tuo profilo professionista non è stato approvato al momento.${reason ? ` Motivo: ${reason}` : ""}`
      : `Hi ${name}, unfortunately your expert profile was not approved at this time.${reason ? ` Reason: ${reason}` : ""}`;
  return sendEmail({
    to,
    subject: expertRejectedEmailSubject({ language: lang }),
    text,
    html: expertRejectedEmailHtml({ name, reason, language: lang, clientUrl: process.env.CLIENT_URL, contactEmail: CONTACT_EMAIL, supportEmail: SUPPORT_EMAIL }),
  });
};

/**
 * Password reset email.
 * Template lives in email_templates/passwordResetEmail.js
 * @param {{ to: string, name: string, resetToken: string }} param0
 */
const sendPasswordResetEmail = ({ to, name, resetToken, language }) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${name}, reimposta la tua password qui (scade tra 1 ora): ${resetUrl}`
      : `Hi ${name}, reset your password here (expires in 1 hour): ${resetUrl}`;

  return sendEmail({
    to,
    subject: passwordResetEmailSubject({ language: lang }),
    text,
    html: passwordResetEmailHtml({ name, resetUrl, language: lang, clientUrl: process.env.CLIENT_URL, contactEmail: CONTACT_EMAIL, supportEmail: SUPPORT_EMAIL }),
  });
};

/**
 * Expert email verification.
 * Template lives in email_templates/verificationEmail.js
 * @param {{ to: string, name: string, userId: number, verificationCode: string }} param0
 */
const sendVerificationEmail = ({ to, name, userId, verificationCode, returnTo, language }) => {
  let verificationUrl =
    `${process.env.CLIENT_URL}/verify-email` +
    `?auth_user=true&userId=${userId}&verificationCode=${verificationCode}`;

  // Only embed relative paths — prevents open-redirect abuse
  if (returnTo && typeof returnTo === 'string' && returnTo.startsWith('/')) {
    verificationUrl += `&returnTo=${encodeURIComponent(returnTo)}`;
  }

  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${name}, verifica la tua email: ${verificationUrl}`
      : `Hi ${name}, please verify your email: ${verificationUrl}`;

  return sendEmail({
    to,
    subject: verificationEmailSubject({ language: lang }),
    text,
    html: verificationEmailHtml({ name, verificationUrl, language: lang, clientUrl: process.env.CLIENT_URL, contactEmail: CONTACT_EMAIL, supportEmail: SUPPORT_EMAIL }),
  });
};

/**
 * Booking confirmation email — sent to the parent after webhook confirms payment,
 * and re-sent (with updated details) after a reschedule.
 * @param {{
 *   to: string, name: string, expertName: string,
 *   serviceTitle: string, format: string,
 *   scheduledAt: Date, durationMinutes: number,
 *   location?: string, language?: 'en' | 'it',
 *   amount?: number | string | null, currency?: string,
 *   userTimezone?: string | null, withdrawalApplicable?: boolean,
 *   termsUrl: string, policyUrl: string, privacyUrl: string,
 * }} param0
 */
const sendBookingConfirmationEmail = ({
  to,
  name,
  expertName,
  serviceTitle,
  format,
  scheduledAt,
  durationMinutes,
  location,
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
  return sendEmail({
    to,
    subject: bookingConfirmationEmailSubject({ language: lang, serviceTitle, expertName, scheduledAt, userTimezone }),
    text:
      lang === "it"
        ? `Ciao ${name}, la tua prenotazione per ${serviceTitle} il ${new Date(scheduledAt).toLocaleDateString("it-IT")} è confermata.`
        : `Hi ${name}, your booking for ${serviceTitle} on ${new Date(scheduledAt).toLocaleDateString("en-GB")} is confirmed.`,
    html: bookingConfirmationEmailHtml({
      name,
      expertName,
      serviceTitle,
      format,
      scheduledAt,
      durationMinutes,
      location,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
      language: lang,
      amount,
      currency,
      userTimezone,
      withdrawalApplicable: !!withdrawalApplicable,
      bookingId,
      termsUrl,
      policyUrl,
      privacyUrl,
    }),
  });
};

/**
 * Cancellation notification email — sent to the expert when a parent cancels.
 * @param {{
 *   to: string, expertName: string, parentName: string,
 *   serviceTitle: string, format: string,
 *   scheduledAt: Date, cancellationReason?: string,
 *   refundPercent: 0 | 50 | 100, amount: number | string
 * }} param0
 */
const sendBookingCancellationNotification = ({
  to,
  expertName,
  parentName,
  serviceTitle,
  format,
  scheduledAt,
  cancellationReason,
  refundPercent,
  amount,
  currency = 'EUR',
  bookingId,
  timezone,
  language,
}) => {
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${expertName}, ${parentName} ha cancellato la prenotazione per ${serviceTitle}. Lo slot è stato liberato.`
      : `Hi ${expertName}, ${parentName} has cancelled their booking for ${serviceTitle}. The slot has been freed.`;
  return sendEmail({
    to,
    subject: cancellationNotificationEmailSubject({ language: lang, serviceTitle, scheduledAt, timezone }),
    text,
    html: cancellationNotificationEmailHtml({
      expertName,
      parentName,
      serviceTitle,
      format,
      scheduledAt,
      cancellationReason,
      refundPercent,
      amount,
      currency,
      bookingId,
      timezone,
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
    }),
  });
};

/**
 * New booking notification — sent to the expert when a booking is confirmed.
 * Follows the expert's own profile language, independent of the parent's locale.
 * @param {{
 *   to: string, expertName: string, parentName: string, parentEmail: string,
 *   serviceTitle: string, format: string, scheduledAt: Date, durationMinutes: number,
 *   location?: string, amount?: number | string | null, currency?: string,
 *   timezone?: string | null, language?: 'en' | 'it', policyUrl: string,
 * }} param0
 */
const sendNewBookingNotificationEmail = ({
  to,
  expertName,
  parentName,
  parentEmail,
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
  policyUrl,
}) => {
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${expertName?.split(' ')[0] || 'there'}, hai una nuova prenotazione: ${parentName} (${parentEmail}) ha prenotato ${serviceTitle} il ${new Date(scheduledAt).toLocaleDateString("it-IT")}.`
      : `Hi ${expertName?.split(' ')[0] || 'there'}, you have a new booking: ${parentName} (${parentEmail}) has booked ${serviceTitle} on ${new Date(scheduledAt).toLocaleDateString("en-GB")}.`;
  return sendEmail({
    to,
    subject: newBookingNotificationEmailSubject({ language: lang, serviceTitle, parentName, scheduledAt, timezone }),
    text,
    html: newBookingNotificationEmailHtml({
      expertName,
      parentName,
      parentEmail,
      serviceTitle,
      format,
      scheduledAt,
      durationMinutes,
      location,
      amount,
      currency,
      bookingId,
      timezone,
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
      policyUrl,
    }),
  });
};

/**
 * Session reminder — sent 24h and 1h before session to both parent and expert.
 * @param {{
 *   to: string, recipientName: string, role: 'parent'|'expert',
 *   otherPartyName: string, serviceTitle: string, format: string,
 *   scheduledAt: Date, durationMinutes: number,
 *   reminderType: '24h'|'1h', bookingId: number
 * }} param0
 */
const sendBookingReminderEmail = ({
  to,
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
}) => {
  const lang = language === "it" ? "it" : "en";
  const timeLabelEn = reminderType === "24h" ? "tomorrow" : "in 1 hour";
  const timeLabelIt = reminderType === "24h" ? "domani" : "tra 1 ora";
  const tz = timezone || "UTC";
  const timeStr = new Date(scheduledAt).toLocaleTimeString(lang === "it" ? "it-IT" : "en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: tz,
  });
  const text =
    lang === "it"
      ? `Ciao ${recipientName}, la tua sessione per ${serviceTitle} è ${timeLabelIt} alle ${timeStr} (${tz}).`
      : `Hi ${recipientName}, your session for ${serviceTitle} is ${timeLabelEn} at ${timeStr} (${tz}).`;
  return sendEmail({
    to,
    subject: bookingReminderEmailSubject({ language: lang, role, otherPartyName, reminderType }),
    text,
    html: bookingReminderEmailHtml({
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
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
    }),
  });
};

/**
 * Account locked notification — sent after 5 consecutive failed login attempts.
 * @param {{ to: string, name: string, unlockAt: Date, language?: 'en' | 'it' }} param0
 */
const sendAccountLockedEmail = ({ to, name, unlockAt, language }) => {
  const lang = language === "it" ? "it" : "en";
  const unlockTime = new Date(unlockAt).toLocaleString(lang === "it" ? "it-IT" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const text =
    lang === "it"
      ? `Ciao ${name}, il tuo account è stato bloccato per 15 minuti a causa di troppi tentativi di accesso falliti. Si sbloccherà alle ${unlockTime}.`
      : `Hi ${name}, your account has been locked for 15 minutes due to too many failed login attempts. It will unlock at ${unlockTime}.`;
  return sendEmail({
    to,
    subject: accountLockedEmailSubject({ language: lang }),
    text,
    html: accountLockedEmailHtml({ name, unlockAt, language: lang, clientUrl: process.env.CLIENT_URL, contactEmail: CONTACT_EMAIL, supportEmail: SUPPORT_EMAIL }),
  });
};

/**
 * Notify a parent that a refund has been issued for their booking.
 * @param {{
 *   to: string, parentName: string, expertName: string,
 *   serviceTitle: string, scheduledAt: Date,
 *   refundAmount: number, isPartial: boolean,
 *   reason?: string, bookingId: number
 * }} param0
 */
const sendRefundNotificationToParent = ({
  to,
  parentName,
  expertName,
  serviceTitle,
  scheduledAt,
  refundAmount,
  currency = 'EUR',
  isPartial,
  reason,
  bookingId,
  timezone,
  language,
}) => {
  const lang = language === "it" ? "it" : "en";
  const locale = lang === "it" ? "it-IT" : "en-GB";
  const amountStr = new Intl.NumberFormat(locale, { style: 'currency', currency }).format(parseFloat(refundAmount));
  const text =
    lang === "it"
      ? `Ciao ${parentName}, un rimborso ${isPartial ? "parziale" : "completo"} di ${amountStr} è stato emesso per la tua prenotazione #${bookingId} con ${expertName}. L'importo sarà visibile entro 5–10 giorni lavorativi.`
      : `Hi ${parentName}, a ${isPartial ? "partial" : "full"} refund of ${amountStr} has been issued for your booking #${bookingId} with ${expertName}. Funds will appear within 3–5 business days.`;
  return sendEmail({
    to,
    subject: refundParentEmailSubject({ language: lang, bookingId }),
    text,
    html: refundParentEmailHtml({
      parentName,
      expertName,
      serviceTitle,
      scheduledAt,
      refundAmount,
      currency,
      isPartial,
      reason,
      bookingId,
      timezone,
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
    }),
  });
};

/**
 * Notify an expert that a refund has been issued for one of their bookings.
 * @param {{
 *   to: string, expertName: string, parentName: string,
 *   serviceTitle: string, scheduledAt: Date,
 *   refundAmount: number, isPartial: boolean, bookingId: number,
 *   timezone?: string | null, language?: 'en' | 'it'
 * }} param0
 */
const sendRefundNotificationToExpert = ({
  to,
  expertName,
  parentName,
  serviceTitle,
  scheduledAt,
  refundAmount,
  currency = 'EUR',
  isPartial,
  bookingId,
  timezone,
  language,
}) => {
  const lang = language === "it" ? "it" : "en";
  const locale = lang === "it" ? "it-IT" : "en-GB";
  const amountStr = new Intl.NumberFormat(locale, { style: 'currency', currency }).format(parseFloat(refundAmount));
  const text =
    lang === "it"
      ? `Ciao ${expertName?.split(' ')[0] || 'there'}, un rimborso ${isPartial ? "parziale" : "completo"} di ${amountStr} è stato emesso a ${parentName} per la prenotazione #${bookingId}. ${isPartial ? "Il saldo residuo non verrà corrisposto automaticamente." : "Il compenso per questa prenotazione non verrà corrisposto."}`
      : `Hi ${expertName?.split(' ')[0] || 'there'}, a ${isPartial ? "partial" : "full"} refund of ${amountStr} has been issued to ${parentName} for booking #${bookingId}. ${isPartial ? "The remaining balance for this booking will not be paid out automatically." : "The payout for this booking will not be processed."}`;
  return sendEmail({
    to,
    subject: refundExpertEmailSubject({ language: lang, bookingId }),
    text,
    html: refundExpertEmailHtml({
      expertName,
      parentName,
      serviceTitle,
      scheduledAt,
      refundAmount,
      currency,
      isPartial,
      bookingId,
      timezone,
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
    }),
  });
};

/**
 * Reschedule notification — sent to the expert when a parent reschedules.
 * @param {{
 *   to: string, expertName: string, parentName: string, parentEmail: string,
 *   serviceTitle: string, format: 'ONLINE'|'IN_PERSON',
 *   previousScheduledAt: Date, newScheduledAt: Date,
 *   durationMinutes: number, bookingId: number
 * }} param0
 */
const sendRescheduleNotificationEmail = ({
  to,
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
}) => {
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${expertName}, ${parentName} ha riprogrammato la prenotazione per ${serviceTitle}. Il nuovo orario è ${new Date(newScheduledAt).toLocaleString("it-IT", { timeZone: timezone || "UTC" })}.`
      : `Hi ${expertName}, ${parentName} has rescheduled their booking for ${serviceTitle}. The new time is ${new Date(newScheduledAt).toLocaleString("en-GB", { timeZone: timezone || "UTC" })}.`;
  return sendEmail({
    to,
    subject: rescheduleNotificationEmailSubject({ language: lang, parentName }),
    text,
    html: rescheduleNotificationEmailHtml({
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
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
    }),
  });
};

/**
 * Admin-triggered: notify a specialist that changes are required before approval.
 * @param {{ to: string, name: string, note: string }} param0
 */
const sendChangesRequestedEmail = ({ to, name, note, language }) => {
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${name}, il nostro team ha esaminato il tuo profilo e ha richiesto alcune modifiche. Feedback: ${note}`
      : `Hi ${name}, our team has reviewed your profile and has requested some changes. Feedback: ${note}`;
  return sendEmail({
    to,
    subject: changesRequestedEmailSubject({ language: lang }),
    text,
    html: changesRequestedEmailHtml({
      name,
      note,
      dashboardUrl: `${process.env.CLIENT_URL}/dashboard/expert/profile`,
      clientUrl: process.env.CLIENT_URL,
      language: lang,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
    }),
  });
};

/**
 * Email address change — re-verification after parent updates their email.
 * Uses the same verify-email endpoint but with distinct subject + body copy.
 * @param {{ to: string, name: string, userId: number, verificationCode: string }} param0
 */
const sendEmailChangeVerification = ({
  to,
  name,
  userId,
  verificationCode,
  language,
}) => {
  const verificationUrl =
    `${process.env.CLIENT_URL}/verify-email` +
    `?auth_user=true&userId=${userId}&verificationCode=${verificationCode}`;
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${name}, verifica il tuo nuovo indirizzo email: ${verificationUrl} (scade tra 24 ore)`
      : `Hi ${name}, please verify your new email address: ${verificationUrl} (expires in 24 hours)`;

  return sendEmail({
    to,
    subject: verificationEmailSubject({ language: lang, variant: "emailChange" }),
    text,
    html: verificationEmailHtml({
      name,
      verificationUrl,
      variant: "emailChange",
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
    }),
  });
};

/**
 * OTP email — subject and body copy vary by purpose.
 * @param {{ to: string, name: string, code: string, purpose: 'login'|'enable_2fa'|'disable_2fa', language?: 'en' | 'it' }} param0
 */
const sendOtpEmail = ({ to, name, code, purpose = "login", language }) => {
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${name}, inserisci questo codice.\n\nIl tuo codice: ${code}\n\nValido per 5 minuti. Utilizzabile una sola volta. Non condividere questo codice.`
      : `Hi ${name}, enter this code.\n\nYour code: ${code}\n\nValid for 5 minutes. Single use only. Do not share this code.`;
  return sendEmail({
    to,
    subject: otpEmailSubject({ language: lang, purpose }),
    text,
    html: otpEmailHtml({ name, code, purpose, language: lang, clientUrl: process.env.CLIENT_URL, contactEmail: CONTACT_EMAIL, supportEmail: SUPPORT_EMAIL }),
  });
};

/**
 * Notification sent to a user after a successful password change.
 * @param {{ to: string, name: string, language?: 'en' | 'it' }} param0
 */
const sendPasswordChangedEmail = ({ to, name, language }) => {
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${name}, la tua password è stata appena modificata. Se non sei stato tu, reimpostala immediatamente.`
      : `Hi ${name}, your password was just changed. If this wasn't you, reset your password immediately.`;
  return sendEmail({
    to,
    subject: passwordChangedEmailSubject({ language: lang }),
    text,
    html: passwordChangedEmailHtml({ name, language: lang, clientUrl: process.env.CLIENT_URL, contactEmail: CONTACT_EMAIL, supportEmail: SUPPORT_EMAIL }),
  });
};

/**
 * Expert-cancelled session email — sent to the parent when an expert cancels.
 * A full refund is always issued in this scenario. Only call this once the
 * refund has actually succeeded — never assert a refund the system hasn't
 * completed yet.
 * @param {{
 *   to: string, parentName: string, expertName: string,
 *   serviceTitle: string, scheduledAt: Date, amount: number, bookingId: number,
 *   timezone?: string | null, language?: 'en' | 'it'
 * }} param0
 */
const sendExpertCancelledSessionEmail = ({
  to,
  parentName,
  expertName,
  serviceTitle,
  scheduledAt,
  amount,
  currency = 'EUR',
  bookingId,
  timezone,
  language,
}) => {
  const lang = language === "it" ? "it" : "en";
  const locale = lang === "it" ? "it-IT" : "en-GB";
  const amountStr = new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(amount));
  const text =
    lang === "it"
      ? `Ciao ${parentName.split(' ')[0]}, ci dispiace informarti che ${expertName.split(' ')[0]} ha dovuto cancellare la tua prossima sessione. Ti abbiamo rimborsato l'intero importo di ${amountStr}.`
      : `Hi ${parentName.split(' ')[0]}, we are sorry to let you know that ${expertName.split(' ')[0]} has had to cancel your upcoming session. A full refund of ${amountStr} has been issued to your original payment method.`;
  return sendEmail({
    to,
    subject: expertCancelledSessionEmailSubject({ language: lang, serviceTitle, scheduledAt, timezone }),
    text,
    html: expertCancelledSessionEmailHtml({
      parentName,
      expertName,
      serviceTitle,
      scheduledAt,
      amount,
      currency,
      bookingId,
      timezone,
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
    }),
  });
};

/**
 * Confirmation sent to an expert after they cancel one of their own sessions
 * — their durable record that the parent was notified and refunded in full,
 * and no payout will be made. Only call once the parent's refund has
 * actually succeeded — shares its trigger point with sendExpertCancelledSessionEmail.
 * @param {{
 *   to: string, expertName: string, parentName: string, serviceTitle: string,
 *   scheduledAt: Date, bookingId: number, timezone?: string | null,
 *   language?: 'en' | 'it'
 * }} param0
 */
const sendExpertCancellationConfirmationEmail = ({
  to,
  expertName,
  parentName,
  serviceTitle,
  scheduledAt,
  bookingId,
  timezone,
  language,
}) => {
  const lang = language === "it" ? "it" : "en";
  return sendEmail({
    to,
    subject: expertCancellationConfirmationEmailSubject({ language: lang, serviceTitle, parentName, scheduledAt, timezone }),
    text:
      lang === "it"
        ? `Ciao ${expertName?.split(' ')[0] || 'there'}, ti confermiamo la cancellazione della sessione (${serviceTitle}, prenotazione #${bookingId}) con ${parentName}. Il genitore è stato rimborsato integralmente; non verrà corrisposto alcun compenso per questa prenotazione.`
        : `Hi ${expertName?.split(' ')[0] || 'there'}, this confirms that you have cancelled the session (${serviceTitle}, booking #${bookingId}) with ${parentName}. The parent has been refunded in full; no payout will be made for this booking.`,
    html: expertCancellationConfirmationEmailHtml({
      expertName,
      parentName,
      serviceTitle,
      scheduledAt,
      bookingId,
      timezone,
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
    }),
  });
};

// ─── Parent suspension emails ─────────────────────────────────────────────────

const sendParentSuspendedEmail = ({ to, parentName, cancelledBookingCount, language }) => {
  const lang = language === "it" ? "it" : "en";
  const text =
    lang === "it"
      ? `Ciao ${parentName?.split(' ')[0] || 'there'}, il tuo account Sage Nest è stato sospeso. ${cancelledBookingCount > 0 ? `${cancelledBookingCount} sessione/i in programma sono state cancellate e rimborsate ove applicabile.` : ''} Se ritieni si tratti di un errore, contattaci a ${SUPPORT_EMAIL}.`
      : `Hi ${parentName?.split(' ')[0] || 'there'}, your Sage Nest account has been suspended. ${cancelledBookingCount > 0 ? `${cancelledBookingCount} upcoming session${cancelledBookingCount !== 1 ? 's have' : ' has'} been cancelled and a full refund issued where applicable.` : ''} If you believe this is an error, contact us at ${SUPPORT_EMAIL}.`;
  return sendEmail({
    to,
    subject: parentSuspendedEmailSubject({ language: lang }),
    text,
    html: parentSuspendedEmailHtml({
      parentName,
      cancelledBookingCount,
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
    }),
  });
};

/**
 * Notify an expert that Sage Nest itself (not the parent) cancelled one of
 * their upcoming bookings — either because the parent's account was
 * suspended/GDPR-deleted, or because an admin cancelled the booking directly
 * from Booking Management.
 * @param {{
 *   to: string, expertName: string, parentName: string, serviceTitle: string,
 *   scheduledAt: Date, bookingId: number, timezone?: string | null,
 *   language?: 'en' | 'it', policyUrl: string,
 *   cancellationType?: 'account_closure' | 'admin_cancelled', adminReason?: string | null,
 * }} param0
 */
const sendPlatformCancellationEmailToExpert = ({
  to,
  expertName,
  parentName,
  serviceTitle,
  scheduledAt,
  bookingId,
  timezone,
  language,
  policyUrl,
  cancellationType = "account_closure",
  adminReason,
}) => {
  const lang = language === "it" ? "it" : "en";
  const dateStr = new Date(scheduledAt).toLocaleDateString(lang === "it" ? "it-IT" : "en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const reasonText =
    cancellationType === "admin_cancelled"
      ? ""
      : lang === "it"
        ? " perché l'account del genitore non è più attivo sulla piattaforma"
        : " because the parent's account is no longer active on the platform";
  return sendEmail({
    to,
    subject: platformCancellationEmailSubject({ language: lang, serviceTitle, parentName, scheduledAt, timezone }),
    text:
      lang === "it"
        ? `Ciao ${expertName?.split(' ')[0] || 'there'}, una sessione in programma (${serviceTitle}, ${dateStr}, prenotazione ${bookingId}) è stata cancellata da Sage Nest${reasonText}.`
        : `Hi ${expertName?.split(' ')[0] || 'there'}, an upcoming session (${serviceTitle}, ${dateStr}, booking #${bookingId}) has been cancelled by Sage Nest${reasonText}.`,
    html: platformCancellationEmailHtml({
      expertName,
      parentName,
      serviceTitle,
      scheduledAt,
      bookingId,
      timezone,
      language: lang,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
      supportEmail: SUPPORT_EMAIL,
      policyUrl,
      cancellationType,
      adminReason,
    }),
  });
};

// ─── Internal ops alert — payout / balance issues ────────────────────────────
// Sent to ADMIN_ALERT_EMAIL (or falls back to EMAIL_FROM_NOTIFICATIONS) whenever
// an expert's connected account has a payout failure or negative balance.
const sendAdminPayoutAlert = ({ subject, body, stripeAccountId, expertName, bookingId }) => {
  const adminTo = process.env.ADMIN_ALERT_EMAIL || process.env.EMAIL_FROM_NOTIFICATIONS;
  if (!adminTo) {
    console.error('[Email] sendAdminPayoutAlert: no recipient configured (set ADMIN_ALERT_EMAIL)');
    return Promise.resolve();
  }
  const rows = [
    expertName    && `<tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Expert</td><td style="padding:4px 0 4px 16px;font-size:13px;color:#1F2933;font-weight:600;">${expertName}</td></tr>`,
    stripeAccountId && `<tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Stripe account</td><td style="padding:4px 0 4px 16px;font-size:13px;color:#1F2933;font-family:monospace;">${stripeAccountId}</td></tr>`,
    bookingId     && `<tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Booking #</td><td style="padding:4px 0 4px 16px;font-size:13px;color:#1F2933;">${bookingId}</td></tr>`,
  ].filter(Boolean).join('');

  return sendEmail({
    to: adminTo,
    subject: `[Sage Nest Ops] ${subject}`,
    text: `${subject}\n\n${body}${stripeAccountId ? `\n\nStripe account: ${stripeAccountId}` : ''}${bookingId ? `\nBooking: #${bookingId}` : ''}`,
    html: layout(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#EF4444;">Operator Alert</p>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1F2933;">${subject}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#4B5563;line-height:1.6;">${body}</p>
      ${rows ? `<table style="border-collapse:collapse;width:100%;margin-bottom:24px;">${rows}</table>` : ''}
      <p style="margin:0;font-size:12px;color:#9CA3AF;">This is an automated alert from the Sage Nest platform. Please review the Stripe dashboard and take action.</p>
    `),
  });
};

// ─── Webflow sync failure alerts ───────────────────────────────────────────────
// Fires when an app→Webflow sync exhausts all retries and lands in the dead-letter
// queue, or when that queue grows past a configured threshold — see webflow.service.js
// and jobs/webflowSyncJob.js.
const sendWebflowSyncFailureAlert = ({ entityType, entityId, lastError, attempts }) => {
  const adminTo = process.env.ADMIN_ALERT_EMAIL || process.env.EMAIL_FROM_NOTIFICATIONS;
  if (!adminTo) {
    console.error('[Email] sendWebflowSyncFailureAlert: no recipient configured (set ADMIN_ALERT_EMAIL)');
    return Promise.resolve();
  }
  const subject = `Webflow sync failed after ${attempts} attempts — ${entityType} #${entityId}`;
  const rows = [
    `<tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Entity</td><td style="padding:4px 0 4px 16px;font-size:13px;color:#1F2933;font-weight:600;">${entityType} #${entityId}</td></tr>`,
    `<tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Attempts</td><td style="padding:4px 0 4px 16px;font-size:13px;color:#1F2933;">${attempts}</td></tr>`,
    `<tr><td style="padding:4px 0;color:#6B7280;font-size:13px;">Last error</td><td style="padding:4px 0 4px 16px;font-size:13px;color:#1F2933;font-family:monospace;">${lastError}</td></tr>`,
  ].join('');

  return sendEmail({
    to: adminTo,
    subject: `[Sage Nest Ops] ${subject}`,
    text: `${subject}\n\nEntity: ${entityType} #${entityId}\nAttempts: ${attempts}\nLast error: ${lastError}`,
    html: layout(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#EF4444;">Operator Alert</p>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1F2933;">${subject}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#4B5563;line-height:1.6;">This item has been moved to the Webflow sync dead-letter queue and needs manual re-sync from the admin dashboard.</p>
      <table style="border-collapse:collapse;width:100%;margin-bottom:24px;">${rows}</table>
      <p style="margin:0;font-size:12px;color:#9CA3AF;">This is an automated alert from the Sage Nest platform. Review the Webflow Sync Health panel in the admin dashboard.</p>
    `),
  });
};

const sendWebflowQueueThresholdAlert = ({ pendingCount, threshold }) => {
  const adminTo = process.env.ADMIN_ALERT_EMAIL || process.env.EMAIL_FROM_NOTIFICATIONS;
  if (!adminTo) {
    console.error('[Email] sendWebflowQueueThresholdAlert: no recipient configured (set ADMIN_ALERT_EMAIL)');
    return Promise.resolve();
  }
  const subject = `Webflow sync failure queue exceeds threshold (${pendingCount}/${threshold})`;

  return sendEmail({
    to: adminTo,
    subject: `[Sage Nest Ops] ${subject}`,
    text: `${subject}\n\n${pendingCount} items are pending retry in the Webflow sync dead-letter queue, above the configured threshold of ${threshold}.`,
    html: layout(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#EF4444;">Operator Alert</p>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1F2933;">${subject}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#4B5563;line-height:1.6;">${pendingCount} items are pending retry in the Webflow sync dead-letter queue, above the configured threshold of ${threshold}. This usually means a systemic issue (bad token, Webflow outage, rate limiting) rather than isolated item failures.</p>
      <p style="margin:0;font-size:12px;color:#9CA3AF;">This is an automated alert from the Sage Nest platform. Review the Webflow Sync Health panel in the admin dashboard.</p>
    `),
  });
};

// ─── Brevo Transactional SMS ──────────────────────────────────────────────────
// Sends a transactional SMS via Brevo SMS API.
// Throws on API error; caller decides how to handle failure.
const sendSms = async ({ to, message }) => {
  const sender = process.env.BREVO_SMS_SENDER;
  if (!sender) throw new Error('BREVO_SMS_SENDER not configured');
  if (!process.env.BREVO_API_KEY) throw new Error('BREVO_API_KEY not configured');

  const res = await fetch(BREVO_SMS_API_URL, {
    method: 'POST',
    headers: {
      'accept':       'application/json',
      'content-type': 'application/json',
      'api-key':      process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender,
      recipient: to,
      content:   message,
      type:      'transactional',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo SMS API error ${res.status}: ${body}`);
  }
};

// ─── "I'm Late" notification ──────────────────────────────────────────────────
// Fires an email to the expert and, if the expert has a phone and SMS is
// configured, an SMS as well.
// Returns { emailStatus, smsStatus, emailError, smsError }.
const sendImLateNotification = async ({
  expertEmail,
  expertPhone,
  expertName,
  expertTimezone,
  parentName,
  serviceTitle,
  scheduledAt,
  delayMinutes,
  note,
  language,
}) => {
  const lang         = language === "it" ? "it" : "en";
  const clientUrl    = process.env.CLIENT_URL    || '';
  const contactEmail = process.env.EMAIL_FROM_NOTIFICATIONS || '';
  const supportEmail = SUPPORT_EMAIL;

  let emailStatus = 'failed';
  let emailError  = null;
  let smsStatus   = expertPhone ? 'failed' : 'no_phone';
  let smsError    = null;

  // Primary channel: email (always attempted)
  try {
    await sendEmail({
      to:      expertEmail,
      subject: imLateEmailSubject({ language: lang, parentName, delayMinutes }),
      html:    imLateEmailHtml({
        expertName,
        parentName,
        serviceTitle,
        scheduledAt,
        timezone: expertTimezone,
        delayMinutes,
        note,
        language: lang,
        clientUrl,
        contactEmail,
        supportEmail,
      }),
      text:
        lang === "it"
          ? `Ciao ${expertName}, il tuo cliente ${parentName} è in ritardo di circa ${delayMinutes} minuto/i per la sessione (${serviceTitle}).${note ? ` Il suo messaggio: "${note}"` : ''} Attendi con calma.`
          : `Hi ${expertName}, your client ${parentName} is running approximately ${delayMinutes} minute(s) late for your session (${serviceTitle}).${note ? ` Their message: "${note}"` : ''} Please hold tight.`,
    });
    emailStatus = 'sent';
  } catch (err) {
    emailError = err.message;
    console.error('[ImLate] Email send failed:', err.message);
  }

  // Secondary channel: SMS (only if expert has phone AND SMS is configured)
  if (expertPhone && process.env.BREVO_SMS_SENDER) {
    const noteSnippet = note ? ` Msg: "${note.slice(0, 50)}${note.length > 50 ? '…' : ''}"` : '';
    const smsText = `Sage Nest: ${parentName} will be ~${delayMinutes}min late for your session.${noteSnippet}`;
    try {
      await sendSms({ to: expertPhone, message: smsText });
      smsStatus = 'sent';
    } catch (err) {
      smsStatus = 'failed';
      smsError  = err.message;
      console.error('[ImLate] SMS send failed:', err.message);
    }
  } else if (!process.env.BREVO_SMS_SENDER) {
    smsStatus = 'not_configured';
  }

  return { emailStatus, smsStatus, emailError, smsError };
};

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  sendEmail,
  sendMarketingEmail,
  verifyEmailConnection,
  sendWelcomeEmail,
  sendLegalDocumentUpdatedEmail,
  sendExpertApprovedEmail,
  sendExpertRejectedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendBookingConfirmationEmail,
  sendNewBookingNotificationEmail,
  sendBookingReminderEmail,
  sendBookingCancellationNotification,
  sendAccountLockedEmail,
  sendEmailChangeVerification,
  sendChangesRequestedEmail,
  sendRefundNotificationToParent,
  sendRefundNotificationToExpert,
  sendRescheduleNotificationEmail,
  sendOtpEmail,
  sendPasswordChangedEmail,
  sendExpertCancelledSessionEmail,
  sendExpertCancellationConfirmationEmail,
  sendParentSuspendedEmail,
  sendPlatformCancellationEmailToExpert,
  sendAdminPayoutAlert,
  sendImLateNotification,
  sendWebflowSyncFailureAlert,
  sendWebflowQueueThresholdAlert,
};
