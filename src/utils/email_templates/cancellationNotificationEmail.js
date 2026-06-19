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
 *   refundPercent: 0 | 50 | 100,
 *   amount: number | string,
 *   currency?: string,
 *   clientUrl: string
 * }} params
 */
function fmtTime(date, timezone) {
  const tz = timezone || 'UTC';
  const d  = new Date(date);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const abbr = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || tz;
  return `${time} ${abbr}`;
}

const cancellationNotificationEmailHtml = ({
  expertName,
  parentName,
  serviceTitle,
  format,
  scheduledAt,
  cancellationReason,
  refundPercent,
  amount,
  currency = 'EUR',
  timezone,
  clientUrl,
  contactEmail,
}) => {
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = fmtTime(scheduledAt, timezone);

  const expertFirstName = expertName.split(' ')[0];
  const parentFirstName = parentName.split(' ')[0];
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

  const totalAmount   = Number(amount) || 0;
  const halfAmount    = totalAmount * 0.5;
  const fmt           = (n) => new Intl.NumberFormat('en', { style: 'currency', currency }).format(n);

  const refundOutcome = refundPercent === 100
    ? `As the cancellation was made more than 24 hours before the session, ${parentFirstName} has received a full refund of ${fmt(totalAmount)}.`
    : refundPercent === 50
    ? `As the cancellation was made between 12 and 24 hours before the session, ${parentFirstName} has received a 50% refund of ${fmt(halfAmount)}. The remaining 50% (${fmt(halfAmount)}) will be transferred to you in line with the standard payout schedule.`
    : `As the cancellation was made less than 12 hours before the session, no refund has been issued. The full amount (${fmt(totalAmount)}) will be transferred to you in line with the standard payout schedule.`;

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

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:24px;">
          <img src="${logoUrl}" alt="Sage Nest" width="60" style="display:block;width:60px;height:auto;border:0;" />
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #c5ceba;padding:40px 36px;">

          <!-- Greeting -->
          <p style="margin:0 0 4px;font-size:15px;color:#445446;line-height:1.6;">
            Hi ${expertFirstName},
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#5e6d5b;line-height:1.6;">
            We are writing to let you know that <strong>${parentFirstName}</strong> has cancelled the following booking:
          </p>

          <!-- Cancelled booking section -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">Cancelled Booking</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:${cancellationReason ? '16px' : '24px'};">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:10px;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">Parent name</span>
                </td>
                <td style="padding-bottom:10px;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${parentName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">Service</span>
                </td>
                <td style="padding:10px 0;border-top:1px solid #c5ceba;vertical-align:top;">
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
                  <span style="font-size:13px;font-weight:600;color:#445446;">${timeStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-top:10px;border-top:1px solid #c5ceba;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">Format</span>
                </td>
                <td style="padding-top:10px;border-top:1px solid #c5ceba;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${format === 'ONLINE' ? 'Online' : 'In-Person'}</span>
                </td>
              </tr>
            </table>
          </div>

          ${cancellationReason ? `
          <div style="background:#F5F7F5;border-radius:12px;padding:14px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#5e6d5b;">Reason</span>
                </td>
                <td style="vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#445446;">${cancellationReason}</span>
                </td>
              </tr>
            </table>
          </div>` : ''}

          <!-- Refund outcome -->
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:16px;margin-bottom:28px;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;color:#065F46;letter-spacing:0.6px;">Refund outcome</p>
            <p style="margin:0;font-size:13px;color:#065F46;line-height:1.6;">${refundOutcome}</p>
          </div>

          <!-- Body -->
          <p style="margin:0 0 12px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            We are sorry for the disruption to your schedule. You can view all your bookings and any updates in your Sage Nest expert dashboard.
          </p>
          <p style="margin:0 0 28px;font-size:14px;color:#5e6d5b;line-height:1.6;">
            If you have any questions, please do not hesitate to contact us at <a href="mailto:${contactEmail}" style="color:#445446;text-decoration:none;">${contactEmail}</a>.
          </p>

          <!-- Sign-off -->
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#445446;">The Sage Nest Team</p>
          <p style="margin:0;font-size:14px;color:#445446;">
            <a href="mailto:${contactEmail}" style="color:#445446;text-decoration:none;">${contactEmail}</a>
          </p>

        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

module.exports = { cancellationNotificationEmailHtml };
