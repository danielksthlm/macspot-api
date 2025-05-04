export default async function (context, req) {
  const { Pool } = await import('pg');
  const fetch = (await import('node-fetch')).default;
  const { v4: uuidv4 } = await import('uuid');

  context.log('📥 Funktion getavailableslots anropad');

  const { email, meeting_type } = req.body || {};
  context.log('📧 Email:', email, '📅 Mötestyp:', meeting_type);
  if (!email || !meeting_type) {
    context.res = {
      status: 400,
      body: { error: 'Email och mötestyp krävs.' }
    };
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const db = await pool.connect();

    // 🛠️ Hämta kontaktmetadata (om finns)
    const contactRes = await db.query('SELECT * FROM contact WHERE booking_email = $1', [email]);
    const contact = contactRes.rows[0];
    const metadata = contact?.metadata || {};
    context.log('👤 Kontakt hittad:', contact);
    context.log('📍 Metadata-adress:', metadata?.address);

    // 📦 Hämta alla inställningar
    const settingsRes = await db.query('SELECT key, value, value_type FROM booking_settings');
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
    context.log('⚙️ Inställningar laddade:', Object.keys(settings));

    const meetingLengths = {
      atClient: settings.default_meeting_length_atClient,
      atOffice: settings.default_meeting_length_atOffice,
      Zoom: settings.default_meeting_length_digital,
      FaceTime: settings.default_meeting_length_digital,
      Teams: settings.default_meeting_length_digital
    };

    const lengths = meetingLengths[meeting_type] || [30];
    const now = new Date();
    const slots = [];

    for (let i = 1; i <= 14; i++) {
      const day = new Date();
      day.setDate(now.getDate() + i);
      const dayStr = day.toISOString().split('T')[0];

      for (let hour = 8; hour <= 16; hour++) {
        for (const len of lengths) {
          const start = new Date(`${dayStr}T${String(hour).padStart(2, '0')}:00:00`);
          const end = new Date(start.getTime() + len * 60000);

          // 🚫 Kolla helg
          if (settings.block_weekends) {
            const wd = start.getDay();
            if (wd === 0 || wd === 6) continue;
          }

          // ⏱️ Kontrollera veckokvot
          const weekRes = await db.query(
            `SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS minutes
             FROM bookings WHERE meeting_type = $1
             AND start_time >= $2::date
             AND start_time < ($2::date + interval '7 days')`,
            [meeting_type, start.toISOString()]
          );
          const bookedMinutes = parseInt(weekRes.rows[0].minutes) || 0;
          if (bookedMinutes + len > (settings.max_weekly_booking_minutes || 99999)) continue;

          // ⛔ Krockar (förenklad mock – riktig logik kan ersättas senare)
          const conflictRes = await db.query(
            `SELECT 1 FROM bookings
             WHERE ($1, $2) OVERLAPS (start_time, end_time)`,
            [start.toISOString(), end.toISOString()]
          );
          if (conflictRes.rowCount > 0) continue;

          context.log(`🕐 Testar slot ${start.toISOString()} - ${end.toISOString()} (${len} min)`);

          // 🧭 Kontrollera restid med Apple Maps
          try {
            const jwt = require('jsonwebtoken');
            const fs = require('fs');
            const teamId = process.env.APPLE_MAPS_TEAM_ID;
            const keyId = process.env.APPLE_MAPS_KEY_ID;
            const privateKey = process.env.APPLE_MAPS_PRIVATE_KEY?.replace(/\\n/g, '\n') || fs.readFileSync(process.env.APPLE_MAPS_KEY_PATH, 'utf8');

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

            const tokenRes = await fetch('https://maps-api.apple.com/v1/token', {
              headers: {
                Authorization: `Bearer ${token}`
              }
            });

            const tokenData = await tokenRes.json();
            const accessToken = tokenData.accessToken;
            context.log('🔑 Apple token hämtad');
            if (!accessToken) continue;

            const fromAddress = meeting_type === 'atClient'
              ? settings.default_office_address
              : metadata.address || settings.default_home_address;

            const toAddress = meeting_type === 'atClient'
              ? metadata.address || settings.default_home_address
              : settings.default_office_address;

            context.log('🗺️ Från:', fromAddress, '→ Till:', toAddress);

            const url = new URL('https://maps-api.apple.com/v1/directions');
            url.searchParams.append('origin', fromAddress);
            url.searchParams.append('destination', toAddress);
            url.searchParams.append('transportType', 'automobile');
            url.searchParams.append('departureTime', start.toISOString());

            context.log('📡 Maps request URL:', url.toString());

            const res = await fetch(url.toString(), {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            });

            const data = await res.json();
            const durationSec = data.routes?.[0]?.durationSeconds;
            const travelTimeMin = Math.round((durationSec || 0) / 60);

            context.log('⏱️ Restid:', travelTimeMin, 'min');

            const fallback = parseInt(settings.fallback_travel_time_minutes || '90', 10);
            if (travelTimeMin === 0 || travelTimeMin > fallback) continue;

          } catch (err) {
            context.log('⚠️ Restidskontroll misslyckades, använder fallback:', err.message);
            // Om restidskontroll misslyckas, tillåt ändå slot
          }

          // 🏢 Kontrollera tillgängligt mötesrum via Graph API för atOffice
          if (meeting_type === 'atOffice') {
            try {
              const tokenRes = await fetch('https://login.microsoftonline.com/' + process.env.MS365_TENANT_ID + '/oauth2/v2.0/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  client_id: process.env.MS365_CLIENT_ID,
                  client_secret: process.env.MS365_CLIENT_SECRET,
                  scope: 'https://graph.microsoft.com/.default',
                  grant_type: 'client_credentials'
                })
              });

              const tokenData = await tokenRes.json();
              const accessToken = tokenData.access_token;
              context.log('📞 Graph token hämtad');
              if (!accessToken) continue;

              const roomList = settings.available_meeting_room || [];
              context.log('🏢 Rumslista:', roomList);

              const res = await fetch('https://graph.microsoft.com/v1.0/users/daniel@klrab.se/calendar/getSchedule', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  schedules: roomList,
                  startTime: { dateTime: start.toISOString(), timeZone: 'Europe/Stockholm' },
                  endTime: { dateTime: end.toISOString(), timeZone: 'Europe/Stockholm' },
                  availabilityViewInterval: 30
                })
              });

              const scheduleData = await res.json();
              context.log('📊 Graph response:', scheduleData);

              const availableRoom = scheduleData.value.find(s => !s.availabilityView.includes('1'));
              if (!availableRoom) continue;

            } catch (err) {
              context.log('⚠️ Graph API-rumskontroll misslyckades:', err.message);
              continue;
            }
          }

          context.log('✅ Slot godkänd:', start.toISOString());
          // ✅ Lägg till slot
          slots.push(start.toISOString());
        }
      }
    }

    context.res = {
      status: 200,
      body: { slots }
    };
  } catch (err) {
    context.log('❌ Fel i getavailableslots:', err.message);
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  } finally {
    await pool.end();
  }
}
