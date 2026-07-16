const {
  verificationEmailHtml,
} = require("./email_templates/verificationEmail");
const {
  passwordResetEmailHtml,
} = require("./email_templates/passwordResetEmail");
const {
  bookingConfirmationEmailHtml,
} = require("./email_templates/bookingConfirmationEmail");
const {
  cancellationNotificationEmailHtml,
} = require("./email_templates/cancellationNotificationEmail");
const {
  newBookingNotificationEmailHtml,
} = require("./email_templates/newBookingNotificationEmail");
const {
  bookingReminderEmailHtml,
} = require("./email_templates/bookingReminderEmail");
const {
  changesRequestedEmailHtml,
} = require("./email_templates/changesRequestedEmail");
const {
  refundParentEmailHtml,
} = require("./email_templates/refundParentEmail");
const {
  refundExpertEmailHtml,
} = require("./email_templates/refundExpertEmail");
const {
  rescheduleNotificationEmailHtml,
} = require("./email_templates/rescheduleNotificationEmail");
const {
  expertCancelledSessionEmailHtml,
} = require("./email_templates/expertCancelledSessionEmail");
const {
  parentSuspendedEmailHtml,
} = require("./email_templates/parentSuspendedEmail");
const {
  expertBookingCancelledSuspensionEmailHtml,
} = require("./email_templates/expertBookingCancelledSuspensionEmail");
const {
  imLateEmailHtml,
} = require("./email_templates/imLateEmail");

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
              <p style="margin:0;font-size:12px;color:#9CA3AF;">
                © ${new Date().getFullYear()} Sage Nest. All rights reserved.
              </p>
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
 * @param {{ to: string, name: string, role: 'EXPERT'|'PARENT' }} param0
 */
const sendWelcomeEmail = ({ to, name, role }) => {
  const roleNote =
    role === "EXPERT"
      ? "Complete your profile and connect your Stripe account to start receiving bookings."
      : "Browse experts and book your first session whenever you're ready.";

  return sendEmail({
    to,
    subject: "Welcome to Sage Nest!",
    text: `Hi ${name}, welcome to Sage Nest! ${roleNote}`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F2933;">Welcome, ${name}!</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4B5563;line-height:1.6;">
        You're now part of Sage Nest — a community connecting families with trusted child-care experts.
      </p>
      <p style="margin:0 0 28px;font-size:14px;color:#6B7280;line-height:1.6;">
        ${roleNote}
      </p>
      ${btn(`${process.env.CLIENT_URL}/dashboard`, "Go to Dashboard")}
    `),
  });
};

/**
 * Non-blocking notice that a legal document (Terms & Conditions or Privacy Policy)
 * has been updated. Informational only — no acceptance is requested by this email;
 * the user will formally (re-)accept the next time they complete a booking.
 * @param {{ to: string, name: string, docLabel: string, effectiveDate: Date, docUrl?: string|null }} param0
 */
const sendLegalDocumentUpdatedEmail = ({ to, name, docLabel, effectiveDate, docUrl }) => {
  const dateStr = new Date(effectiveDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return sendEmail({
    to,
    subject: `We've updated our ${docLabel}`,
    text: `Hi ${name}, we've updated our ${docLabel}, effective ${dateStr}. ${docUrl ? `View it here: ${docUrl}` : ''}`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1F2933;">We've updated our ${docLabel}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#4B5563;line-height:1.6;">
        Hi ${name}, we wanted to let you know that our ${docLabel} has been updated, effective <strong>${dateStr}</strong>.
      </p>
      <p style="margin:0 0 28px;font-size:13px;color:#6B7280;line-height:1.6;">
        No action is needed right now — you'll be asked to confirm the current version the next time you complete a booking.
      </p>
      ${docUrl ? btn(docUrl, `View ${docLabel}`) : ''}
    `),
  });
};

/**
 * Notify an expert that their profile has been approved.
 * @param {{ to: string, name: string }} param0
 */
const sendExpertApprovedEmail = ({ to, name }) =>
  sendEmail({
    to,
    subject: "Your Sage Nest expert profile has been approved!",
    text: `Hi ${name}, great news — your expert profile has been approved. You can now receive bookings.`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F2933;">You're approved!</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4B5563;line-height:1.6;">
        Hi ${name}, your expert profile on Sage Nest has been reviewed and <strong>approved</strong>.
        Parents can now discover and book your services.
      </p>
      <p style="margin:0 0 28px;font-size:14px;color:#6B7280;line-height:1.6;">
        Make sure your availability is up to date so parents can find the right time to book with you.
      </p>
      ${btn(`${process.env.CLIENT_URL}/dashboard`, "View My Profile")}
    `),
  });

/**
 * Notify an expert that their profile has been rejected.
 * @param {{ to: string, name: string, reason?: string }} param0
 */
const sendExpertRejectedEmail = ({ to, name, reason }) =>
  sendEmail({
    to,
    subject: "Update on your Sage Nest expert application",
    text: `Hi ${name}, unfortunately your expert profile was not approved at this time.${
      reason ? ` Reason: ${reason}` : ""
    }`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F2933;">Application update</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4B5563;line-height:1.6;">
        Hi ${name}, after reviewing your application we're unable to approve your expert profile at this time.
      </p>
      ${
        reason
          ? `
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;"><strong>Reason:</strong> ${reason}</p>
      </div>`
          : ""
      }
      <p style="margin:0 0 28px;font-size:14px;color:#6B7280;line-height:1.6;">
        You're welcome to update your profile and reapply. If you have questions, please reach out to our support team.
      </p>
      ${btn(`${process.env.CLIENT_URL}/dashboard`, "Update My Profile")}
    `),
  });

/**
 * Password reset email.
 * Template lives in email_templates/passwordResetEmail.js
 * @param {{ to: string, name: string, resetToken: string }} param0
 */
const sendPasswordResetEmail = ({ to, name, resetToken }) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;

  return sendEmail({
    to,
    subject: "Reset your Sage Nest password",
    text: `Hi ${name}, reset your password here (expires in 1 hour): ${resetUrl}`,
    html: passwordResetEmailHtml({ name, resetUrl, clientUrl: process.env.CLIENT_URL }),
  });
};

/**
 * Expert email verification.
 * Template lives in email_templates/verificationEmail.js
 * @param {{ to: string, name: string, userId: number, verificationCode: string }} param0
 */
const sendVerificationEmail = ({ to, name, userId, verificationCode, returnTo }) => {
  let verificationUrl =
    `${process.env.CLIENT_URL}/verify-email` +
    `?auth_user=true&userId=${userId}&verificationCode=${verificationCode}`;

  // Only embed relative paths — prevents open-redirect abuse
  if (returnTo && typeof returnTo === 'string' && returnTo.startsWith('/')) {
    verificationUrl += `&returnTo=${encodeURIComponent(returnTo)}`;
  }

  return sendEmail({
    to,
    subject: "Verify your Sage Nest email address",
    text: `Hi ${name}, please verify your email: ${verificationUrl}`,
    html: verificationEmailHtml({ name, verificationUrl, clientUrl: process.env.CLIENT_URL }),
  });
};

/**
 * Booking confirmation email — sent to the parent after webhook confirms payment.
 * @param {{
 *   to: string, name: string, expertName: string,
 *   serviceTitle: string, format: string,
 *   scheduledAt: Date, durationMinutes: number,
 *   location?: string
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
}) =>
  sendEmail({
    to,
    subject: `Your booking is confirmed — ${serviceTitle} with ${expertName.split(' ')[0]}`,
    text: `Hi ${name}, your booking for ${serviceTitle} on ${new Date(
      scheduledAt
    ).toLocaleDateString("en-GB")} is confirmed.`,
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
    }),
  });

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
  timezone,
}) => {
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return sendEmail({
    to,
    subject: `Booking cancelled — ${serviceTitle} on ${dateStr}`,
    text: `Hi ${expertName}, ${parentName} has cancelled their booking for ${serviceTitle}. The slot has been freed.`,
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
      timezone,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
    }),
  });
};

/**
 * New booking notification — sent to the expert when a booking is confirmed.
 * @param {{
 *   to: string, expertName: string, parentName: string, parentEmail: string,
 *   serviceTitle: string, format: string,
 *   scheduledAt: Date, durationMinutes: number, bookingId: number
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
  bookingId,
  timezone,
}) =>
  sendEmail({
    to,
    subject: `New booking from ${parentName}`,
    text: `Hi ${expertName}, ${parentName} (${parentEmail}) has booked ${serviceTitle} on ${new Date(
      scheduledAt
    ).toLocaleDateString("en-GB")}.`,
    html: newBookingNotificationEmailHtml({
      expertName,
      parentName,
      parentEmail,
      serviceTitle,
      format,
      scheduledAt,
      durationMinutes,
      bookingId,
      timezone,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
    }),
  });

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
}) => {
  const timeLabel = reminderType === "24h" ? "tomorrow" : "in 1 hour";
  const tz = timezone || "UTC";
  const timeStr = new Date(scheduledAt).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: tz,
  });
  return sendEmail({
    to,
    subject:
      role === "parent"
        ? `Reminder: your session is ${timeLabel}`
        : `Reminder: upcoming session with ${otherPartyName} — ${timeLabel}`,
    text: `Hi ${recipientName}, your session for ${serviceTitle} is ${timeLabel} at ${timeStr} (${tz}).`,
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
      clientUrl: process.env.CLIENT_URL,
    }),
  });
};

/**
 * Account locked notification — sent after 5 consecutive failed login attempts.
 * @param {{ to: string, name: string, unlockAt: Date }} param0
 */
const sendAccountLockedEmail = ({ to, name, unlockAt }) => {
  const unlockTime = unlockAt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return sendEmail({
    to,
    subject: "Your Sage Nest account has been temporarily locked",
    text: `Hi ${name}, your account has been locked for 15 minutes due to too many failed login attempts. It will unlock at ${unlockTime}.`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F2933;">Account temporarily locked</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4B5563;line-height:1.6;">
        Hi ${name}, we detected 5 consecutive failed login attempts on your account and have temporarily locked it for <strong>15 minutes</strong>.
      </p>
      <p style="margin:0 0 28px;font-size:14px;color:#6B7280;line-height:1.6;">
        Your account will automatically unlock at <strong>${unlockTime}</strong>. If this wasn't you, we recommend resetting your password immediately.
      </p>
      ${btn(`${process.env.CLIENT_URL}/forgot-password`, "Reset My Password")}
    `),
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
}) => {
  const amountStr = new Intl.NumberFormat('en', { style: 'currency', currency }).format(parseFloat(refundAmount));
  return sendEmail({
    to,
    subject: `Your refund of ${amountStr} has been processed`,
    text: `Hi ${parentName}, a ${isPartial ? "partial" : "full"} refund of ${amountStr} has been issued for your booking #${bookingId} with ${expertName}. Funds will appear within 3–5 business days.`,
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
      clientUrl: process.env.CLIENT_URL,
    }),
  });
};

/**
 * Notify an expert that a refund has been issued for one of their bookings.
 * @param {{
 *   to: string, expertName: string, parentName: string,
 *   serviceTitle: string, scheduledAt: Date,
 *   refundAmount: number, isPartial: boolean, bookingId: number
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
}) => {
  const amountStr = new Intl.NumberFormat('en', { style: 'currency', currency }).format(parseFloat(refundAmount));
  return sendEmail({
    to,
    subject: `A refund has been issued for booking #${bookingId}`,
    text: `Hi ${expertName}, a ${isPartial ? "partial" : "full"} refund of ${amountStr} has been issued to ${parentName} for booking #${bookingId}. The payout for this booking will not be processed.`,
    html: refundExpertEmailHtml({
      expertName,
      parentName,
      serviceTitle,
      scheduledAt,
      refundAmount,
      currency,
      isPartial,
      bookingId,
      clientUrl: process.env.CLIENT_URL,
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
}) =>
  sendEmail({
    to,
    subject: `Booking rescheduled — ${parentName}`,
    text: `Hi ${expertName}, ${parentName} has rescheduled their booking for ${serviceTitle}. The new time is ${new Date(newScheduledAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC.`,
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
      clientUrl: process.env.CLIENT_URL,
    }),
  });

/**
 * Admin-triggered: notify a specialist that changes are required before approval.
 * @param {{ to: string, name: string, note: string }} param0
 */
const sendChangesRequestedEmail = ({ to, name, note }) =>
  sendEmail({
    to,
    subject: "Action required: please update your Sage Nest profile",
    text: `Hi ${name}, our team has reviewed your profile and has requested some changes. Feedback: ${note}`,
    html: changesRequestedEmailHtml({
      name,
      note,
      dashboardUrl: `${process.env.CLIENT_URL}/dashboard/expert/profile`,
      clientUrl: process.env.CLIENT_URL,
    }),
  });

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
}) => {
  const verificationUrl =
    `${process.env.CLIENT_URL}/verify-email` +
    `?auth_user=true&userId=${userId}&verificationCode=${verificationCode}`;

  return sendEmail({
    to,
    subject: "Verify your new Sage Nest email address",
    text: `Hi ${name}, please verify your new email address: ${verificationUrl} (expires in 24 hours)`,
    html: verificationEmailHtml({
      name,
      verificationUrl,
      clientUrl: process.env.CLIENT_URL,
      headingOverride: "Verify your new email address",
      bodyOverride:
        "You recently changed your email address on Sage Nest. Click the button below to verify your new address and restore access to your account.",
    }),
  });
};

const OTP_COPY = {
  login: {
    subject: "Your Sage Nest sign-in code",
    heading: "Sign-in verification code",
    body: "Enter this code to complete your sign-in.",
  },
  enable_2fa: {
    subject: "Confirm enabling two-factor authentication",
    heading: "Enable two-factor authentication",
    body: "Enter this code to turn on two-factor authentication for your account.",
  },
  disable_2fa: {
    subject: "Confirm disabling two-factor authentication",
    heading: "Disable two-factor authentication",
    body: "Enter this code to turn off two-factor authentication for your account.",
  },
};

/**
 * OTP email — subject and body copy vary by purpose.
 * @param {{ to: string, name: string, code: string, purpose: 'login'|'enable_2fa'|'disable_2fa' }} param0
 */
const sendOtpEmail = ({ to, name, code, purpose = "login" }) => {
  const copy = OTP_COPY[purpose] ?? OTP_COPY.login;
  return sendEmail({
    to,
    subject: copy.subject,
    text: `Hi ${name}, ${copy.body}\n\nYour code: ${code}\n\nValid for 5 minutes. Single use only. Do not share this code.`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F2933;">${copy.heading}</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#4B5563;line-height:1.6;">
        Hi ${name}, ${copy.body}
      </p>
      <div style="text-align:center;margin:0 0 24px;">
        <div style="display:inline-block;background:#F5F7F5;border:1px solid #E4E7E4;border-radius:12px;padding:20px 40px;">
          <span style="font-size:36px;font-weight:700;color:#445446;letter-spacing:10px;font-family:monospace;">${code}</span>
        </div>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#9CA3AF;text-align:center;">
        Valid for <strong>5 minutes</strong> &nbsp;·&nbsp; Single use only
      </p>
      <p style="margin:0;font-size:13px;color:#9CA3AF;text-align:center;">
        If you didn't request this code, you can safely ignore this email.
      </p>
    `),
  });
};

/**
 * Notification sent to expert after a successful password change.
 * @param {{ to: string, name: string }} param0
 */
const sendPasswordChangedEmail = ({ to, name }) =>
  sendEmail({
    to,
    subject: "Your Sage Nest password has been changed",
    text: `Hi ${name}, your password was just changed. If this wasn't you, reset your password immediately.`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F2933;">Password changed</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4B5563;line-height:1.6;">
        Hi ${name}, your Sage Nest password was just successfully changed.
      </p>
      <p style="margin:0 0 28px;font-size:14px;color:#6B7280;line-height:1.6;">
        If you made this change, no further action is needed. If you did not change your password, reset it immediately using the button below.
      </p>
      ${btn(`${process.env.CLIENT_URL}/forgot-password`, "Reset My Password")}
    `),
  });

/**
 * Expert-cancelled session email — sent to the parent when an expert cancels.
 * A full refund is always issued in this scenario.
 * @param {{
 *   to: string, parentName: string, expertName: string,
 *   serviceTitle: string, scheduledAt: Date, amount: number
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
}) => {
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const amountStr = new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(amount));
  return sendEmail({
    to,
    subject: `Your session on ${dateStr} has been cancelled — full refund issued`,
    text: `Hi ${parentName.split(' ')[0]}, we are sorry to let you know that ${expertName.split(' ')[0]} has had to cancel your upcoming session. A full refund of ${amountStr} has been issued to your original payment method.`,
    html: expertCancelledSessionEmailHtml({
      parentName,
      expertName,
      serviceTitle,
      scheduledAt,
      amount,
      currency,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
    }),
  });
};

// ─── Parent suspension emails ─────────────────────────────────────────────────

const sendParentSuspendedEmail = ({ to, parentName, cancelledBookingCount }) =>
  sendEmail({
    to,
    subject: 'Your Sage Nest account has been suspended',
    text: `Hi ${parentName?.split(' ')[0] || 'there'}, your Sage Nest account has been suspended. ${cancelledBookingCount > 0 ? `${cancelledBookingCount} upcoming session${cancelledBookingCount !== 1 ? 's have' : ' has'} been cancelled and a full refund issued where applicable.` : ''} If you believe this is an error, contact us at ${CONTACT_EMAIL}.`,
    html: parentSuspendedEmailHtml({
      parentName,
      cancelledBookingCount,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
    }),
  });

const sendExpertBookingCancelledDueToSuspensionEmail = ({
  to,
  expertName,
  serviceTitle,
  scheduledAt,
  bookingId,
}) => {
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return sendEmail({
    to,
    subject: `Session cancelled — ${dateStr} (Booking #${bookingId})`,
    text: `Hi ${expertName?.split(' ')[0] || 'there'}, an upcoming session (${serviceTitle}, ${dateStr}, booking #${bookingId}) has been cancelled because the parent's account is no longer active on the platform. No payout will be processed for this booking.`,
    html: expertBookingCancelledSuspensionEmailHtml({
      expertName,
      serviceTitle,
      scheduledAt,
      bookingId,
      clientUrl: process.env.CLIENT_URL,
      contactEmail: CONTACT_EMAIL,
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
}) => {
  const clientUrl    = process.env.CLIENT_URL    || '';
  const contactEmail = process.env.EMAIL_FROM_NOTIFICATIONS || '';

  let emailStatus = 'failed';
  let emailError  = null;
  let smsStatus   = expertPhone ? 'failed' : 'no_phone';
  let smsError    = null;

  // Primary channel: email (always attempted)
  try {
    await sendEmail({
      to:      expertEmail,
      subject: `[Sage Nest] ${parentName} is running ~${delayMinutes} min late`,
      html:    imLateEmailHtml({
        expertName,
        parentName,
        serviceTitle,
        scheduledAt,
        timezone: expertTimezone,
        delayMinutes,
        note,
        clientUrl,
        contactEmail,
      }),
      text: `Hi ${expertName}, your client ${parentName} is running approximately ${delayMinutes} minute(s) late for your session (${serviceTitle}).${note ? ` Their message: "${note}"` : ''} Please hold tight.`,
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
  sendParentSuspendedEmail,
  sendExpertBookingCancelledDueToSuspensionEmail,
  sendAdminPayoutAlert,
  sendImLateNotification,
  sendWebflowSyncFailureAlert,
  sendWebflowQueueThresholdAlert,
};
