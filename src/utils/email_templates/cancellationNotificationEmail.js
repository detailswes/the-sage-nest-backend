/**
 * Cancellation notification email sent to the expert when a parent cancels.
 *
 * @param {{
 *   expertName: string,
 *   parentName: string,
 *   serviceTitle: string,
 *   format: 'ONLINE' | 'IN_PERSON',
 *   scheduledAt: Date,
 *   cancellationReason?: string,
 *   withinFreeWindow: boolean,
 *   clientUrl: string
 * }} params
 */
const cancellationNotificationEmailHtml = ({
  expertName,
  parentName,
  serviceTitle,
  format,
  scheduledAt,
  cancellationReason,
  withinFreeWindow,
  clientUrl,
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
  const formatLabel = format === 'ONLINE' ? 'Online Session' : 'In-Person Session';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Cancelled – Sage Nest</title>
</head>
<body style="margin:0;padding:0;background:#F5F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#1F2933;letter-spacing:-0.3px;">Sage Nest</span>
        </td></tr>

        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #E4E7E4;padding:40px 36px;">

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F2933;">
            Booking Cancellation
          </h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4B5563;line-height:1.6;">
            Hi ${expertName}, a booking has been cancelled. The time slot has been automatically freed up in your calendar.
          </p>

          <!-- Booking details card -->
          <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Parent</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${parentName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #FECACA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Service</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #FECACA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Date &amp; Time</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${dateStr} at ${timeStr} UTC</span>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #FECACA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Format</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${formatLabel}</span>
                </td>
              </tr>
            </table>
          </div>

          ${cancellationReason ? `
          <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">
              <strong>Reason provided:</strong> ${cancellationReason}
            </p>
          </div>` : ''}

          <div style="background:#F5F7F5;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#4B5563;line-height:1.5;">
              ${withinFreeWindow
                ? '<strong>Refund status:</strong> This cancellation was within the free cancellation window (24+ hours before session). A refund has been initiated for the parent.'
                : '<strong>Refund status:</strong> This cancellation was within 24 hours of the session. The refund policy may apply — no automatic refund has been issued.'}
            </p>
          </div>

          <p style="margin:0 0 24px;font-size:13px;color:#6B7280;line-height:1.6;">
            The slot is now available again and parents can rebook that time.
          </p>

          <a href="${clientUrl}/dashboard/expert/appointments"
             style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
            View My Calendar
          </a>

        </td></tr>

        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            © ${new Date().getFullYear()} Sage Nest. All rights reserved.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

module.exports = { cancellationNotificationEmailHtml };
