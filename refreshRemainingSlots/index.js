const fs = require('fs');
const dayjs = require('dayjs');
const isoWeek = require('dayjs/plugin/isoWeek');
dayjs.extend(isoWeek);

const { Client } = require('pg');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

module.exports = async function (context, req) {
  const { email, meeting_type } = req.body || {};
  if (!email || !meeting_type) {
    context.res = { status: 400, body: 'Email och mötestyp krävs.' };
    return;
  }

  const client = new Client({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '5432', 10),
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    const contactResult = await client.query(
      'SELECT * FROM contact WHERE booking_email = $1 LIMIT 1',
      [email]
    );
    const contact = contactResult.rows[0];
    const metadata = contact?.metadata || {};
    const fullAddress = [metadata.address, metadata.postal_code, metadata.city]
      .filter(Boolean)
      .join(', ');

    const settingsRes = await client.query('SELECT key, value, value_type FROM booking_settings');
    const settings = {};
    for (const row of settingsRes.rows) {
      if (row.value_type === 'json' || row.value_type === 'array') {
        try {
          settings[row.key] = JSON.parse(typeof row.value === 'string' ? row.value : JSON.stringify(row.value));
        } catch (_) {}
      } else if (row.value_type === 'int') {
        settings[row.key] = parseInt(row.value);
      } else if (row.value_type === 'bool') {
        settings[row.key] = row.value === 'true';
      } else {
        settings[row.key] = row.value;
      }
    }

    const maxDays = settings.max_days_in_advance || 60;
    const today = dayjs();
    const currentMonthEnd = today.endOf('month');
    const startDay = currentMonthEnd.add(1, 'day');

    let created = 0;
    for (let i = 0; i <= (maxDays - today.date()); i++) {
      const d = startDay.add(i, 'day');
      const dayStr = d.format('YYYY-MM-DD');
      const weekday = d.format('dddd').toLowerCase();

      if (settings.block_weekends && (weekday === 'saturday' || weekday === 'sunday')) continue;
      if (
        meeting_type === 'atClient' &&
        settings.allowed_atClient_meeting_days &&
        !settings.allowed_atClient_meeting_days.includes(weekday)
      ) {
        continue;
      }

      const openHour = parseInt((settings.open_time || '08:00').split(':')[0], 10);
      const closeHour = parseInt((settings.close_time || '16:00').split(':')[0], 10);
      const lengths = settings[`default_meeting_length_${meeting_type}`] || [60];

      for (let hour = openHour; hour < closeHour; hour++) {
        for (const len of lengths) {
          const start = new Date(`${dayStr}T${String(hour).padStart(2, '0')}:00:00`);
          const end = new Date(start.getTime() + len * 60000);
          const slotIso = start.toISOString();
          const slotPart = hour < 12 ? 'fm' : 'em';
          const slotDay = slotIso.split('T')[0];

          const accessToken = await getAppleMapsAccessToken();
          const fromAddress = settings.default_office_address;
          const toAddress = fullAddress;
          const travelTimeMin = await getTravelTime(fromAddress, toAddress, start, accessToken);
          if (travelTimeMin === Number.MAX_SAFE_INTEGER) continue;

          await client.query(
            `INSERT INTO available_slots_cache (
              meeting_type, meeting_length, slot_day, slot_part, slot_iso, slot_score,
              travel_time_min, generated_at, expires_at
            ) VALUES ($1, $2, $3, $4, $5, 99999, $6, NOW(), NOW() + interval '${settings.cache_ttl_minutes || 1440} minutes')
            ON CONFLICT DO NOTHING`,
            [meeting_type, len, slotDay, slotPart, slotIso, travelTimeMin]
          );
          created++;
        }
      }
    }

    context.res = { status: 200, body: { status: 'ok', cached_slots: created } };
  } catch (err) {
    context.res = { status: 500, body: err.message };
  } finally {
    await client.end();
  }
};

// Riktiga Apple Maps-anrop (identiskt med getavailableslots)
async function getAppleMapsAccessToken() {
  try {
    const teamId = process.env.APPLE_MAPS_TEAM_ID;
    const keyId = process.env.APPLE_MAPS_KEY_ID;
    let privateKey;
    if (process.env.APPLE_MAPS_PRIVATE_KEY) {
      privateKey = process.env.APPLE_MAPS_PRIVATE_KEY.replace(/\\n/g, '\n');
    } else if (process.env.APPLE_MAPS_KEY_PATH) {
      privateKey = fs.readFileSync(process.env.APPLE_MAPS_KEY_PATH, 'utf8');
    } else {
      throw new Error('Ingen Apple Maps-nyckel tillgänglig (varken APPLE_MAPS_PRIVATE_KEY eller APPLE_MAPS_KEY_PATH)');
    }
    const token = jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      issuer: teamId,
      keyid: keyId,
      expiresIn: '1h',
      header: { alg: 'ES256', kid: keyId, typ: 'JWT' }
    });
    const res = await fetch('https://maps-api.apple.com/v1/token', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.accessToken;
  } catch (err) {
    return null;
  }
}

async function getTravelTime(from, to, start, token) {
  try {
    const url = new URL('https://maps-api.apple.com/v1/directions');
    url.searchParams.append('origin', from);
    url.searchParams.append('destination', to);
    url.searchParams.append('transportType', 'automobile');
    url.searchParams.append('departureTime', start.toISOString());

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    const durationSec = data.routes?.[0]?.durationSeconds;
    return Math.round((durationSec || 0) / 60);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}