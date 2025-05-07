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

    // Lägg till room_priority per meeting_type från inställningar
    if (!settings.room_priority) {
      settings.room_priority = {};
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

    const allowedDays = Array.isArray(settings.allowed_atClient_meeting_days)
      ? settings.allowed_atClient_meeting_days.map((d) => d.toLowerCase())
      : null;

    for (let i = 1; i <= maxDays; i++) {
      const day = new Date();
      day.setUTCDate(now.getUTCDate() + i);
      const wd = day.getUTCDay();

      const dayStr = day.toISOString().split('T')[0];
      const dayName = day.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
      if (meeting_type === 'atClient' && allowedDays && !allowedDays.includes(dayName)) {
        context.log(`⏭️ Dag ${dayStr} är ej tillåten för atClient (${dayName})`);
        continue;
      }

      if (wd === 0 || wd === 6) continue;

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

            const windowStart = parseInt((settings.travel_time_window_start || '06:00').split(':')[0], 10);
            const windowEnd = parseInt((settings.travel_time_window_end || '23:00').split(':')[0], 10);
            if (hour < windowStart || hour >= windowEnd) return;

            const groupKey = `${dayStr}_${hour < 12 ? 'fm' : 'em'}`;
            if (slotGroupPicked[groupKey]) return;

            // Infoga logik för room_priority beroende på meeting_type
            if (settings.room_priority && settings.room_priority[meeting_type]) {
              const rooms = settings.room_priority[meeting_type];
              if (!Array.isArray(rooms) || rooms.length === 0) return;

              const fetch = (await import('node-fetch')).default;
              context.log(`📡 Anropar Graph för rum:`, rooms);
              const tokenRes = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  client_id: process.env.GRAPH_CLIENT_ID,
                  client_secret: process.env.GRAPH_CLIENT_SECRET,
                  scope: 'https://graph.microsoft.com/.default',
                  grant_type: 'client_credentials'
                })
              });
              const tokenData = await tokenRes.json();
              const accessToken = tokenData.access_token;

              const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(rooms[0])}/calendar/getSchedule`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  schedules: rooms,
                  startTime: {
                    dateTime: start.toISOString(),
                    timeZone: settings.timezone || 'Europe/Stockholm'
                  },
                  endTime: {
                    dateTime: end.toISOString(),
                    timeZone: settings.timezone || 'Europe/Stockholm'
                  },
                  availabilityViewInterval: 30
                })
              });
              const data = await res.json();
              context.log('📥 Graph-svar:', JSON.stringify(data, null, 2));
              const anyRoomFree = Array.isArray(data.value)
                ? data.value.some(r => !r.availabilityView.includes('1'))
                : false;
              context.log(
                `🏢 Rumsledighetskontroll för ${dayStr} ${hour}:`,
                Array.isArray(data.value)
                  ? data.value.map(r => ({
                      room: r.scheduleId || '[saknas]',
                      view: r.availabilityView || '[tom]'
                    }))
                  : '[Inget svar från Graph]'
              );
              if (!anyRoomFree) return;
            }

            slotGroupPicked[groupKey] = true;

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

            // Fragmenteringskoll: sloten måste ligga minst min_gap_minutes från början och slutet av bokningsfönstret
            const minGapMinutes = settings.min_gap_minutes || 30;
            if (hour < openHour + Math.ceil(minGapMinutes / 60) || hour > closeHour - Math.ceil(minGapMinutes / 60) - Math.ceil(length / 60)) return;

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