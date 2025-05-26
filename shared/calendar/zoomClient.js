const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

function createZoomClient() {
  const apiKey = process.env.ZOOM_API_KEY;
  const apiSecret = process.env.ZOOM_API_SECRET;
  const userId = process.env.ZOOM_USER_ID || 'me';

  if (!apiKey || !apiSecret) {
    throw new Error("Missing Zoom API credentials in environment variables");
  }

  const token = jwt.sign(
    { iss: apiKey, exp: Math.floor(Date.now() / 1000) + 60 },
    apiSecret
  );

  async function createMeeting({ topic, start, duration }) {
    const res = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic,
        type: 2, // Scheduled meeting
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