/**
 * Email sent to a parent when their account is suspended by an admin.
 * Bookings are cancelled as part of the same action.
 *
 * @param {{
 *   parentName: string,
 *   cancelledBookingCount: number,
 *   clientUrl: string
 * }} params
 */
const parentSuspendedEmailHtml = ({ parentName, cancelledBookingCount, clientUrl, contactEmail }) => {
  const parentFirstName = parentName?.split(' ')[0] || 'there';
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const bookingLine = cancelledBookingCount > 0
    ? `<p style="margin:0 0 16px;font-size:15px;color:#5e6d5b;line-height:1.6;">
        Any upcoming confirmed session${cancelledBookingCount !== 1 ? 's have' : ' has'} been cancelled and refunded according to our standard Cancellation and Rescheduling Policy, where applicable. Refunds typically appear within 5–10 business days.
       </p>`
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Account Suspended – Sage Nest</title>
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

          <!-- Alert icon -->
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:#FFF7ED;border-radius:50%;width:56px;height:56px;line-height:56px;text-align:center;">
              <span style="font-size:26px;">⚠️</span>
            </div>
          </div>

          <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#445446;text-align:center;">
            Your account has been suspended
          </h1>

          <p style="margin:0 0 16px;font-size:15px;color:#5e6d5b;line-height:1.6;">
            Hi ${parentFirstName},
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#5e6d5b;line-height:1.6;">
            Your Sage Nest account has been suspended by our team. You will no longer be able to log in or make new bookings.
          </p>

          ${bookingLine}

          <!-- Contact box -->
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#445446;">Need help?</p>
            <p style="margin:0;font-size:13px;color:#5e6d5b;line-height:1.6;">
              If you believe this is an error or would like to appeal, please contact us at
              <a href="mailto:${contactEmail}" style="color:#445446;text-decoration:none;font-weight:600;">${contactEmail}</a>
              and include your registered email address.
            </p>
          </div>

          <!-- Sign-off -->
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#445446;">The Sage Nest Team</p>
          <p style="margin:0;font-size:14px;color:#445446;">
            <a href="mailto:${contactEmail}" style="color:#445446;text-decoration:none;">${contactEmail}</a>
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#5e6d5b;">
            © ${new Date().getFullYear()} Sage Nest. All rights reserved.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

module.exports = { parentSuspendedEmailHtml };
