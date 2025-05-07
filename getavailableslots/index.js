module.exports = async function (context, req) {
  context.log('✅ Funktion anropad');

  if (!req || !req.body) {
    context.res = {
      status: 400,
      body: { error: 'Saknar req.body' }
    };
    return;
  }

  const { email, meeting_type, meeting_length } = req.body;
  context.log('📥 Data mottagen:', { email, meeting_type, meeting_length });

  // Dynamisk import av pg
  const { Pool } = await import('pg');

  // Skapa pool och anslutning
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
    // Hämta kontakt
    const contactRes = await client.query(
      'SELECT * FROM contact WHERE booking_email = $1',
      [email]
    );
    const contact = contactRes.rows[0];
    context.log('📍 Kontakt:', contact);

    // Hämta settings
    const settingsRes = await client.query('SELECT key, value, value_type FROM booking_settings');
    const settings = {};
    for (const row of settingsRes.rows) {
      if (row.value_type === 'int') settings[row.key] = parseInt(row.value);
      else if (row.value_type === 'bool') settings[row.key] = row.value === 'true';
      else if (row.value_type === 'json') settings[row.key] = JSON.parse(row.value);
      else settings[row.key] = row.value;
    }
    context.log('⚙️ Settings:', settings);

    // Sätt variabler
    const maxDays = settings.max_days_in_advance || 14;
    const openHour = parseInt((settings.open_time || '08:00').split(':')[0], 10);
    const closeHour = parseInt((settings.close_time || '16:00').split(':')[0], 10);
    const lunchStart = settings.lunch_start || '12:00';
    const lunchEnd = settings.lunch_end || '13:00';
    const bufferMin = settings.buffer_between_meetings || 15;
    const maxWeeklyMinutes = settings.max_weekly_booking_minutes || 99999;

    const slotGroupPicked = {};
    const chosen = [];
    const now = new Date();

    for (let i = 1; i <= maxDays; i++) {
      const day = new Date();
      day.setUTCDate(now.getUTCDate() + i);
      const wd = day.getUTCDay();
      // 1. Hoppa över helgdagar
      if (wd === 0 || wd === 6) {
        context.log(`⏭️ Dag ${day.toISOString().split('T')[0]} är helg (${wd}), hoppar över`);
        continue;
      }

      const dayStr = day.toISOString().split('T')[0];
      const lunchStartHour = parseInt(lunchStart.split(':')[0], 10);
      const lunchEndHour = parseInt(lunchEnd.split(':')[0], 10);

      for (let hour = openHour; hour < closeHour; hour++) {
        const start = new Date(day);
        start.setUTCHours(hour, 0, 0, 0);
        const end = new Date(start);
        end.setUTCMinutes(end.getUTCMinutes() + meeting_length);

        // 2. Lunchkoll
        if (hour >= lunchStartHour && hour < lunchEndHour) {
          context.log(`⏭️ ${start.toISOString()} är under lunch (${lunchStart}-${lunchEnd})`);
          continue;
        }

        // 3. Krockkoll
        const conflict = await client.query(
          `SELECT 1 FROM bookings WHERE ($1, $2) OVERLAPS (start_time, end_time)`,
          [start.toISOString(), end.toISOString()]
        );
        if (conflict.rowCount > 0) {
          context.log(`⏭️ ${start.toISOString()} krockar med befintlig bokning`);
          continue;
        }

        // 4. Veckokvot
        const weekRes = await client.query(
          `SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS minutes
           FROM bookings WHERE meeting_type = $1
           AND start_time >= $2::date
           AND start_time < ($2::date + interval '7 days')`,
          [meeting_type, start.toISOString()]
        );
        const bookedMinutes = parseInt(weekRes.rows[0].minutes) || 0;
        if (bookedMinutes + meeting_length > maxWeeklyMinutes) {
          context.log(`⏭️ ${start.toISOString()} överskrider veckokvot (${bookedMinutes} + ${meeting_length} > ${maxWeeklyMinutes})`);
          continue;
        }

        // 5. Isolationskoll (buffert mellan möten)
        const existingRes = await client.query(
          `SELECT start_time, end_time FROM bookings WHERE start_time::date = $1`,
          [dayStr]
        );
        const bufferMs = bufferMin * 60 * 1000;
        const slotStart = start.getTime();
        const slotEnd = end.getTime();
        let isolated = true;
        for (const r of existingRes.rows) {
          const s = new Date(r.start_time).getTime();
          const e = new Date(r.end_time).getTime();
          if ((Math.abs(slotStart - e) < bufferMs) ||
              (Math.abs(slotEnd - s) < bufferMs) ||
              (slotStart < e && slotEnd > s)) {
            isolated = false;
            context.log(`⏭️ ${start.toISOString()} är för nära annat möte (${new Date(r.start_time).toISOString()}-${new Date(r.end_time).toISOString()})`);
            break;
          }
        }
        if (!isolated) continue;

        // 6. fm/em-grupp - endast en slot per dag/fm/em
        const groupKey = `${dayStr}_${hour < 12 ? 'fm' : 'em'}`;
        if (slotGroupPicked[groupKey]) {
          context.log(`⏭️ ${start.toISOString()} - redan valt slot för ${groupKey}`);
          continue;
        }
        slotGroupPicked[groupKey] = true;

        // 7. Beräkna fromAddress, toAddress, hourKey och logga hourKey före chosen.push
        const metadata = contact?.metadata || {};
        const fullAddress = [metadata.address, metadata.postal_number, metadata.city].filter(Boolean).join(', ');
        const fromAddress = (meeting_type === 'atClient' ? settings.default_office_address : fullAddress).trim().toLowerCase();
        const toAddress = (meeting_type === 'atClient' ? fullAddress : settings.default_office_address).trim().toLowerCase();
        const hourKey = `${fromAddress}|${toAddress}|${hour}`;
        context.log('🧭 hourKey för slot:', hourKey);
        chosen.push(start.toISOString());
        context.log(`✅ Slot tillagd: ${start.toISOString()}`);
      }
    }

    context.res = {
      status: 200,
      body: { slots: chosen }
    };
  } finally {
    client.release();
  }
};
