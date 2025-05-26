const fetch = require('node-fetch');

function createZoomClient() {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const userId = process.env.ZOOM_USER_ID || 'me';

  if (!clientId || !clientSecret || !accountId) {
    throw new Error("Missing Zoom OAuth credentials in environment variables");
  }

  async function getAccessToken() {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to get Zoom access token: ${text}`);
    }

    const data = await res.json();
    return data.access_token;
  }

  async function createMeeting({ topic, start, duration }) {
    const token = await getAccessToken();

    const res = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic,
        type: 2,
        start_time: start,
        duration,
        timezone: 'Europe/Stockholm'
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Zoom error: ${err}`);
    }

    const result = await res.json();
    console.log(`📅 Zoom-möte skapat: ${result.join_url}`);
    return result;
  }

  return { createMeeting };
}

module.exports = createZoomClient;