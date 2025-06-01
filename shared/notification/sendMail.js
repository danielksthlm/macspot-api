const fetch = require('node-fetch');

/**
 * Send mail with HTML body (no newline replacements, allows any HTML).
 * Optionally adds a tracking pixel at the end of the body.
 * Can be used to send Zoom/Teams invitations or in-person meeting details,
 * based on meeting_type and booking_settings formatting.
 *
 * @param {Object} param0
 * @param {string} param0.to
 * @param {string} param0.subject
 * @param {string} param0.body - HTML string
 * @param {string|null} [param0.trackingPixelUrl] - Optional tracking pixel image url
 */
async function sendMail({ to, subject, body, trackingPixelUrl = null }) {
  const tenantId = process.env.MS365_TENANT_ID;
  const clientId = process.env.MS365_CLIENT_ID;
  const clientSecret = process.env.MS365_CLIENT_SECRET;
  const sender = process.env.MS365_USER_EMAIL;

  if (!tenantId || !clientId || !clientSecret || !sender) {
    throw new Error("❌ Saknar miljövariabler för Microsoft Graph");
  }

  // Hämta token
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: 'https://graph.microsoft.com/.default',
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });

  if (!tokenRes.ok) {
    const error = await tokenRes.text();
    throw new Error(`❌ Misslyckades hämta token: ${error}`);
  }

  const { access_token } = await tokenRes.json();

  // Prepare HTML body with optional tracking pixel
  const htmlBody =
    trackingPixelUrl
      ? body + `<br><img src="${trackingPixelUrl}" width="1" height="1" style="display:none;">`
      : body;

  const mailRes = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: htmlBody
        },
        toRecipients: [{ emailAddress: { address: to } }]
      },
      saveToSentItems: false
    })
  });

  if (mailRes.ok && process.env.DEBUG_EMAIL === 'true') {
    console.log(`✅ E-post skickad till ${to} via Graph API`);
    console.log(`📧 Mailinnehåll skickat till: ${to}`);
    console.log(`🧾 Ämne: ${subject}`);
    console.log(`📝 Body (start): ${body.substring(0, 60).replace(/\n/g, ' ')}...`);
  }

  if (process.env.DEBUG_EMAIL === 'true') {
    console.log(`📤 E-post skickas till: ${to}`);
    console.log(`✉️ Ämne: ${subject}`);
  }

  if (!mailRes.ok) {
    const error = await mailRes.text();
    console.error(`❌ Misslyckades skicka mail till ${to} – ämne: ${subject}`);
    throw new Error(`❌ Fel från Graph API: ${error}`);
  }
}

module.exports = { sendMail };