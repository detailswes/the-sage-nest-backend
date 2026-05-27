/**
 * Email sent to a specialist when admin requests profile corrections.
 * @param {{ name: string, note: string, dashboardUrl: string }} param0
 */
const changesRequestedEmailHtml = ({ name, note, dashboardUrl, clientUrl }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sage Nest — Profile update required</title>
</head>
<body style="margin:0;padding:0;background:#F5F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="${clientUrl}/assets/images/Sage-Nest_Final.png" alt="Sage Nest" width="60" style="display:block;width:60px;height:auto;border:0;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #E4E7E4;padding:40px 36px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1F2933;">
                Profile update required
              </h1>
              <p style="margin:0 0 20px;font-size:15px;color:#4B5563;line-height:1.6;">
                Hi ${name}, our team has reviewed your expert profile and has a few items that need to be corrected before it can be approved.
              </p>

              <!-- Admin note box -->
              <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
                <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400E;">
                  Feedback from our team
                </p>
                <p style="margin:0;font-size:14px;color:#78350F;line-height:1.6;white-space:pre-wrap;">${note}</p>
              </div>

              <p style="margin:0 0 28px;font-size:14px;color:#6B7280;line-height:1.6;">
                Please log in to your dashboard, make the necessary updates, and save your profile.
                Once saved, your profile will automatically be resubmitted for review.
              </p>

              <a href="${dashboardUrl}" style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;margin-top:8px;">
                Update My Profile
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;">
                © ${new Date().getFullYear()} Sage Nest. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

module.exports = { changesRequestedEmailHtml };
