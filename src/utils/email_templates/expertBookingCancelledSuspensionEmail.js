/**
 * Email sent to an expert when one of their upcoming sessions is cancelled
 * because the parent's account was suspended.
 *
 * @param {{
 *   expertName: string,
 *   serviceTitle: string,
 *   scheduledAt: Date,
 *   bookingId: number,
 *   clientUrl: string
 * }} params
 */
const expertBookingCancelledSuspensionEmailHtml = ({
  expertName,
  serviceTitle,
  scheduledAt,
  bookingId,
  clientUrl,
  contactEmail,
}) => {
  const expertFirstName = expertName?.split(' ')[0] || 'there';
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const dateStr = new Date(scheduledAt).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = new Date(scheduledAt).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Session Cancelled – Sage Nest</title>
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

          <p style="margin:0 0 4px;font-size:15px;color:#445446;line-height:1.6;">
            Hi ${expertFirstName},
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#5e6d5b;line-height:1.6;">
            We need to let you know that an upcoming session has been cancelled by Sage Nest. The parent's account is no longer active on the platform. You do not need to take any action.
          </p>

          <!-- Cancelled session -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">Cancelled Session</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:10px;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">Service</span>
                </td>
                <td style="padding-bottom:10px;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">Date</span>
                </td>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${dateStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">Time</span>
                </td>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${timeStr} UTC</span>
                </td>
              </tr>
              <tr>
                <td style="padding-top:10px;border-top:1px solid #c5ceba;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">Booking ref</span>
                </td>
                <td style="padding-top:10px;border-top:1px solid #c5ceba;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">#${bookingId}</span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Payout note -->
          <div style="background:#FFF7ED;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:28px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400E;">Payout for this session</p>
            <p style="margin:0;font-size:13px;color:#92400E;line-height:1.6;">
              No payout will be processed for this booking. If you have any concerns about this, please contact us and we will review it with you.
            </p>
          </div>

          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            We apologise for the disruption to your schedule. If you have any questions, please reach out to us at any time.
          </p>

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

module.exports = { expertBookingCancelledSuspensionEmailHtml };
