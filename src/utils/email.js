const sgMail = require("@sendgrid/mail");
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

// ─── Init (lazy — called after dotenv has loaded) ─────────────────────────────
let _initialized = false;

const initSendGrid = () => {
  if (_initialized) return;
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY is not set in environment");
  }
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  _initialized = true;
};

// ─── Verify config (call once at server startup) ──────────────────────────────
const verifyEmailConnection = () => {
  try {
    initSendGrid();
    console.log("✅ SendGrid email configured");
  } catch (err) {
    console.warn("⚠️  SendGrid not configured:", err.message);
  }
};

// ─── Base sender ─────────────────────────────────────────────────────────────
/**
 * @param {{ to: string, subject: string, html: string, text?: string }} options
 */
const sendEmail = async ({ to, subject, html, text }) => {
  initSendGrid();
  return sgMail.send({
    from: {
      name: "Sage Nest",
      email: process.env.EMAIL_FROM,
    },
    to,
    subject,
    text: text || subject,
    html,
  });
};

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
              <span style="font-size:20px;font-weight:700;color:#1F2933;letter-spacing:-0.3px;">Sage Nest</span>
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
    html: passwordResetEmailHtml({ name, resetUrl }),
  });
};

/**
 * Expert email verification.
 * Template lives in email_templates/verificationEmail.js
 * @param {{ to: string, name: string, userId: number, verificationCode: string }} param0
 */
const sendVerificationEmail = ({ to, name, userId, verificationCode }) => {
  const verificationUrl =
    `${process.env.CLIENT_URL}/verify-email` +
    `?auth_user=true&userId=${userId}&verificationCode=${verificationCode}`;

  return sendEmail({
    to,
    subject: "Verify your Sage Nest email address",
    text: `Hi ${name}, please verify your email: ${verificationUrl}`,
    html: verificationEmailHtml({ name, verificationUrl }),
  });
};

/**
 * Booking confirmation email — sent to the parent after webhook confirms payment.
 * @param {{
 *   to: string, name: string, expertName: string,
 *   serviceTitle: string, format: string,
 *   scheduledAt: Date, durationMinutes: number,
 *   amount: number|string, bookingId: number
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
  amount,
  bookingId,
}) =>
  sendEmail({
    to,
    subject: `Your booking with ${expertName} is confirmed!`,
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
      amount,
      bookingId,
      clientUrl: process.env.CLIENT_URL,
    }),
  });

/**
 * Cancellation notification email — sent to the expert when a parent cancels.
 * @param {{
 *   to: string, expertName: string, parentName: string,
 *   serviceTitle: string, format: string,
 *   scheduledAt: Date, cancellationReason?: string,
 *   withinFreeWindow: boolean
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
  withinFreeWindow,
}) =>
  sendEmail({
    to,
    subject: `Booking cancellation — ${parentName}`,
    text: `Hi ${expertName}, ${parentName} has cancelled their booking for ${serviceTitle}. The slot has been freed.`,
    html: cancellationNotificationEmailHtml({
      expertName,
      parentName,
      serviceTitle,
      format,
      scheduledAt,
      cancellationReason,
      withinFreeWindow,
      clientUrl: process.env.CLIENT_URL,
    }),
  });

/**
 * New booking notification — sent to the expert when a booking is confirmed.
 * @param {{
 *   to: string, expertName: string, parentName: string,
 *   serviceTitle: string, format: string,
 *   scheduledAt: Date, durationMinutes: number, bookingId: number
 * }} param0
 */
const sendNewBookingNotificationEmail = ({
  to,
  expertName,
  parentName,
  serviceTitle,
  format,
  scheduledAt,
  durationMinutes,
  bookingId,
}) =>
  sendEmail({
    to,
    subject: `New booking from ${parentName}`,
    text: `Hi ${expertName}, ${parentName} has booked ${serviceTitle} on ${new Date(
      scheduledAt
    ).toLocaleDateString("en-GB")}.`,
    html: newBookingNotificationEmailHtml({
      expertName,
      parentName,
      serviceTitle,
      format,
      scheduledAt,
      durationMinutes,
      bookingId,
      clientUrl: process.env.CLIENT_URL,
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
}) => {
  const timeLabel = reminderType === "24h" ? "tomorrow" : "in 1 hour";
  return sendEmail({
    to,
    subject:
      role === "parent"
        ? `Reminder: your session is ${timeLabel}`
        : `Reminder: upcoming session with ${otherPartyName} — ${timeLabel}`,
    text: `Hi ${recipientName}, your session for ${serviceTitle} is ${timeLabel} at ${new Date(
      scheduledAt
    ).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    })} UTC.`,
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
      clientUrl: process.env.CLIENT_URL,
    }),
  });
};

/**
 * Account locked notification — sent after 5 consecutive failed login attempts.
 * @param {{ to: string, name: string, unlockAt: Date }} param0
 */
const sendAccountLockedEmail = ({ to, name, unlockAt }) => {
  const unlockTime = unlockAt.toLocaleTimeString("en-GB", {
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
        Hi ${name}, we detected 5 consecutive failed login attempts on your account and have temporarily locked it for <strong>30 minutes</strong>.
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
  isPartial,
  reason,
  bookingId,
}) =>
  sendEmail({
    to,
    subject: `Your refund of £${parseFloat(refundAmount).toFixed(2)} has been processed`,
    text: `Hi ${parentName}, a ${isPartial ? "partial" : "full"} refund of £${parseFloat(refundAmount).toFixed(2)} has been issued for your booking #${bookingId} with ${expertName}. Funds will appear within 3–5 business days.`,
    html: refundParentEmailHtml({
      parentName,
      expertName,
      serviceTitle,
      scheduledAt,
      refundAmount,
      isPartial,
      reason,
      bookingId,
      clientUrl: process.env.CLIENT_URL,
    }),
  });

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
  isPartial,
  bookingId,
}) =>
  sendEmail({
    to,
    subject: `A refund has been issued for booking #${bookingId}`,
    text: `Hi ${expertName}, a ${isPartial ? "partial" : "full"} refund of £${parseFloat(refundAmount).toFixed(2)} has been issued to ${parentName} for booking #${bookingId}. The payout for this booking will not be processed.`,
    html: refundExpertEmailHtml({
      expertName,
      parentName,
      serviceTitle,
      scheduledAt,
      refundAmount,
      isPartial,
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
      headingOverride: "Verify your new email address",
      bodyOverride:
        "You recently changed your email address on Sage Nest. Click the button below to verify your new address and restore access to your account.",
    }),
  });
};

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  sendEmail,
  verifyEmailConnection,
  sendWelcomeEmail,
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
};
