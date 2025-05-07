export default async function (context, req) {
  const execStart = Date.now();
  context.log('✅ Funktion getavailableslots anropad');

  if (!req || !req.body) {
    context.res = {
      status: 400,
      body: { error: 'Saknar req.body' }
    };
    return;
  }

  const { email, meeting_type, meeting_length } = req.body;
  const length = parseInt(meeting_length, 10);
  if (!email || !meeting_type || isNaN(length) || length <= 0) {
    context.res = {
      status: 400,
      body: { error: 'Ogiltig eller ofullständig body' }
    };
    return;
  }

  const pg = await import('pg');
  const { Pool } = pg;

  const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '5432', 10),
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    const contactRes = await client.query('SELECT * FROM contact WHERE booking_email = $1', [email]);
    const contact = contactRes.rows[0];
    if (!contact) {
      context.res = { status: 404, body: { error: 'Kontakt ej hittad' } };
      return;
    }

    const settingsRes = await client.query('SELECT key, value, value_type FROM booking_settings');
    const settings = {};
    for (const row of settingsRes.rows) {
      if (row.value_type === 'int') settings[row.key] = parseInt(row.value);
      else if (row.value_type === 'bool') settings[row.key] = row.value === 'true';
      else if (row.value_type === 'json') {
        try {
          settings[row.key] = typeof row.value === 'string'
            ? JSON.parse(row.value)
            : row.value;
        } catch (e) {
          context.log.warn(`⚠️ Kunde inte parsa settings-nyckel ${row.key}:`, row.value);
          settings[row.key] = null;
        }
      }
      else settings[row.key] = row.value;
    }

    const maxDays = settings.max_days_in_advance || 14;
    context.log(`📆 max_days_in_advance (tolkad): ${maxDays}`);
    const openHour = parseInt((settings.open_time || '08:00').split(':')[0], 10);
    const closeHour = parseInt((settings.close_time || '16:00').split(':')[0], 10);
    const lunchStart = settings.lunch_start || '12:00';
    const lunchEnd = settings.lunch_end || '13:00';
    const bufferMin = settings.buffer_between_meetings || 15;
    const maxWeeklyMinutes = settings.max_weekly_booking_minutes || 99999;
    const fallback = settings.fallback_travel_time_minutes || 60;

    const metadata = contact?.metadata || {};
    const fullAddress = [metadata.address, metadata.postal_number, metadata.city].filter(Boolean).join(', ');
    const fromAddress = (meeting_type === 'atClient' ? settings.default_office_address : fullAddress).trim().toLowerCase();
    const toAddress = (meeting_type === 'atClient' ? fullAddress : settings.default_office_address).trim().toLowerCase();

    const slotGroupPicked = {};
    const chosen = [];
    const now = new Date();

    for (let i = 1; i <= maxDays; i++) {
      const day = new Date();
      day.setUTCDate(now.getUTCDate() + i);
      const wd = day.getUTCDay();
      if (wd === 0 || wd === 6) continue;

      const dayStr = day.toISOString().split('T')[0];
      const existingRes = await client.query(
        `SELECT start_time, end_time FROM bookings WHERE start_time::date = $1`,
        [dayStr]
      );
      const existingBookings = existingRes.rows.map(r => ({
        start: new Date(r.start_time).getTime(),
        end: new Date(r.end_time).getTime()
      }));

      const lunchStartHour = parseInt(lunchStart.split(':')[0], 10);
      const lunchEndHour = parseInt(lunchEnd.split(':')[0], 10);

      await Promise.all(
        Array.from({ length: closeHour - openHour - Math.ceil(length / 60) + 1 }, (_, offset) => openHour + offset)
          .map(async (hour) => {
            const start = new Date(day);
            start.setUTCHours(hour, 0, 0, 0);
            const end = new Date(start);
            end.setUTCMinutes(end.getUTCMinutes() + length);

            if (hour >= lunchStartHour && hour < lunchEndHour) return;

            const conflict = await client.query(
              `SELECT 1 FROM bookings WHERE ($1, $2) OVERLAPS (start_time, end_time)`,
              [start.toISOString(), end.toISOString()]
            );
            if (conflict.rowCount > 0) return;

            const weekRes = await client.query(
              `SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS minutes
               FROM bookings WHERE meeting_type = $1
               AND start_time >= $2::date
               AND start_time < ($2::date + interval '7 days')`,
              [meeting_type, start.toISOString()]
            );
            const bookedMinutes = parseInt(weekRes.rows[0].minutes) || 0;
            if (bookedMinutes + length > maxWeeklyMinutes) return;

            const bufferMs = bufferMin * 60 * 1000;
            const slotStart = start.getTime();
            const slotEnd = end.getTime();
            let isolated = true;
            for (const { start: s, end: e } of existingBookings) {
              if ((Math.abs(slotStart - e) < bufferMs) ||
                  (Math.abs(slotEnd - s) < bufferMs) ||
                  (slotStart < e && slotEnd > s)) {
                isolated = false;
                break;
              }
            }
            if (!isolated) return;

            const groupKey = `${dayStr}_${hour < 12 ? 'fm' : 'em'}`;
            if (slotGroupPicked[groupKey]) return;
            slotGroupPicked[groupKey] = true;

            const hourKey = `${fromAddress}|${toAddress}|${hour}`;
            const travelTimeRes = await client.query(
              `SELECT travel_minutes FROM travel_time_cache WHERE from_address = $1 AND to_address = $2 AND hour = $3`,
              [fromAddress, toAddress, hour]
            );

            let travelTimeMin;
            if (travelTimeRes.rows.length > 0) {
              travelTimeMin = travelTimeRes.rows[0].travel_minutes;
            } else {
              travelTimeMin = fallback;
            }
            if (travelTimeMin > fallback) return;

            chosen.push(start.toISOString());
          })
      );
    }

    context.log(`📊 Antal godkända slots: ${chosen.length}`);
    context.res = {
      status: 200,
      body: { slots: chosen }
    };
  } catch (err) {
    context.log.error('❌ Fel i getavailableslots:', err);
    context.res = {
      status: 500,
      body: { error: err.message || JSON.stringify(err) }
    };
  } finally {
    client.release();
    const execEnd = Date.now();
    context.log(`⏱️ Exekveringstid: ${execEnd - execStart} ms`);
  }
}