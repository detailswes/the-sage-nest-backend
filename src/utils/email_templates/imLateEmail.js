function fmtDateTime(date, timezone) {
  const tz = timezone || 'UTC';
  const d  = new Date(date);
  const dateStr = d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz,
  });
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const abbr = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || tz;
  return `${dateStr} at ${timeStr} ${abbr}`;
}

/**
 * @param {{
 *   expertName: string,
 *   parentName: string,
 *   serviceTitle: string,
 *   scheduledAt: Date,
 *   timezone: string,
 *   delayMinutes: number,
 *   note: string | null,
 *   clientUrl: string,
 *   contactEmail: string,
 * }} params
 */
const imLateEmailHtml = ({
  expertName,
  parentName,
  serviceTitle,
  scheduledAt,
  timezone,
  delayMinutes,
  note,
  clientUrl,
  contactEmail,
}) => {
  const datetimeStr    = fmtDateTime(scheduledAt, timezone);
  const expertFirst    = expertName.split(' ')[0];
  const parentFirst    = parentName.split(' ')[0];
  const logoUrl        = `${clientUrl}/assets/images/Sage-Nest_Final.png`;
  const noteRow        = note
    ? `<tr><td colspan="2" style="padding:8px 0;"><div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 14px;font-size:13px;color:#92400E;line-height:1.5;"><strong>Message from ${parentFirst}:</strong><br>${note}</div></td></tr>`
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Running Late – Sage Nest</title>
</head>
<body style="margin:0;padding:0;background:#F5F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Logo -->
        <tr><td style="padding-bottom:24px;text-align:center;">
          <img src="${logoUrl}" alt="Sage Nest" height="36" style="height:36px;display:inline-block;" />
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #E4E7E4;overflow:hidden;">

          <!-- Alert header -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#FEF3C7;border-bottom:1px solid #FCD34D;padding:16px 28px;text-align:center;">
              <p style="margin:0;font-size:28px;">⏱️</p>
              <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#92400E;">Running Late Notice</p>
            </td></tr>
          </table>

          <!-- Body -->
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px;">
            <tr><td>
              <p style="margin:0 0 16px;font-size:15px;color:#1F2933;line-height:1.6;">
                Hi <strong>${expertFirst}</strong>,
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:#4B5563;line-height:1.6;">
                Your client <strong>${parentName}</strong> is running approximately
                <strong>${delayMinutes} minute${delayMinutes > 1 ? 's' : ''} late</strong>
                for today's session.
              </p>

              <!-- Session details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F5;border-radius:10px;border:1px solid #E4E7E4;padding:16px;margin-bottom:20px;">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#6B7280;width:110px;">Service</td>
                  <td style="padding:6px 0;font-size:13px;color:#1F2933;font-weight:600;">${serviceTitle}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#6B7280;">Session time</td>
                  <td style="padding:6px 0;font-size:13px;color:#1F2933;font-weight:600;">${datetimeStr}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#6B7280;">Expected delay</td>
                  <td style="padding:6px 0;font-size:13px;color:#D97706;font-weight:700;">~${delayMinutes} min</td>
                </tr>
                ${noteRow}
              </table>

              <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">
                Please hold tight — your client is on their way. You do not need to take any action.
              </p>

              <p style="margin:0;font-size:14px;color:#6B7280;">
                Questions? Reply to this email or contact us at
                <a href="mailto:${contactEmail}" style="color:#445446;text-decoration:none;">${contactEmail}</a>.
              </p>
            </td></tr>
          </table>

          <!-- Footer -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E4E7E4;padding:16px 28px;">
            <tr><td style="text-align:center;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;">© Sage Nest · This is an automated notification.</p>
            </td></tr>
          </table>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

module.exports = { imLateEmailHtml };
