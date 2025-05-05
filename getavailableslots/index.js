// Slot pattern frequency tracker
const slotPatternFrequency = {}; // key = hour + meeting_length → count
const travelTimeCache = {}; // key = fromAddress->toAddress
import jwt from 'jsonwebtoken';
import fs from 'fs';
export default async function (context, req) {
  let Pool, fetch, uuidv4;
  try {
    ({ Pool } = await import('pg'));
    fetch = (await import('node-fetch')).default;
    ({ v4: uuidv4 } = await import('uuid'));
    context.log('📦 Imports lyckades');
  } catch (err) {
    context.log.error('❌ Import-fel:', err.message);
    context.res = {
      status: 500,
      body: { error: 'Import misslyckades', detail: err.message }
    };
    return;
  }

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

  const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing environment variable: ${key}`);
    }
  }
  context.log.info('🔐 Environment variables verified');

  const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '5432', 10),
    ssl: { rejectUnauthorized: false }
  });
  context.log.info('✅ PostgreSQL pool created');

  try {
    const db = await pool.connect();

    // 🛠️ Hämta kontaktmetadata (om finns) från contact-tabellen
    const contactRes = await db.query('SELECT * FROM contact WHERE booking_email = $1', [email]);
    const contact = contactRes.rows[0];
    const metadata = contact?.metadata || {};
    const fullAddress = [metadata.address, metadata.postal_number, metadata.city]
      .filter(Boolean)
      .join(', ');
    context.log('📍 Fullständig kundadress:', fullAddress);
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
    const requiredKeys = [
      'default_office_address',
      'default_home_address',
      'fallback_travel_time_minutes',
      'buffer_between_meetings',
      'available_meeting_room',
      'default_meeting_length_atOffice',
      'default_meeting_length_atClient',
      'default_meeting_length_digital'
    ];
    const missing = requiredKeys.filter(k => settings[k] === undefined);
    if (missing.length > 0) {
      context.log.warn('⚠️ Saknade settings-nycklar:', missing);
    }

    const meetingLengths = {
      atClient: settings.default_meeting_length_atClient,
      atOffice: settings.default_meeting_length_atOffice,
      Zoom: settings.default_meeting_length_digital,
      FaceTime: settings.default_meeting_length_digital,
      Teams: settings.default_meeting_length_digital
    };

    const requestedLength = parseInt(req.body.meeting_length, 10);
    if (!requestedLength || isNaN(requestedLength)) {
      context.res = {
        status: 400,
        body: { error: "meeting_length måste anges (t.ex. 60)" }
      };
      return;
    }
    context.log('📐 Möteslängd vald av kund:', requestedLength);
    const lengths = [requestedLength];
    
    const now = new Date();
    // const slots = [];
    // const lengths = ... (old declaration removed, see above)
    const slotMap = {}; // dag_fm/em → [{ iso, score }]

    const graphCache = {}; // key = dayStr_fm/em, value = Graph schedule data
    const appleCache = {}; // key = slot ISO, value = travel time (minutes)

    for (let i = 1; i <= 14; i++) {
      const day = new Date();
      day.setDate(now.getDate() + i);
      const dayStr = day.toISOString().split('T')[0];

      for (let hour = 8; hour <= 16; hour++) {
        const graphKey = `${dayStr}_${hour < 12 ? 'fm' : 'em'}`;

        // 🏢 Kontrollera tillgängligt mötesrum via Graph API för atOffice (cache per day-part)
        if (meeting_type === 'atOffice' && !graphCache[graphKey]) {
          try {
            let accessToken;
            try {
              const tokenRes = await fetch('https://login.microsoftonline.com/' + process.env.GRAPH_TENANT_ID + '/oauth2/v2.0/token', {
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
              context.log('🔐 Graph token response:', tokenData);
              if (!tokenRes.ok) {
                context.log('❌ Graph token fetch failed with status:', tokenRes.status);
              }
              accessToken = tokenData.access_token;
              if (!accessToken) {
                context.log('⚠️ Ingen Graph accessToken – hoppar över slotgrupp');
                graphCache[graphKey] = null;
              } else {
                context.log('🌐 Graph via MacSpot Debug App (guest)');
                context.log('📞 Graph token hämtad');
              }
            } catch (err) {
              context.log('⚠️ Misslyckades hämta Graph token:', err.message);
              graphCache[graphKey] = null;
            }

            if (accessToken) {
              const roomList = settings.available_meeting_room || [];
              context.log('🏢 Rumslista:', roomList);

              try {
                const startTime = new Date(dayStr + 'T' + String(hour).padStart(2, '0') + ':00:00');
                const endTime = new Date(startTime.getTime() + Math.max(...lengths) * 60000);

                const res = await fetch(`https://graph.microsoft.com/v1.0/users/${process.env.GRAPH_USER_ID}/calendar/getSchedule`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    schedules: roomList,
                    startTime: { dateTime: startTime.toISOString(), timeZone: 'Europe/Stockholm' },
                    endTime: { dateTime: endTime.toISOString(), timeZone: 'Europe/Stockholm' },
                    availabilityViewInterval: 30
                  })
                });

                graphCache[graphKey] = await res.json();
                context.log('📊 Graph response cached for', graphKey);
              } catch (err) {
                context.log('⚠️ Misslyckades hämta Graph schema:', err.message);
                graphCache[graphKey] = null;
              }
            }
          } catch (err) {
            context.log('⚠️ Graph API-rumskontroll misslyckades:', err.message);
            graphCache[graphKey] = null;
          }
        }

        for (const len of lengths) {
          const start = new Date();
          start.setDate(day.getDate());
          start.setHours(hour, 0, 0, 0);
          const end = new Date(start.getTime() + len * 60000);

          // Track repeated slot patterns (hour/length)
          const slotKey = `${start.getHours()}_${len}`;
          slotPatternFrequency[slotKey] = (slotPatternFrequency[slotKey] || 0) + 1;

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
          context.log('📄 Slotdata:', { start: start.toISOString(), end: end.toISOString(), len });

          // Hämta dagens bokningar
          const existingRes = await db.query(
            `SELECT start_time, end_time FROM bookings
             WHERE start_time::date = $1`,
            [dayStr]
          );
          const existing = existingRes.rows.map(r => ({
            start: new Date(r.start_time).getTime(),
            end: new Date(r.end_time).getTime()
          }));

          const slotStart = start.getTime();
          const slotEnd = end.getTime();
          const hourSlot = start.getHours();
          const bufferMin = settings.buffer_between_meetings || 15;
          const bufferMs = bufferMin * 60 * 1000;

          // Avvisa om sloten ligger för nära annan bokning
          let isIsolated = true;
          for (const e of existing) {
            if (
              (Math.abs(slotStart - e.end) < bufferMs) ||
              (Math.abs(slotEnd - e.start) < bufferMs) ||
              (slotStart < e.end && slotEnd > e.start)
            ) {
              isIsolated = false;
              break;
            }
          }
          if (!isIsolated) continue;

          const key = `${dayStr}_${hourSlot < 12 ? 'fm' : 'em'}`;
          context.log(`🕵️‍♀️ Slotgruppsnyckel: ${key}`);
          if (!slotMap[key]) slotMap[key] = [];

          const minDist = Math.min(...existing.map(e => Math.abs(slotStart - e.end)));
          slotMap[key].push({
            iso: start.toISOString(),
            score: isFinite(minDist) ? minDist : 99999
          });
          context.log(`⭐️ Slot score (isolation): ${isFinite(minDist) ? minDist : 99999}`);

          // 🧭 Kontrollera restid med Apple Maps och Graph API token fallback (cache per slot)
          const slotIso = start.toISOString();
          if (!appleCache[slotIso]) {
            try {
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

              let accessToken;
              try {
                const tokenRes = await fetch('https://maps-api.apple.com/v1/token', {
                  headers: {
                    Authorization: `Bearer ${token}`
                  }
                });

                const tokenData = await tokenRes.json();
                accessToken = tokenData.accessToken;
                if (!accessToken) {
                  context.log('⚠️ Ingen Apple Maps accessToken – hoppar över slot');
                  appleCache[slotIso] = Number.MAX_SAFE_INTEGER;
                  continue;
                }
                context.log('🔑 Apple token hämtad');
              } catch (err) {
                context.log('⚠️ Misslyckades hämta Apple Maps token:', err.message);
                appleCache[slotIso] = Number.MAX_SAFE_INTEGER;
                continue;
              }

              const fromAddress = meeting_type === 'atClient'
                ? settings.default_office_address
                : fullAddress || settings.default_home_address;

              const toAddress = meeting_type === 'atClient'
                ? fullAddress || settings.default_home_address
                : settings.default_office_address;

              context.log('🗺️ Från:', fromAddress, '→ Till:', toAddress);

              // --- Travel time cache per address pair ---
              const travelKey = `${fromAddress}->${toAddress}`;
              let travelTimeMin;
              if (travelTimeCache[travelKey] !== undefined) {
                travelTimeMin = travelTimeCache[travelKey];
                context.log('📍 Återanvänder restid från cache:', travelTimeMin, 'min');
              } else {
                const url = new URL('https://maps-api.apple.com/v1/directions');
                url.searchParams.append('origin', fromAddress);
                url.searchParams.append('destination', toAddress);
                url.searchParams.append('transportType', 'automobile');
                url.searchParams.append('departureTime', start.toISOString());

                context.log('📡 Maps request URL:', url.toString());

                try {
                  const res = await fetch(url.toString(), {
                    headers: {
                      Authorization: `Bearer ${accessToken}`
                    }
                  });

                  const data = await res.json();
                  const durationSec = data.routes?.[0]?.durationSeconds;
                  travelTimeMin = Math.round((durationSec || 0) / 60);
                  travelTimeCache[travelKey] = travelTimeMin;
                } catch (err) {
                  context.log('⚠️ Misslyckades hämta restid från Apple Maps:', err.message);
                  travelTimeMin = Number.MAX_SAFE_INTEGER;
                  travelTimeCache[travelKey] = travelTimeMin;
                }
              }
              context.log('⏱️ Restid:', travelTimeMin, 'min');
              appleCache[slotIso] = travelTimeMin;
            } catch (err) {
              context.log('⚠️ Restidskontroll misslyckades, använder fallback:', err.message);
              appleCache[slotIso] = 0; // tillåt ändå slot
            }
          }
          const fallback = parseInt(settings.fallback_travel_time_minutes || '90', 10);
          context.log(`🚦 Fallback restidsgräns: ${fallback} min`);
          if (appleCache[slotIso] > fallback) {
            context.log(`❌ Slot avvisad: restid ${appleCache[slotIso]} > fallback ${fallback}`);
            continue;
          }

          // Kontrollera Graph API schema för atOffice, hoppa om ej tillgängligt
          if (meeting_type === 'atOffice') {
            const scheduleData = graphCache[graphKey];
            if (!scheduleData) continue;
            const errors = (scheduleData.value || [])
              .filter(s => s.error)
              .map(s => ({ room: s.scheduleId, message: s.error.message }));
            context.log('🧨 Graph errors per rum:', errors);

            const availableRoom = Array.isArray(scheduleData.value)
              ? scheduleData.value.find(s => s.availabilityView && !s.availabilityView.includes('1'))
              : null;
            if (!availableRoom) {
              context.log('⚠️ Inget tillgängligt rum i Graph response:', scheduleData.value);
              continue;
            }
          }

          context.log('✅ Slot godkänd:', start.toISOString());
          // slots.push(start.toISOString());
        }
      }
    }

    const chosen = [];
    Object.entries(slotMap).forEach(([key, candidates]) => {
      const best = candidates.sort((a, b) => b.score - a.score)[0];
      if (best) {
        context.log(`📂 Slotgrupp (dag/fm-em): ${key}`);
        context.log(`🏆 Vald slot för ${key}: ${best.iso} (score: ${best.score})`);
        chosen.push(best.iso);
      }
    });

    // Log frequency map of slot patterns
    context.log('📈 Slotmönsterfrekvens per timme/längd:', slotPatternFrequency);

    context.log('📊 Antal godkända slots (totalt):', chosen.length);
    Object.entries(slotMap).forEach(([key, list]) => {
      context.log(`📅 ${key}: testade ${list.length} kandidater`);
    });

    context.res = {
      status: 200,
      body: { slots: chosen }
    };

    if (!context.res) {
      context.res = {
        status: 500,
        body: { error: 'No response was generated in function' }
      };
      context.log.error('❌ Ingen context.res satt – returnerar fallback 500');
    }

    return;
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
