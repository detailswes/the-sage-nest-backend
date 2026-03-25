/**
 * Notification email sent to the expert when a new booking is confirmed.
 *
 * @param {{
 *   expertName: string,
 *   parentName: string,
 *   serviceTitle: string,
 *   format: 'ONLINE' | 'IN_PERSON',
 *   scheduledAt: Date,
 *   durationMinutes: number,
 *   bookingId: number,
 *   clientUrl: string
 * }} params
 */
const newBookingNotificationEmailHtml = ({
  expertName,
  parentName,
  serviceTitle,
  format,
  scheduledAt,
  durationMinutes,
  bookingId,
  clientUrl,
}) => {
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timeStr = new Date(scheduledAt).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  });
  const formatLabel = format === 'ONLINE' ? 'Online Session' : 'In-Person Session';
  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} minutes`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}min` : ''}`;

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

        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#1F2933;letter-spacing:-0.3px;">Sage Nest</span>
        </td></tr>

        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #E4E7E4;padding:40px 36px;">

          <!-- Icon -->
          <div style="text-align:center;margin-bottom:20px;">
            <div style="display:inline-block;background:#D1FAE5;border-radius:50%;padding:16px;">
              <span style="font-size:28px;">📅</span>
            </div>
          </div>

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F2933;text-align:center;">
            New Booking!
          </h1>
          <p style="margin:0 0 28px;font-size:15px;color:#4B5563;line-height:1.6;text-align:center;">
            Hi ${expertName}, <strong>${parentName}</strong> has booked a session with you. Here are the details.
          </p>

          <!-- Booking details card -->
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Client</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${parentName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #E4E7E4;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Service</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #E4E7E4;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Date &amp; Time</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${dateStr} at ${timeStr} UTC</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #E4E7E4;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Duration</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${durationLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #E4E7E4;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Format</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${formatLabel}</span>
                </td>
              </tr>
            </table>
          </div>

          ${format === 'ONLINE' ? `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.5;">
              <strong>Online session:</strong> Please send ${parentName} a Zoom or Teams meeting link before the session starts.
            </p>
          </div>` : ''}

          <div style="text-align:center;">
            <a href="${clientUrl}/dashboard/expert/appointments"
               style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
              View My Calendar
            </a>
          </div>

        </td></tr>

        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            © ${new Date().getFullYear()} Sage Nest. All rights reserved. · Booking #${bookingId}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

module.exports = { newBookingNotificationEmailHtml };
