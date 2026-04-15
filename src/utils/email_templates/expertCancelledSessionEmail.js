/**
 * Email sent to the parent when their expert cancels a confirmed booking.
 * A full refund is always issued in this case.
 *
 * @param {{
 *   parentName: string,
 *   expertName: string,
 *   serviceTitle: string,
 *   scheduledAt: Date,
 *   amount: number,
 *   clientUrl: string
 * }} params
 */
const expertCancelledSessionEmailHtml = ({
  parentName,
  expertName,
  serviceTitle,
  scheduledAt,
  amount,
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

  const parentFirstName = parentName.split(' ')[0];
  const expertFirstName = expertName.split(' ')[0];
  const amountFormatted = `£${Number(amount).toFixed(2)}`;
  const logoUrl = `${clientUrl}/assets/images/Sage-Nest_Final.png`;

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
        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #E4E7E4;padding:40px 36px;">

          <!-- Greeting -->
          <p style="margin:0 0 4px;font-size:15px;color:#1F2933;line-height:1.6;">
            Hi ${parentFirstName},
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#4B5563;line-height:1.6;">
            We are sorry to let you know that <strong>${expertFirstName}</strong> has had to cancel your upcoming session. We understand how frustrating this can be, especially when you have been looking forward to it.
          </p>

          <!-- Cancelled session section -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">Cancelled Session</p>
          <div style="background:#F5F7F5;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:10px;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#6B7280;">Expert</span>
                </td>
                <td style="padding-bottom:10px;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#1F2933;">${expertName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-top:1px solid #E4E7E4;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#6B7280;">Service</span>
                </td>
                <td style="padding:10px 0;border-top:1px solid #E4E7E4;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#1F2933;">${serviceTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-top:1px solid #E4E7E4;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#6B7280;">Date</span>
                </td>
                <td style="padding:10px 0;border-top:1px solid #E4E7E4;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#1F2933;">${dateStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-top:10px;border-top:1px solid #E4E7E4;width:40%;vertical-align:top;">
                  <span style="font-size:13px;color:#6B7280;">Time</span>
                </td>
                <td style="padding-top:10px;border-top:1px solid #E4E7E4;vertical-align:top;">
                  <span style="font-size:13px;font-weight:600;color:#1F2933;">${timeStr} UTC</span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Full refund box -->
          <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;padding:16px;margin-bottom:28px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#065F46;">Full refund issued</p>
            <p style="margin:0;font-size:13px;color:#065F46;line-height:1.6;">
              A full refund of <strong>${amountFormatted}</strong> has been issued to your original payment method. Please allow 5–10 business days for the amount to appear in your account, depending on your bank.
            </p>
          </div>

          <!-- Find another expert -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;color:#445446;letter-spacing:0.8px;">Find Another Expert</p>
          <p style="margin:0 0 12px;font-size:14px;color:#4B5563;line-height:1.6;">
            We know your time and your family's wellbeing matter. If you would like to book with another expert, you can browse available specialists on the Sage Nest website and find a time that works for you.
          </p>
          <p style="margin:0 0 12px;font-size:14px;color:#4B5563;line-height:1.6;">
            You can also view the details of this cancellation in your dashboard at any time.
          </p>
          <p style="margin:0 0 28px;font-size:14px;color:#4B5563;line-height:1.6;">
            We are sorry again for the inconvenience, and we hope to help you find the right support very soon.
          </p>

          <!-- Sign-off -->
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

module.exports = { expertCancelledSessionEmailHtml };
