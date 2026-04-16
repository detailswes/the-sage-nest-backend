/**
 * Notification email sent to the expert when a new booking is confirmed.
 *
 * @param {{
 *   expertName: string,
 *   parentName: string,
 *   parentEmail: string,
 *   serviceTitle: string,
 *   format: 'ONLINE' | 'IN_PERSON',
 *   scheduledAt: Date,
 *   durationMinutes: number,
 *   clientUrl: string
 * }} params
 */
const newBookingNotificationEmailHtml = ({
  expertName,
  parentName,
  parentEmail,
  serviceTitle,
  format,
  scheduledAt,
  durationMinutes,
  clientUrl,
}) => {
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timeStr = new Date(scheduledAt).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  });
  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} minutes`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}min` : ''}`;

  const parentFirstName = parentName.split(' ')[0];
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Booking – Sage Nest</title>
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
        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #E4E7E4;padding:40px 36px;">

          <!-- Greeting -->
          <p style="margin:0 0 4px;font-size:15px;color:#1F2933;line-height:1.6;">
            Hi ${expertName.split(' ')[0]},
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#4B5563;line-height:1.6;">
            You have a new booking. Here are the details:
          </p>

          <!-- Booking details card -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">Booking Details</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Parent name</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${parentName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #E4E7E4;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Parent email</span><br>
                  <a href="mailto:${parentEmail}" style="font-size:15px;font-weight:600;color:#445446;text-decoration:none;">${parentEmail}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #E4E7E4;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Service</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #E4E7E4;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Date</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${dateStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #E4E7E4;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Time</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${timeStr} UTC</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-top:1px solid #E4E7E4;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Duration</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${durationLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-top:12px;border-top:1px solid #E4E7E4;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Format</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${format === 'ONLINE' ? 'Online' : 'In-Person'}</span>
                </td>
              </tr>
            </table>
          </div>

          ${format === 'ONLINE' ? `
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#065F46;line-height:1.5;">
              <strong>For online sessions only — action required:</strong> Please contact ${parentFirstName} at <a href="mailto:${parentEmail}" style="color:#065F46;">${parentEmail}</a> with the video call details at least 24 hours before the session.
            </p>
          </div>` : ''}

          <!-- Cancellation policy -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">Cancellation Policy</p>
          <p style="margin:0 0 12px;font-size:14px;color:#4B5563;line-height:1.6;">
            For your reference, the following cancellation policy applies to this booking:
          </p>
          <ul style="margin:0 0 12px;padding-left:20px;">
            <li style="font-size:14px;color:#4B5563;line-height:1.7;margin-bottom:4px;">Cancelled <strong>more than 24 hours</strong> before the session &rarr; Parent receives a full refund</li>
            <li style="font-size:14px;color:#4B5563;line-height:1.7;margin-bottom:4px;">Cancelled <strong>between 12 and 24 hours</strong> before the session &rarr; Parent receives a 50% refund</li>
            <li style="font-size:14px;color:#4B5563;line-height:1.7;">Cancelled <strong>less than 12 hours</strong> before the session or no-show &rarr; No refund issued</li>
          </ul>
          <p style="margin:0 0 28px;font-size:14px;color:#4B5563;line-height:1.6;">
            If you need to cancel for any reason, please do so as early as possible. In the event of expert cancellation, the parent will always receive a full refund regardless of timing.
          </p>

          <!-- Your dashboard -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">Your Dashboard</p>
          <p style="margin:0 0 28px;font-size:14px;color:#4B5563;line-height:1.6;">
            You can view and manage all your bookings at any time in your Sage Nest expert dashboard.
          </p>

          <!-- Sign-off -->
          <p style="margin:0 0 4px;font-size:14px;color:#4B5563;line-height:1.6;">We hope it is a great session.</p>
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1F2933;">The Sage Nest Team</p>
          <p style="margin:0;font-size:14px;color:#445446;">
            <a href="mailto:hello@sagenest.org" style="color:#445446;text-decoration:none;">hello@sagenest.org</a>
          </p>

        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

module.exports = { newBookingNotificationEmailHtml };
