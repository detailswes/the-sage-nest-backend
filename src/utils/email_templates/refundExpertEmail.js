/**
 * Refund notification email sent to the expert when a refund is issued for one of their bookings.
 *
 * @param {{
 *   expertName: string,
 *   parentName: string,
 *   serviceTitle: string,
 *   scheduledAt: Date,
 *   refundAmount: number,
 *   isPartial: boolean,
 *   bookingId: number,
 *   clientUrl: string
 * }} params
 */
const refundExpertEmailHtml = ({
  expertName,
  parentName,
  serviceTitle,
  scheduledAt,
  refundAmount,
  isPartial,
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

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Refund Issued for Booking #${bookingId} – Sage Nest</title>
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
            Refund issued — booking #${bookingId}
          </h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4B5563;line-height:1.6;">
            Hi ${expertName}, a ${isPartial ? 'partial' : 'full'} refund of <strong>${amountStr}</strong> has been issued
            to <strong>${parentName}</strong> for the booking below. This action was initiated by the Sage Nest admin team.
          </p>

          <!-- Booking details card -->
          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Parent / Client</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${parentName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #FED7AA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Service</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;border-top:1px solid #FED7AA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Session date &amp; time</span><br>
                  <span style="font-size:15px;font-weight:600;color:#1F2933;">${dateStr} at ${timeStr} UTC</span>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #FED7AA;padding-top:12px;">
                  <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9CA3AF;letter-spacing:0.5px;">Amount refunded</span><br>
                  <span style="font-size:15px;font-weight:600;color:#C2410C;">${amountStr} ${isPartial ? '(partial)' : '(full)'}</span>
                </td>
              </tr>
            </table>
          </div>

          <div style="background:#F5F7F5;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#4B5563;line-height:1.5;">
              <strong>Payout note:</strong> ${isPartial
                ? 'As a partial refund has been issued, the remaining balance for this booking will not be paid out automatically. Please contact support if you have questions.'
                : 'As a full refund has been issued, the payout for this booking will not be processed.'}
            </p>
          </div>

          <p style="margin:0 0 28px;font-size:13px;color:#6B7280;line-height:1.6;">
            If you have any questions about this refund, please contact the Sage Nest support team.
          </p>

          <a href="${clientUrl}/dashboard/expert/appointments"
             style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
            View My Appointments
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

module.exports = { refundExpertEmailHtml };
