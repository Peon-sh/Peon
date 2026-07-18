/**
 * Shared HTML shell for transactional emails.
 * Layout: full-width grey background with a centered 560px white content card.
 */

const SUPPORT_EMAIL = 'support@peon.sh';
const BRAND = 'Peon';
const ACCENT = '#0C9268';

/** Dark mark for light backgrounds (email card is white). Prefer PNG for Gmail. */
const LOGO_LIGHT_BG = 'https://peon.sh/logos/logo-500.png';

export function emailHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    p { margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif;
      background-color: #F3F3F4;
      margin: 0; padding: 0; width: 100%;
      -webkit-font-smoothing: antialiased;
    }
    @media only screen and (max-width: 600px) {
      .email-card { width: 100% !important; }
      .section { padding-left: 24px !important; padding-right: 24px !important; }
      .otp { font-size: 24px !important; letter-spacing: 8px !important; }
    }
  </style>
</head>`;
}

export function emailHeader(): string {
  // Self-contained dark tile mark — works on the white email card.
  return `
          <tr>
            <td class="section" style="padding: 28px 36px; border-bottom: 1px solid #E8EAED;">
              <a href="https://peon.sh" style="text-decoration: none;">
                <img src="${LOGO_LIGHT_BG}" alt="${BRAND}" width="48" height="48" style="display: block; width: 48px; height: 48px; border: 0; outline: none;" />
              </a>
            </td>
          </tr>`;
}

export function emailFooter(): string {
  const year = new Date().getFullYear();
  return `
          <tr>
            <td class="section" style="padding: 28px 36px 32px; border-top: 1px solid #E8EAED;">
              <p style="font-size: 12px; line-height: 18px; color: #4A5568; margin: 0;">
                Need help? Contact us at
                <a href="mailto:${SUPPORT_EMAIL}" style="color: ${ACCENT}; text-decoration: underline;">${SUPPORT_EMAIL}</a>
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 16px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-top: 1px solid #E8EAED; font-size: 0; line-height: 0; height: 1px;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="font-size: 11px; line-height: 18px; color: #9AA3AF; margin: 0;">
                © ${year} ${BRAND}. All rights reserved.
              </p>
            </td>
          </tr>`;
}

/** Wraps body rows in full-width grey shell with a centered 560px white card. */
export function wrapEmail(title: string, bodyRows: string): string {
  return `${emailHead(title)}
<body style="margin: 0; padding: 0; background-color: #F3F3F4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F3F3F4;">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <table role="presentation" class="email-card" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; overflow: hidden; max-width: 560px;">
${emailHeader()}
${bodyRows}
${emailFooter()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailBodySection(innerHtml: string): string {
  return `
          <tr>
            <td class="section" style="padding: 32px 36px;">
              ${innerHtml}
            </td>
          </tr>`;
}

export function emailCtaButton(href: string, label: string): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
                <tr>
                  <td style="border-radius: 8px; background-color: ${ACCENT};">
                    <a href="${href}" style="display: inline-block; padding: 12px 22px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      ${label}
                    </a>
                  </td>
                </tr>
              </table>`;
}
