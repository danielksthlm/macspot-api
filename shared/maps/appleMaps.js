console.log("🧪 appleMaps.js laddades");
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

async function getAppleMapsAccessToken(context) {
  try {
    const teamId = process.env.APPLE_MAPS_TEAM_ID;
    const keyId = process.env.APPLE_MAPS_KEY_ID;
    const privateKey = process.env.APPLE_MAPS_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!privateKey) {
      throw new Error('Apple Maps private key saknas – kontrollera APPLE_MAPS_PRIVATE_KEY');
    }

    const token = jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      issuer: teamId,
      keyid: keyId,
      expiresIn: '1h',
      header: {
        alg: 'ES256',
        kid: keyId,
        typ: 'JWT'
      }
    });

    const res = await fetch('https://maps-api.apple.com/v1/token', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();
    return data.accessToken;
  } catch (err) {
    context?.log?.('⚠️ Misslyckades hämta Apple Maps token:', err.message);
    if (err.code === 'EAI_AGAIN') {
      context?.log?.('🌐 DNS-fel (EAI_AGAIN) – kunde inte nå servern:', err.message);
    }
    return null;
  }
}


async function getTravelTimeInMinutes(origin, destination, departureTime, accessToken, context) {
  try {
    const url = `https://maps-api.apple.com/v1/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&departureTime=${encodeURIComponent(departureTime)}&transportType=automobile&includeTravelTimeBreakdown=true`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!res.ok) {
      const text = await res.text();
      context?.log?.(`❌ Apple Maps-directions misslyckades (${res.status}): ${text}`);
      return null;
    }

    const data = await res.json();
    const travelTimeSeconds = data.routes?.[0]?.expectedTravelTime;
    return travelTimeSeconds ? Math.ceil(travelTimeSeconds / 60) : null;
  } catch (err) {
    context?.log?.(`❌ Fel vid directions-anrop: ${err.message}`);
    return null;
  }
}

async function getTravelTime(origin, destination, departureTime, context) {
  try {
    const token = await getAppleMapsAccessToken(context);
    if (!token) {
      context?.log?.('⚠️ Kunde inte hämta Apple Maps-token');
      return null;
    }
    return await getTravelTimeInMinutes(origin, destination, departureTime, token, context);
  } catch (err) {
    context?.log?.(`❌ Fel i getTravelTime: ${err.message}`);
    return null;
  }
}

async function safeGetTravelTime(origin, destination, departureTime, accessToken, context) {
  try {
    const url = new URL('https://maps-api.apple.com/v1/directions');
    url.searchParams.append('origin', origin);
    url.searchParams.append('destination', destination);
    url.searchParams.append('transportType', 'automobile');
    url.searchParams.append('departureTime', departureTime);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // max 8s

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text();
      context?.log?.(`❌ Apple Maps misslyckades (${res.status}): ${text}`);
      return null;
    }

    const data = await res.json();
    const seconds = data.routes?.[0]?.durationSeconds || data.routes?.[0]?.expectedTravelTime;
    return seconds ? Math.round(seconds / 60) : null;
  } catch (err) {
    context?.log?.(`⚠️ safeGetTravelTime error: ${err.message}`);
    return null;
  }
}

module.exports = {
  getAppleMapsAccessToken,
  getTravelTimeInMinutes,
  getTravelTime,
  safeGetTravelTime
};