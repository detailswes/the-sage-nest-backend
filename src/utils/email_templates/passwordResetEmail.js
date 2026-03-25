/**
 * Password reset email HTML template.
 *
 * @param {{ name: string, resetUrl: string }} params
 * @returns {string} Full HTML string ready to send
 */
const passwordResetEmailHtml = ({ name, resetUrl }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your Sage Nest password</title>
</head>
<body style="margin:0;padding:0;background:#F5F7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:20px;font-weight:700;color:#1F2933;letter-spacing:-0.3px;">Sage Nest</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #E4E7E4;padding:40px 36px;">

              <!-- Icon -->
              <div style="text-align:center;margin-bottom:28px;">
                <div style="display:inline-block;background-color:#FEF2F2;border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;">
                  <span style="font-size:28px;">🔑</span>
                </div>
              </div>

              <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#1F2933;text-align:center;">
                Reset your password
              </h1>
              <p style="margin:0 0 8px;font-size:15px;color:#4B5563;line-height:1.6;text-align:center;">
                Hi ${name},
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#6B7280;line-height:1.7;text-align:center;">
                We received a request to reset the password for your Sage Nest account.
                Click the button below to choose a new password.
              </p>

              <!-- Expiry warning -->
              <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;margin-bottom:24px;text-align:center;">
                <p style="margin:0;font-size:13px;font-weight:600;color:#DC2626;">
                  ⚠️ This link expires in 1 hour.
                </p>
              </div>

              <!-- CTA Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a
                  href="${resetUrl}"
                  style="display:inline-block;background:#445446;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;"
                >
                  Reset my password
                </a>
              </div>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #E4E7E4;margin:0 0 20px;" />

              <!-- Fallback link -->
              <p style="margin:0 0 6px;font-size:12px;color:#9CA3AF;text-align:center;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 20px;font-size:11px;color:#445446;word-break:break-all;text-align:center;">
                ${resetUrl}
              </p>

              <!-- Security note -->
              <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this email.
                Your password will remain unchanged.
              </p>

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

module.exports = { passwordResetEmailHtml };
