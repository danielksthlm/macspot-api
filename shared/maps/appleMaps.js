

const jwt = require('jsonwebtoken');
const fs = require('fs');
const fetch = require('node-fetch');

async function getAppleMapsAccessToken(context) {
  try {
    const teamId = process.env.APPLE_MAPS_TEAM_ID;
    const keyId = process.env.APPLE_MAPS_KEY_ID;
    const privateKey = process.env.APPLE_MAPS_PRIVATE_KEY?.replace(/\\n/g, '\n') ||
                       fs.readFileSync(process.env.APPLE_MAPS_KEY_PATH, 'utf8');

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

module.exports = {
  getAppleMapsAccessToken
};