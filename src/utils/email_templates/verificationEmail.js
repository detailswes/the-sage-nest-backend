/**
 * Verification email HTML template.
 *
 * @param {{ name: string, verificationUrl: string }} params
 * @returns {string} Full HTML string ready to send
 */
const verificationEmailHtml = ({
  name,
  verificationUrl,
  headingOverride,
  bodyOverride,
  clientUrl,
}) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your Sage Nest account</title>
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

              <!-- Icon -->
              <div style="text-align:center;margin-bottom:28px;">
                <div style="display:inline-block;background:#445446/10;background-color:#EDF2ED;border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;">
                  <span style="font-size:28px;">✉️</span>
                </div>
              </div>

              <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#1F2933;text-align:center;">
                ${headingOverride || 'Verify your email address'}
              </h1>
              <p style="margin:0 0 8px;font-size:15px;color:#4B5563;line-height:1.6;text-align:center;">
                Hi ${name},
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#6B7280;line-height:1.7;text-align:center;">
                ${bodyOverride || 'Thanks for signing up on Sage Nest!<br />Click the button below to verify your email and activate your account.'}
              </p>

              <!-- CTA Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a
                  href="${verificationUrl}"
                  style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;"
                >
                  Verify my email
                </a>
              </div>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #E4E7E4;margin:0 0 20px;" />

              <!-- Fallback link -->
              <p style="margin:0 0 6px;font-size:12px;color:#9CA3AF;text-align:center;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0;font-size:11px;color:#445446;word-break:break-all;text-align:center;">
                ${verificationUrl}
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0 0 4px;font-size:12px;color:#9CA3AF;">
                If you didn't create a Sage Nest account, you can safely ignore this email.
              </p>
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

module.exports = { verificationEmailHtml };
