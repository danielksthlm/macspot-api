function verifyBookingSettings(settings, context) {
  const expected = {
    default_office_address: 'string',
    default_home_address: 'string',
    fallback_travel_time_minutes: 'number',
    buffer_between_meetings: 'number',
    default_meeting_length_atOffice: 'object',
    default_meeting_length_atClient: 'object',
    default_meeting_length_digital: 'object',
    meeting_types: 'object',
    block_weekends: 'boolean',
    open_time: 'string',
    close_time: 'string',
    lunch_start: 'string',
    lunch_end: 'string',
    travel_time_window_start: 'string',
    travel_time_window_end: 'string',
    require_approval: 'boolean',
    max_days_in_advance: 'number',
    max_weekly_booking_minutes: 'number',
    cache_ttl_minutes: 'number',
    allowed_atClient_meeting_days: 'object',
    timezone: 'string'
  };

  const issues = [];
  for (const [key, type] of Object.entries(expected)) {
    const val = settings[key];
    if (val === undefined) {
      issues.push(`❌ Saknar inställning: ${key}`);
    } else if (key === 'allowed_atClient_meeting_days') {
      if (!Array.isArray(val) || !val.every(v => typeof v === 'string')) {
        issues.push(`⚠️ Typfel för ${key}: ska vara array av strängar`);
      }
    } else if (key === 'require_approval') {
      if (typeof val !== 'boolean') {
        issues.push(`⚠️ Typfel för ${key}: ska vara boolean`);
      }
    } else if (typeof val !== type) {
      issues.push(`⚠️ Typfel för ${key}: har ${typeof val}, förväntade ${type}`);
    }
  }

  if (issues.length > 0) {
    const message = '🛑 Problem med booking_settings:\n' + issues.join('\n');
    context.log.warn(message);
    throw new Error(message);
  } else {
    context.log('✅ Alla booking_settings har rätt typ och finns definierade.');
  }
}

module.exports = async function (context, req) {
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    };
    return;
  }

  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      body: { message: 'Method Not Allowed' }
    };
    return;
  }

  try {
    const { Pool } = require('pg');
    const startTimeMs = Date.now();

    const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
    for (const key of requiredEnv) {
      if (!process.env[key]) {
        throw new Error(`Missing environment variable: ${key}`);
      }
    }
    context.log('🔐 Environment variables verified');

    const pool = new Pool({
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: { rejectUnauthorized: false }
    });
    context.log('✅ PostgreSQL pool created');

    const { email, meeting_type, meeting_length } = req.body || {};

    const db = await pool.connect();

    const contactRes = await db.query('SELECT * FROM contact WHERE booking_email = $1', [email]);
    const contact = contactRes.rows[0];
    context.log('👤 Kontakt hittad:', contact);

    const settingsRes = await db.query('SELECT key, value, value_type FROM booking_settings');
    const settings = {};
    for (const row of settingsRes.rows) {
      if (
        row.value_type === 'json' ||
        row.value_type === 'array' ||
        (typeof row.value_type === 'string' && /\[\]$/.test(row.value_type))
      ) {
        try {
          settings[row.key] = JSON.parse(typeof row.value === 'string' ? row.value : JSON.stringify(row.value));
        } catch (_) {}
      } else if (row.value_type === 'int') {
        settings[row.key] = parseInt(row.value);
      } else if (row.value_type === 'bool') {
        settings[row.key] = row.value === 'true' || row.value === true;
      } else if (row.value_type === 'string') {
        settings[row.key] = String(row.value).replace(/^"(.*)"$/, '$1');
      } else {
        settings[row.key] = row.value;
      }
    }
    context.log('⚙️ Inställningar laddade:', Object.keys(settings));
    verifyBookingSettings(settings, context);

    if (!email || !meeting_type || !meeting_length) {
      context.res = {
        status: 400,
        body: { error: 'Missing one or more required fields: email, meeting_type, meeting_length' }
      };
      return;
    }

    // Example loop where slots are pushed to chosen (this is a placeholder to show where to add the logic)
    // Assuming you have an array of slots and a chosen array:
    // const slots = [...]; // your slots array
    // const chosen = [];
    // for (const slot of slots) {
    //   const slotIso = slot.isoString; // example property
    //   const travelTimeMin = settings.fallback_travel_time_minutes || 0;
    //   const returnTravelTimeMin = travelTimeMin; // or some logic for return travel time

    //   let requireApprovalForThisSlot = false;

    //   const windowStartHour = parseInt((settings.travel_time_window_start || '06:00').split(':')[0], 10);
    //   const windowEndHour = parseInt((settings.travel_time_window_end || '23:00').split(':')[0], 10);

    //   const travelStart = new Date(new Date(slotIso).getTime() - travelTimeMin * 60000);
    //   const travelEnd = new Date(new Date(slotIso).getTime() + meeting_length * 60000 + returnTravelTimeMin * 60000);

    //   if (travelStart.getHours() < windowStartHour || travelEnd.getHours() > windowEndHour) {
    //     requireApprovalForThisSlot = true;
    //     context.log(`⚠️ Slot markeras med require_approval: true pga resa utanför fönster (${travelStart.toISOString()}–${travelEnd.toISOString()})`);
    //   }

    //   chosen.push({
    //     ...slot,
    //     require_approval: requireApprovalForThisSlot
    //   });
    // }

    const elapsedMs = Date.now() - startTimeMs;
    context.log(`⏱️ Total exekveringstid: ${elapsedMs} ms`);

    context.res = {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: {
        received: {
          email,
          meeting_type,
          meeting_length
        }
      }
    };
  } catch (error) {
    context.log('🔥 FEL:', error.message, '\nSTACK:', error.stack);
    context.res = {
      status: 500,
      body: { error: error.message, stack: error.stack }
    };
  }
};
