/**
 * Booking confirmation email sent to a parent after payment is verified.
 *
 * @param {{
 *   name: string,
 *   expertName: string,
 *   serviceTitle: string,
 *   format: 'ONLINE' | 'IN_PERSON',
 *   scheduledAt: Date,
 *   durationMinutes: number,
 *   clientUrl: string,
 *   location?: string
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
}) => {
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
  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} minutes`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}min` : ''}`;

  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmed – Sage Nest</title>
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
            Hi ${name},
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#4B5563;line-height:1.6;">
            Your booking is confirmed. Here are your session details:
          </p>

          <!-- Booking details card -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">Booking Details</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Expert</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${expertName}</span>
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
                <td style="padding:12px 0;border-top:1px solid #E4E7E4;${format === 'IN_PERSON' && location ? '' : 'padding-bottom:0;'}">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Format</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${format === 'ONLINE' ? 'Online' : 'In-Person'}</span>
                </td>
              </tr>
              ${format === 'IN_PERSON' && location ? `
              <tr>
                <td style="padding-top:12px;border-top:1px solid #E4E7E4;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Location</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${location}</span>
                </td>
              </tr>` : ''}
            </table>
          </div>

          ${format === 'ONLINE' ? `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.5;">
              <strong>For online sessions only:</strong> Your expert will contact you with the details for the video call at least 24 hours before your session.
            </p>
          </div>` : ''}

          <!-- Cancellation policy -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">Cancellation Policy</p>
          <p style="margin:0 0 12px;font-size:14px;color:#4B5563;line-height:1.6;">
            We understand that life happens and plans sometimes change. To honour the commitment made by both you and your expert — who has dedicated this time exclusively for you — the following cancellation policy applies:
          </p>
          <ul style="margin:0 0 12px;padding-left:20px;">
            <li style="font-size:14px;color:#4B5563;line-height:1.7;margin-bottom:4px;"><strong>More than 24 hours</strong> before your session &rarr; Full refund</li>
            <li style="font-size:14px;color:#4B5563;line-height:1.7;margin-bottom:4px;"><strong>Between 12 and 24 hours</strong> before your session &rarr; 50% refund</li>
            <li style="font-size:14px;color:#4B5563;line-height:1.7;"><strong>Less than 12 hours</strong> before your session or no-show &rarr; No refund</li>
          </ul>
          <p style="margin:0 0 8px;font-size:14px;color:#4B5563;line-height:1.6;">
            Need to change your time? You can reschedule for free as long as you do so more than 12 hours before your session — simply use the Reschedule option in your dashboard.
          </p>
          <p style="margin:0 0 28px;font-size:14px;color:#4B5563;line-height:1.6;">
            If your expert cancels for any reason, you will always receive a <strong>full refund</strong> regardless of timing.
          </p>

          <!-- Your dashboard -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">Your Dashboard</p>
          <p style="margin:0 0 28px;font-size:14px;color:#4B5563;line-height:1.6;">
            You can view the full details of this booking at any time in your Sage Nest dashboard, including your upcoming and past sessions.
          </p>

          <!-- Sign-off -->
          <p style="margin:0 0 4px;font-size:14px;color:#4B5563;line-height:1.6;">We hope the session is everything you need.</p>
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

module.exports = { bookingConfirmationEmailHtml };
