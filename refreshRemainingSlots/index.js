const dayjs = require('dayjs');

module.exports = async function (context, req) {
  let Client, fetch, uuidv4, jwt, fs;
  try {
    ({ Client } = await import('pg'));
    fetch = (await import('node-fetch')).default;
    ({ v4: uuidv4 } = await import('uuid'));
    jwt = await import('jsonwebtoken');
    fs = require('fs');
  } catch (err) {
    context.log.error('❌ Importfel:', err.message);
    context.log.error('❌ Fullständig stacktrace:', err.stack);
    context.res = { status: 500, body: 'Importfel: ' + err.message };
    return;
  }

  context.log('📥 Funktion refreshRemainingSlots anropad');

  const email = req.body?.email;
  const meetingType = req.body?.meeting_type;
  const meetingLength = req.body?.meeting_length || 60;

  if (!email || !meetingType) {
    context.res = {
      status: 400,
      body: 'Missing email or meeting_type',
    };
    return;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    context.log('✅ Ansluten till databasen');

    // Hämta kontakt
    const contactResult = await client.query(
      'SELECT * FROM contacts WHERE email = $1 LIMIT 1',
      [email]
    );
    if (contactResult.rowCount === 0) {
      context.res = {
        status: 404,
        body: 'Contact not found',
      };
      return;
    }
    const contact = contactResult.rows[0];
    context.log(`✅ Kontakt hittad: ${contact.email}`);

    // Hämta bokningsinställningar
    const settingsResult = await client.query(
      'SELECT * FROM booking_settings LIMIT 1'
    );
    if (settingsResult.rowCount === 0) {
      throw new Error('Booking settings not found');
    }
    const settings = settingsResult.rows[0];
    context.log('✅ Bokningsinställningar hämtade');

    // Beräkna tidsfönster för tillgängliga slots efter innevarande månad
    const now = dayjs();
    const startAfter = now.endOf('month').add(1, 'minute');
    const endWindow = startAfter.add(settings.slot_generation_days || 30, 'day');
    context.log(`⏳ Genererar slots från ${startAfter.format()} till ${endWindow.format()}`);

    // Hämta lunchperioder från inställningar (exempel: "12:00-13:00")
    let lunchStart = null;
    let lunchEnd = null;
    if (settings.lunch_time) {
      const parts = settings.lunch_time.split('-');
      if (parts.length === 2) {
        lunchStart = parts[0];
        lunchEnd = parts[1];
      }
    }

    // Funktion för att kolla om tidpunkt är inom lunch
    function isDuringLunch(date) {
      if (!lunchStart || !lunchEnd) return false;
      const time = date.format('HH:mm');
      return time >= lunchStart && time < lunchEnd;
    }

    // Veckokvot: max antal bokningar per vecka per kontakt
    const weeklyQuota = settings.weekly_quota || 5;

    // Hämta redan bokade slots för kontakt per vecka för att kontrollera kvot
    const bookingsResult = await client.query(
      `SELECT date FROM bookings WHERE contact_id = $1 AND date >= $2 AND date <= $3`,
      [contact.id, startAfter.toDate(), endWindow.toDate()]
    );
    const bookedDates = bookingsResult.rows.map(r => dayjs(r.date));
    const bookingsPerWeek = {};
    bookedDates.forEach(d => {
      const week = d.isoWeek();
      bookingsPerWeek[week] = (bookingsPerWeek[week] || 0) + 1;
    });

    // Funktion för att kontrollera om veckokvot är nådd för ett datum
    function isWeeklyQuotaReached(date) {
      const week = date.isoWeek();
      return (bookingsPerWeek[week] || 0) >= weeklyQuota;
    }

    // Funktion för att beräkna restid via Apple Maps API
    async function getTravelTime(from, to) {
      try {
        const keyId = process.env.APPLE_MAPS_KEY_ID;
        const teamId = process.env.APPLE_MAPS_TEAM_ID;
        const privateKey = process.env.APPLE_MAPS_PRIVATE_KEY.replace(/\\n/g, '\n');
        const url = 'https://maps-api.apple.com/v1/directions';

        const token = jwt.sign({}, privateKey, {
          algorithm: 'ES256',
          expiresIn: '180s',
          issuer: teamId,
          header: {
            alg: 'ES256',
            kid: keyId,
            typ: 'JWT'
          }
        });

        const params = new URLSearchParams({
          origin: from,
          destination: to,
          mode: 'walking'
        });

        const response = await fetch(`${url}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          context.log(`❌ Apple Maps API error: ${response.status} ${response.statusText}`);
          return Number.MAX_SAFE_INTEGER;
        }

        const data = await response.json();
        if (
          data.routes &&
          data.routes.length > 0 &&
          data.routes[0].legs &&
          data.routes[0].legs.length > 0 &&
          typeof data.routes[0].legs[0].durationSeconds === 'number'
        ) {
          const travelTimeMin = Math.ceil(data.routes[0].legs[0].durationSeconds / 60);
          return travelTimeMin;
        } else {
          context.log('❌ Apple Maps API response missing durationSeconds');
          return Number.MAX_SAFE_INTEGER;
        }
      } catch (error) {
        context.log.error('❌ Fel vid anrop till Apple Maps API:', error);
        return Number.MAX_SAFE_INTEGER;
      }
    }

    // Skapa slots med skårning och gruppering
    const slots = [];
    let current = startAfter.startOf('day').hour(settings.workday_start_hour || 8).minute(0);
    const workdayEndHour = settings.workday_end_hour || 18;

    while (current.isBefore(endWindow)) {
      // Hoppa över helger om inställt
      if (settings.exclude_weekends) {
        const day = current.day();
        if (day === 0 || day === 6) {
          current = current.add(1, 'day').hour(settings.workday_start_hour || 8).minute(0);
          continue;
        }
      }

      // Kontrollera lunch
      if (isDuringLunch(current)) {
        current = current.add(1, 'minute');
        continue;
      }

      // Kontrollera veckokvot
      if (isWeeklyQuotaReached(current)) {
        current = current.add(1, 'minute');
        continue;
      }

      // Kontrollera arbetstid
      if (current.hour() < (settings.workday_start_hour || 8) || current.hour() >= workdayEndHour) {
        current = current.add(1, 'day').hour(settings.workday_start_hour || 8).minute(0);
        continue;
      }

      // Beräkna restid till mötesplats (antaget att contact har address)
      const travelTime = await getTravelTime(contact.address, settings.meeting_location || '');
      // Skapa skårning baserat på restid och starttid (exempel)
      let score = 100;
      if (travelTime > 30) score -= 30;
      if (current.hour() < 10) score += 10;
      if (current.hour() >= 16) score -= 10;

      // Skapa slot-objekt
      const slot = {
        id: uuidv4(),
        contact_id: contact.id,
        meeting_type: meetingType,
        start_time: current.toISOString(),
        length_minutes: meetingLength,
        score,
        created_at: new Date(),
      };

      slots.push(slot);

      // Stega fram till nästa slot starttid (t ex 15 min intervaller)
      current = current.add(settings.slot_interval_minutes || 15, 'minute');
    }

    context.log(`🔎 Genererade ${slots.length} slots, börjar cache:a...`);

    // Cachar slots direkt i available_slots_cache tabellen
    const insertQuery = `
      INSERT INTO available_slots_cache
      (id, contact_id, meeting_type, start_time, length_minutes, score, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `;

    for (const slot of slots) {
      await client.query(insertQuery, [
        slot.id,
        slot.contact_id,
        slot.meeting_type,
        slot.start_time,
        slot.length_minutes,
        slot.score,
        slot.created_at,
      ]);
    }

    context.log(`✅ Cachade ${slots.length} slots i available_slots_cache`);

    context.res = {
      status: 200,
      body: `${slots.length} slots skapades`,
    };
  } catch (error) {
    context.log.error('❌ Fel vid refreshRemainingSlots:', error);
    context.res = {
      status: 500,
      body: `Fel: ${error.message}`,
    };
  } finally {
    await client.end();
    context.log('🔌 Databasanslutning stängd');
  }
}