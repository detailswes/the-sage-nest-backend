/**
 * Refund notification email sent to the parent when a refund is issued.
 *
 * @param {{
 *   parentName: string,
 *   expertName: string,
 *   serviceTitle: string,
 *   scheduledAt: Date,
 *   refundAmount: number,
 *   isPartial: boolean,
 *   reason?: string,
 *   bookingId: number,
 *   clientUrl: string
 * }} params
 */
const refundParentEmailHtml = ({
  parentName,
  expertName,
  serviceTitle,
  scheduledAt,
  refundAmount,
  isPartial,
  reason,
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
  const amountStr = `£${parseFloat(refundAmount).toFixed(2)}`;
  const refundLabel = isPartial ? `Partial refund of ${amountStr}` : `Full refund of ${amountStr}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Refund Has Been Processed – Sage Nest</title>
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
            Your refund has been processed
          </h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4B5563;line-height:1.6;">
            Hi ${parentName}, a refund has been issued for your booking with <strong>${expertName}</strong>.
            Funds will typically appear in your account within <strong>3–5 business days</strong>, depending on your bank.
          </p>

          <!-- Refund summary card -->
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Refund amount</span><br>
                  <span style="font-size:20px;font-weight:700;color:#065F46;">${amountStr}</span>
                  <span style="font-size:13px;color:#065F46;margin-left:6px;">${isPartial ? '(partial refund)' : '(full refund)'}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #6EE7B7;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Booking</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">#${bookingId} — ${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #6EE7B7;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Specialist</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${expertName}</span>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #6EE7B7;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Session date &amp; time</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${dateStr} at ${timeStr} UTC</span>
                </td>
              </tr>
            </table>
          </div>

          ${reason ? `
          <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">
              <strong>Note:</strong> ${reason}
            </p>
          </div>` : ''}

          <p style="margin:0 0 28px;font-size:13px;color:#6B7280;line-height:1.6;">
            If you have any questions about your refund, please don't hesitate to contact our support team.
          </p>

          <a href="${clientUrl}/dashboard/parent/upcoming"
             style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
            View My Bookings
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

module.exports = { refundParentEmailHtml };
