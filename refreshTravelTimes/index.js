const { DateTime } = require('luxon');
const fetch = require('node-fetch');
const pool = require('../shared/db/pgPool');
const loadSettings = require('../shared/config/settingsLoader');

module.exports = async function (context, myTimer) {
  const settings = await loadSettings(pool, context);
  const fallbackTravelTime = settings.fallback_travel_time_minutes || 20;
  const today = new Date();
  const timezone = settings.timezone || 'Europe/Stockholm';

  const maxDays = settings.max_days_in_advance || 14;
  const days = Array.from({ length: maxDays }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const destinations = [settings.default_office_address];
  const origins = [settings.default_home_address];

  for (const day of days) {
    for (const hour of [10, 14]) {
      const slotTime = DateTime.fromJSDate(day).set({ hour, minute: 0 }).toJSDate();

      for (const from of origins) {
        for (const to of destinations) {
          const hourKey = slotTime.getUTCHours();
          const key = `${from}|${to}|${hourKey}`;

          const res = await pool.query(
            `SELECT 1 FROM travel_time_cache
             WHERE from_address = $1 AND to_address = $2 AND hour = $3 LIMIT 1`,
            [from, to, hourKey]
          );

          if (res.rows.length > 0) {
            context.log(`⚡ Redan i cache: ${key}`);
            continue;
          }

          context.log(`⏳ Beräknar restid: ${key}`);
          try {
            const token = await getAppleMapsAccessToken(context);
            if (!token) throw new Error('Apple Maps-token saknas');

            const url = new URL('https://maps-api.apple.com/v1/directions');
            url.searchParams.append('origin', from);
            url.searchParams.append('destination', to);
            url.searchParams.append('transportType', 'automobile');
            url.searchParams.append('departureTime', slotTime.toISOString());

            const response = await fetch(url.toString(), {
              headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();

            const minutes = Math.round((data.routes?.[0]?.durationSeconds || fallbackTravelTime * 60) / 60);
            await pool.query(
              `INSERT INTO travel_time_cache (from_address, to_address, hour, travel_minutes)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (from_address, to_address, hour)
               DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes`,
              [from, to, hourKey, minutes]
            );
            context.log(`✅ Sparad restid: ${minutes} min (${key})`);
          } catch (err) {
            context.log(`⚠️ Misslyckades hämta/spara restid för ${key}: ${err.message}`);
          }
        }
      }
    }
  }

  context.log('✅ refreshTravelTimes färdig');
};

async function getAppleMapsAccessToken(context) {
  try {
    const jwt = require('jsonwebtoken');
    const fs = require('fs');

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
    context.log('⚠️ Misslyckades hämta Apple Maps token:', err.message);
    return null;
  }
}