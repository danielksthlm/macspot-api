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

    const bookingsByDay = {};
    const slotGroupPicked = {};
    const chosen = [];

    const maxDays = settings.max_days_in_advance || 14;
    const today = new Date();
    const days = Array.from({ length: maxDays }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      return date;
    });

    if (!email || !meeting_type || !meeting_length) {
      context.res = {
        status: 400,
        body: { error: 'Missing one or more required fields: email, meeting_type, meeting_length' }
      };
      return;
    }

    const travelTimeMin = settings.fallback_travel_time_minutes || 0;
    const returnTravelTimeMin = travelTimeMin;

    const windowStartHour = parseInt((settings.travel_time_window_start || '06:00').split(':')[0], 10);
    const windowEndHour = parseInt((settings.travel_time_window_end || '23:00').split(':')[0], 10);

    for (const day of days) {
      const dateStr = day.toISOString().split('T')[0];
      const weekdayName = day.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      if (settings.block_weekends && (day.getDay() === 0 || day.getDay() === 6)) {
        context.log(`⏭️ Skipper ${dateStr} (helg)`);
        continue;
      }

      if (
        meeting_type === 'atClient' &&
        Array.isArray(settings.allowed_atClient_meeting_days) &&
        !settings.allowed_atClient_meeting_days.includes(weekdayName)
      ) {
        context.log(`⏭️ Skipper ${dateStr} – ej tillåten veckodag (${weekdayName}) för atClient`);
        continue;
      }

      for (const hour of [10, 14]) {
        const slotTime = new Date(`${dateStr}T${hour.toString().padStart(2, '0')}:00:00Z`);

        const lunchStart = new Date(`${dateStr}T${settings.lunch_start || '11:45'}:00Z`);
        const lunchEnd = new Date(`${dateStr}T${settings.lunch_end || '13:15'}:00Z`);
        const slotEndTime = new Date(slotTime.getTime() + meeting_length * 60000);

        if (slotTime < lunchEnd && slotEndTime > lunchStart) {
          context.log(`🍽️ Slot ${slotTime.toISOString()} överlappar lunch – skippar`);
          continue;
        }

        if (!bookingsByDay[dateStr]) {
          const bookingsRes = await db.query(
            'SELECT start_time, end_time FROM bookings WHERE start_time::date = $1',
            [dateStr]
          );
          bookingsByDay[dateStr] = bookingsRes.rows.map(b => ({
            start: new Date(b.start_time).getTime(),
            end: new Date(b.end_time).getTime()
          }));
        }

        const bufferMs = (settings.buffer_between_meetings || 15) * 60 * 1000;
        const slotStart = slotTime.getTime();
        const slotEnd = slotStart + meeting_length * 60000;

        let isTooClose = false;
        for (const b of bookingsByDay[dateStr]) {
          if (
            Math.abs(slotStart - b.end) < bufferMs ||
            Math.abs(slotEnd - b.start) < bufferMs ||
            (slotStart < b.end && slotEnd > b.start)
          ) {
            isTooClose = true;
            break;
          }
        }

        if (isTooClose) {
          context.log(`⛔ Slot ${slotTime.toISOString()} krockar eller ligger för nära annan bokning – skippar`);
          continue;
        }

        const weekStart = new Date(slotTime);
        weekStart.setUTCHours(0, 0, 0, 0);
        weekStart.setUTCDate(slotTime.getUTCDate() - slotTime.getUTCDay()); // söndag
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

        const weekRes = await db.query(
          `SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS minutes
           FROM bookings
           WHERE meeting_type = $1 AND start_time >= $2 AND start_time < $3`,
          [meeting_type, weekStart.toISOString(), weekEnd.toISOString()]
        );

        const bookedMinutes = parseInt(weekRes.rows[0].minutes) || 0;
        const maxMinutes = settings.max_weekly_booking_minutes || 99999;

        if (bookedMinutes + meeting_length > maxMinutes) {
          context.log(`📛 Slot ${slotTime.toISOString()} avvisad – veckokvot överskrids (${bookedMinutes} + ${meeting_length} > ${maxMinutes})`);
          continue;
        }

        const travelStart = new Date(slotTime.getTime() - travelTimeMin * 60000);
        const travelEnd = new Date(slotTime.getTime() + meeting_length * 60000 + returnTravelTimeMin * 60000);

        let requireApprovalForThisSlot = false;
        if (travelStart.getHours() < windowStartHour || travelEnd.getHours() > windowEndHour) {
          requireApprovalForThisSlot = true;
          context.log(`⚠️ Slot ${slotTime.toISOString()} markeras med require_approval: true pga resa utanför fönster (${travelStart.toISOString()}–${travelEnd.toISOString()})`);
        }

        const key = `${dateStr}_${hour < 12 ? 'fm' : 'em'}`;
        if (slotGroupPicked[key]) {
          context.log(`⏩ Skippar ${key} – redan vald`);
          continue;
        }

        chosen.push({
          slot_iso: slotTime.toISOString(),
          require_approval: requireApprovalForThisSlot
        });
        slotGroupPicked[key] = true;
      }
    }

    const elapsedMs = Date.now() - startTimeMs;
    context.log(`⏱️ Total exekveringstid: ${elapsedMs} ms`);

    context.res = {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: {
        slots: chosen
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
