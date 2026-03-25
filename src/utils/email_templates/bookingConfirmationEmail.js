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
 *   amount: number | string,
 *   bookingId: number,
 *   clientUrl: string
 * }} params
 */
const bookingConfirmationEmailHtml = ({
  name,
  expertName,
  serviceTitle,
  format,
  scheduledAt,
  durationMinutes,
  amount,
  bookingId,
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
  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} minutes`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}min` : ''}`;

  const amountFormatted = amount
    ? `£${Number(amount).toFixed(2)}`
    : '';

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

        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#1F2933;letter-spacing:-0.3px;">Sage Nest</span>
        </td></tr>

        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #E4E7E4;padding:40px 36px;">

          <!-- Icon -->
          <div style="text-align:center;margin-bottom:20px;">
            <div style="display:inline-block;background:#D1FAE5;border-radius:50%;padding:16px;">
              <span style="font-size:32px;">✓</span>
            </div>
          </div>

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F2933;text-align:center;">
            Booking Confirmed!
          </h1>
          <p style="margin:0 0 28px;font-size:15px;color:#4B5563;line-height:1.6;text-align:center;">
            Hi ${name}, your booking with <strong>${expertName}</strong> is confirmed. Here are your session details.
          </p>

          <!-- Booking details card -->
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
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
                <td style="padding-bottom:12px;border-top:1px solid #E4E7E4;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Format</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${formatLabel}</span>
                </td>
              </tr>
              ${amountFormatted ? `
              <tr>
                <td style="border-top:1px solid #E4E7E4;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Amount Paid</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${amountFormatted}</span>
                </td>
              </tr>` : ''}
            </table>
          </div>

          ${format === 'ONLINE' ? `
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#1E40AF;line-height:1.5;">
              <strong>Online Session:</strong> Your expert will send you a Zoom or Teams meeting link before your session. Please check your email closer to the appointment time.
            </p>
          </div>` : ''}

          <p style="margin:0 0 24px;font-size:13px;color:#6B7280;line-height:1.6;">
            You can cancel your booking up to 24 hours before the session for a full refund.
            Cancellations within 24 hours may not be eligible for a refund.
          </p>

          <div style="text-align:center;">
            <a href="${clientUrl}/dashboard/parent/bookings"
               style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
              View My Bookings
            </a>
          </div>

        </td></tr>

        <tr><td style="padding-top:24px;">
          <div style="background:#F5F7F5;border:1px solid #E4E7E4;border-radius:8px;padding:16px 20px;">
            <p style="margin:0;font-size:11px;color:#6B7280;line-height:1.7;">
              Sage Nest is a booking platform, not a healthcare provider. Practitioners listed on this platform are independent professionals. Advice given during sessions does not constitute medical advice, diagnosis, or treatment and should not be relied upon as a substitute for professional medical care. Always seek the advice of a qualified healthcare provider if you have concerns about your or your child's health. If you believe you or your child need urgent medical care, contact emergency services immediately.
            </p>
          </div>
        </td></tr>

        <tr><td align="center" style="padding-top:16px;">
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

module.exports = { bookingConfirmationEmailHtml };
