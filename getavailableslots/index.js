// Global Apple Maps access token cache
let appleMapsAccessToken = null;
// Slot pattern frequency tracker
const slotPatternFrequency = {}; // key = hour + meeting_length → count
const travelTimeCache = {}; // key = fromAddress->toAddress
import jwt from 'jsonwebtoken';
import fs from 'fs';


// ────────────── Hjälpfunktioner ──────────────

// Kolla om datum är i innevarande månad
function isInCurrentMonth(date) {
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth()
  );
}

// Rensa gamla cacheade slots
async function pruneExpiredSlotCache(context, pool) {
  try {
    await pool.query('DELETE FROM available_slots_cache WHERE expires_at < NOW()');
    context.log('🧹 Rensade utgångna slots från available_slots_cache');
  } catch (err) {
    context.log.warn('⚠️ Kunde inte rensa cache:', err.message);
  }
}

// Parsar settings från databasen
function parseSettings(settingsRows) {
  const settings = {};
  for (const row of settingsRows) {
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
  return settings;
}

// Ny hjälpfunktion: logga exekveringstid
function logDuration(context, execStart) {
  const execEnd = Date.now();
  context.log(`⏱️ Total exekveringstid: ${execEnd - execStart} ms`);
}

// ────────────── Förladda restider ──────────────
async function preloadTravelTime(context, db, settings, fullAddress, meeting_type) {
  context.log('🚚 Förladdar restider med Apple Maps...');
  const now = new Date();
  const maxDays = settings.max_days_in_advance || 14;
  // Normalisera adresser för cache
  const fromAddress = (
    meeting_type === 'atClient'
      ? settings.default_office_address
      : fullAddress || settings.default_home_address
  )?.trim().toLowerCase();
  const toAddress = (
    meeting_type === 'atClient'
      ? fullAddress || settings.default_home_address
      : settings.default_office_address
  )?.trim().toLowerCase();

  // Återanvänd global token om finns
  if (appleMapsAccessToken) {
    context.log('🔑 Använder cachad Apple Maps accessToken vid preload');
  }

  let accessToken;
  if (appleMapsAccessToken) {
    accessToken = appleMapsAccessToken;
  } else {
    const teamId = process.env.APPLE_MAPS_TEAM_ID;
    const keyId = process.env.APPLE_MAPS_KEY_ID;
    const privateKey = process.env.APPLE_MAPS_PRIVATE_KEY?.replace(/\\n/g, '\n') || fs.readFileSync(process.env.APPLE_MAPS_KEY_PATH, 'utf8');
    const token = jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      issuer: teamId,
      keyid: keyId,
      expiresIn: '1h',
      header: { alg: 'ES256', kid: keyId, typ: 'JWT' }
    });
    try {
      const fetch = (await import('node-fetch')).default;
      const tokenRes = await fetch('https://maps-api.apple.com/v1/token', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const tokenData = await tokenRes.json();
      accessToken = tokenData.accessToken;
      if (!accessToken) {
        context.log('⚠️ Apple Maps-token saknas vid preload');
        return;
      }
      appleMapsAccessToken = tokenData.accessToken;
    } catch (err) {
      context.log('⚠️ Misslyckades hämta Apple-token vid preload:', err.message);
      return;
    }
  }

  for (let i = 1; i <= maxDays; i++) {
    const testDay = new Date();
    testDay.setDate(now.getDate() + i);
    testDay.setUTCHours(8, 0, 0, 0);
    const slotIso = testDay.toISOString();
    const travelKey = `${fromAddress}->${toAddress}`;
    const hourKey = `${fromAddress}|${toAddress}|${testDay.getHours()}`;

    // Kolla travel_time_cache i databasen först
    const existingRes = await db.query(
      'SELECT travel_minutes FROM travel_time_cache WHERE from_address = $1 AND to_address = $2 AND hour = $3',
      [fromAddress, toAddress, testDay.getHours()]
    );
    if (existingRes.rows.length > 0) {
      const cachedMin = existingRes.rows[0].travel_minutes;
      travelTimeCache[hourKey] = cachedMin;
      // appleCache[slotIso] = cachedMin; // kan läggas till om appleCache används globalt
      context.log(`🗃️ Hittade travel_time_cache för ${slotIso}: ${cachedMin} min`);
      continue;
    }

    if (travelTimeCache[hourKey] !== undefined) continue;

    const url = new URL('https://maps-api.apple.com/v1/directions');
    url.searchParams.append('origin', fromAddress);
    url.searchParams.append('destination', toAddress);
    url.searchParams.append('transportType', 'automobile');
    url.searchParams.append('departureTime', slotIso);

    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const durationSec = data.routes?.[0]?.durationSeconds;
      const travelTimeMin = Math.round((durationSec || 0) / 60);
      travelTimeCache[travelKey] = travelTimeMin;
      travelTimeCache[hourKey] = travelTimeMin;
      // appleCache[slotIso] = travelTimeMin;
      context.log(`📦 Förladdad restid för ${slotIso}: ${travelTimeMin} min`);
      // Spara till travel_time_cache (upsert)
      await db.query(`
        INSERT INTO travel_time_cache (from_address, to_address, hour, travel_minutes, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (from_address, to_address, hour)
        DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes, updated_at = NOW()
      `, [fromAddress, toAddress, testDay.getHours(), travelTimeMin]);
      context.log(`🗃️ Sparade travel_time_cache för ${slotIso}: ${travelTimeMin} min`);
    } catch (err) {
      context.log('⚠️ Misslyckades hämta restid vid preload:', err.message);
    }
  }
}

// ────────────── HUVUDFUNKTION ──────────────
export default async function (context, req) {
  // ────────────── 1. INITIERA KONTAKT + INSTÄLLNINGAR ──────────────
  let Pool, fetch, uuidv4, execStart, db, lengths;
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
  if (!req || !req.body) {
    context.log.error('❌ Ingen req.body – felaktigt API-anrop?');
    context.res = {
      status: 400,
      body: { error: 'Bad request – saknar req.body' }
    };
    return;
  }
  execStart = Date.now();

  context.log('🔥 Funktion startar – req.body:', req.body);
  const { email, meeting_type } = req.body || {};
  let requestedLength = parseInt(req.body.meeting_length, 10);
  const booking_email = email; // Use booking_email for cache key and queries
  context.log('📧 Email:', booking_email, '📅 Mötestyp:', meeting_type);
  if (!booking_email || !meeting_type) {
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

  await pruneExpiredSlotCache(context, pool);

  try {
    // --- Slot cache logic ---
    // Skapa slotCacheKey inklusive booking_email
    // Exempel: `${booking_email}_${meeting_type}_${meeting_length}_${dayStr}_${hour < 12 ? 'fm' : 'em'}`
    // Används för slot_cache queries och inserts
    // db initialiseras först när vi behöver slå mot databasen utanför cache

    // Vi flyttar db-connect så att det bara sker om vi verkligen behöver det (ingen cached slot)
    // Kontaktmetadata och inställningar laddas först när vi vet att vi behöver generera slots
    let contact, metadata, fullAddress, settings;
    let settingsRes;
    const now = new Date();
    const slotMap = {}; // dag_fm/em → [{ iso, score }]
    const slotGroupPicked = {}; // nyckel: dag_fm/em, värde: true om en slot redan valts
    const graphCache = {}; // key = dayStr_fm/em, value = Graph schedule data
    const appleCache = {}; // key = slot ISO, value = travel time (minutes)
    const graphHourlyCache = {}; // ny cache per dag+timme

    // ────────────── 1. INITIERA KONTAKT + INSTÄLLNINGAR ──────────────
    if (!db) db = await pool.connect();
    // Hämta kontakt
    const contactRes = await db.query('SELECT * FROM contact WHERE booking_email = $1', [booking_email]);
    contact = contactRes.rows[0];
    metadata = contact?.metadata || {};
    fullAddress = [metadata.address, metadata.postal_number, metadata.city]
      .filter(Boolean)
      .join(', ');
    context.log('📍 Fullständig kundadress:', fullAddress);
    context.log('👤 Kontakt hittad:', contact);
    context.log('📍 Metadata-adress:', metadata?.address);
    // Hämta alla inställningar
    settingsRes = await db.query('SELECT key, value, value_type FROM booking_settings');
    settings = parseSettings(settingsRes.rows);
    context.log('⚙️ Inställningar laddade:', Object.keys(settings));
    context.log(`🕓 Öppettider enligt inställningar: ${settings.open_time}–${settings.close_time}`);
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
    // maxDays och möteslängder
    const maxDays = settings.max_days_in_advance || 14;
    const meetingLengths = {
      atClient: settings.default_meeting_length_atClient,
      atOffice: settings.default_meeting_length_atOffice,
      Zoom: settings.default_meeting_length_digital,
      FaceTime: settings.default_meeting_length_digital,
      Teams: settings.default_meeting_length_digital
    };
    if (!requestedLength || isNaN(requestedLength)) {
      context.res = {
        status: 400,
        body: { error: "meeting_length måste anges (t.ex. 60)" }
      };
      return;
    }
    context.log('📐 Möteslängd vald av kund:', requestedLength);
    if (meeting_type === 'atClient' && Array.isArray(settings.default_meeting_length_atClient)) {
      lengths = settings.default_meeting_length_atClient;
    } else {
      lengths = [requestedLength];
    }

    // ────────────── 2. FÖRLADDA RESTIDER ──────────────
    await preloadTravelTime(context, db, settings, fullAddress, meeting_type);

    // ────────────── 3. GENERERA TILLGÄNGLIGA SLOTS ──────────────
    // --- Cacha bokningar per dag ---
    const bookingsByDay = {};

    for (let i = 1; i <= maxDays; i++) {
      const day = new Date();
      day.setDate(now.getDate() + i);
      // Steg 2: Endast bearbeta dagar i innevarande månad
      const processingPhase = isInCurrentMonth(day) ? 'initial' : 'deferred';
      if (processingPhase === 'deferred') continue; // Endast kör innevarande månad i detta steg
      const dayStr = day.toISOString().split('T')[0];

      const openHour = parseInt((settings.open_time || '08:00').split(':')[0], 10);
      const closeHour = parseInt((settings.close_time || '16:00').split(':')[0], 10);
      let lastAllowedStartHour = closeHour;
      if (lengths) {
        lastAllowedStartHour = closeHour - Math.max(...lengths) / 60;
      }
      // Parallell Promise.all-lösning för timmar
      const hourTasks = [];
      for (let hour = openHour; hour <= lastAllowedStartHour; hour++) {
        hourTasks.push((async () => {
          const slotDay = dayStr;
          const slotPart = hour < 12 ? 'fm' : 'em';
          const key = `${dayStr}_${slotPart}`;
          if (slotGroupPicked[key]) {
            context.log(`⏩ Skippar ${key} – slot redan vald`);
            return null;
          }
          // Gör db.connect() först efter att vi vet att ingen cached slot finns (redan ansluten ovan)
          let cachedSlot;
          try {
            cachedSlot = await db.query(`
              SELECT slot_iso
              FROM available_slots_cache
              WHERE meeting_type = $1
                AND meeting_length = $2
                AND slot_day = $3
                AND slot_part = $4
                AND expires_at > NOW()
              ORDER BY slot_score DESC
              LIMIT 1
            `, [meeting_type, requestedLength, slotDay, slotPart]);
          } catch (err) {
            context.log('⚠️ Kunde inte läsa från available_slots_cache:', err.message);
          }
          if (cachedSlot?.rows.length > 0) {
            const iso = cachedSlot.rows[0].slot_iso;
            return { key, slot: { iso, score: 99999 } };
          }
          // Definiera slotCacheKey för varje dag/timme/typ
          const slotCacheKey = `${booking_email}_${meeting_type}_${requestedLength}_${dayStr}_${hour < 12 ? 'fm' : 'em'}`;
          const graphKey = `${dayStr}_${hour < 12 ? 'fm' : 'em'}`;
          // Nyckel för caching per timme, dag och mötestyp
          const graphHourKey = `${dayStr}_${hour}_${meeting_type}`;

          // Flytta ut startTime och endTime så de kan återanvändas
          const startTime = new Date(dayStr + 'T' + String(hour).padStart(2, '0') + ':00:00');
          const endTime = new Date(startTime.getTime() + Math.max(...lengths) * 60000);

          // 🏢 Kontrollera tillgängligt mötesrum via Graph API för atOffice (cache per dag+timme+mötestyp)
          if (meeting_type === 'atOffice' && !graphHourlyCache[graphHourKey]) {
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
                  // startTime och endTime är redan definierade ovan
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

                  const scheduleData = await res.json();
                  graphHourlyCache[graphHourKey] = scheduleData;
                  context.log('📊 Graph response cached for', graphHourKey);
                } catch (err) {
                  context.log('⚠️ Misslyckades hämta Graph schema:', err.message);
                  graphHourlyCache[graphHourKey] = null;
                }
              }
            } catch (err) {
              context.log('⚠️ Graph API-rumskontroll misslyckades:', err.message);
              graphCache[graphKey] = null;
            }
          }

          // För varje möteslängd, parallellisera travel time-check först
          for (const len of lengths) {
            // Uppdatera slotCacheKey om längd varierar
            const slotCacheKey = `${booking_email}_${meeting_type}_${len}_${dayStr}_${hour < 12 ? 'fm' : 'em'}`;
            const key = `${dayStr}_${hour < 12 ? 'fm' : 'em'}`;
            // Hoppa om slot redan vald för denna grupp
            if (slotGroupPicked[key]) {
              context.log(`⏩ Skippar ${key} – redan vald slot`);
              continue;
            }
            const start = new Date(`${dayStr}T${String(hour).padStart(2, '0')}:00:00`);
            const end = new Date(start.getTime() + len * 60000);

            // Track repeated slot patterns (hour/length)
            const slotKey = `${start.getHours()}_${len}`;
            slotPatternFrequency[slotKey] = (slotPatternFrequency[slotKey] || 0) + 1;

            // 🚫 Kolla helg
            if (settings.block_weekends) {
              const wd = start.getDay();
              if (wd === 0 || wd === 6) continue;
            }
            const wd = start.getDay();
            const weekdayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][wd];
            if (meeting_type === 'atClient' && Array.isArray(settings.allowed_atClient_meeting_days) && !settings.allowed_atClient_meeting_days.includes(weekdayName)) {
              continue;
            }

            // Endast om vi verkligen behöver validera denna slot
            // --- Cacha dagens bokningar ---
            if (!bookingsByDay[dayStr]) {
              const existingRes = await db.query(
                `SELECT start_time, end_time FROM bookings WHERE start_time::date = $1`,
                [dayStr]
              );
              bookingsByDay[dayStr] = existingRes.rows.map(r => ({
                start: new Date(r.start_time).getTime(),
                end: new Date(r.end_time).getTime()
              }));
            }
            const existing = bookingsByDay[dayStr];
            // De övriga queries körs som vanligt
            const [weekRes, conflictRes] = await Promise.all([
              db.query(
                `SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS minutes
                 FROM bookings WHERE meeting_type = $1
                 AND start_time >= $2::date
                 AND start_time < ($2::date + interval '7 days')`,
                [meeting_type, start.toISOString()]
              ),
              db.query(
                `SELECT 1 FROM bookings
                 WHERE ($1, $2) OVERLAPS (start_time, end_time)`,
                [start.toISOString(), end.toISOString()]
              )
            ]);
            const bookedMinutes = parseInt(weekRes.rows[0].minutes) || 0;
            if (bookedMinutes + len > (settings.max_weekly_booking_minutes || 99999)) continue;

            // 🍽️ Uteslut slot som helt eller delvis överlappar lunch
            const lunchStart = settings.lunch_start || '11:45';
            const lunchEnd = settings.lunch_end || '13:15';
            const lunchStartDate = new Date(start.toISOString().split('T')[0] + 'T' + lunchStart + ':00');
            const lunchEndDate = new Date(start.toISOString().split('T')[0] + 'T' + lunchEnd + ':00');
            if (start < lunchEndDate && end > lunchStartDate) {
              context.log(`🍽️ Slot avvisad: överlappar lunch (${lunchStart}–${lunchEnd})`);
              continue;
            }

            // ⛔ Krockar (förenklad mock – riktig logik kan ersättas senare)
            if (conflictRes.rowCount > 0) continue;

            context.log(`🕐 Testar slot ${start.toISOString()} - ${end.toISOString()} (${len} min)`);
            context.log('📄 Slotdata:', { start: start.toISOString(), end: end.toISOString(), len });

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

            // key redan beräknad ovan
            context.log(`🕵️‍♀️ Slotgruppsnyckel: ${key}`);
            // --- Optimera: kör travel time check parallellt först, innan övriga valideringar som kräver restid ---
            const slotIso = start.toISOString();
            // Normalisera adresser för cache
            const fromAddress = (
              meeting_type === 'atClient'
                ? settings.default_office_address
                : fullAddress || settings.default_home_address
            )?.trim().toLowerCase();
            const toAddress = (
              meeting_type === 'atClient'
                ? fullAddress || settings.default_home_address
                : settings.default_office_address
            )?.trim().toLowerCase();
            // Block-cache för negativa resultat (innan Apple Maps-anrop)
            let travelTimeMin = null;
            if (appleCache[`${fromAddress}->${toAddress}`] === 'BLOCKED') {
              context.log(`🚫 Hoppar Maps-anrop: tidigare blockerat för ${fromAddress} → ${toAddress}`);
              continue;
            }
            // Kör travel time check som ett eget async-block och cachea resultatet
            if (!(slotIso in appleCache)) {
              try {
                let accessToken;
                if (appleMapsAccessToken) {
                  accessToken = appleMapsAccessToken;
                  context.log('🔑 Använder cachad Apple Maps accessToken');
                } else {
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
                  try {
                    const tokenRes = await fetch('https://maps-api.apple.com/v1/token', {
                      headers: {
                        Authorization: `Bearer ${token}`
                      }
                    });
                    const tokenData = await tokenRes.json();
                    accessToken = tokenData.accessToken;
                    if (accessToken) {
                      appleMapsAccessToken = tokenData.accessToken;
                    }
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
                }
                context.log('🗺️ Från:', fromAddress, '→ Till:', toAddress);
                // --- Travel time cache per address pair ---
                const travelKey = `${fromAddress}->${toAddress}`;
                // --- Additional cache per hour ---
                const hourKey = `${fromAddress}|${toAddress}|${start.getHours()}`;
                // Kontrollera travel_time_cache i databasen först
                const existingRes = await db.query(
                  'SELECT travel_minutes FROM travel_time_cache WHERE from_address = $1 AND to_address = $2 AND hour = $3',
                  [fromAddress, toAddress, start.getHours()]
                );
                if (existingRes.rows.length > 0) {
                  travelTimeMin = existingRes.rows[0].travel_minutes;
                  travelTimeCache[hourKey] = travelTimeMin;
                  appleCache[slotIso] = travelTimeMin;
                  context.log(`🗃️ Hittade travel_time_cache för ${slotIso}: ${travelTimeMin} min`);
                } else if (travelTimeCache[hourKey] !== undefined) {
                  travelTimeMin = travelTimeCache[hourKey];
                  context.log('📍 Återanvänder restid (timvis cache):', travelTimeMin, 'min');
                  appleCache[slotIso] = travelTimeMin;
                } else if (travelTimeCache[travelKey] !== undefined) {
                  travelTimeMin = travelTimeCache[travelKey];
                  context.log('📍 Återanvänder restid från cache:', travelTimeMin, 'min');
                  appleCache[slotIso] = travelTimeMin;
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
                    travelTimeCache[hourKey] = travelTimeMin; // Spara även per timme
                    appleCache[slotIso] = travelTimeMin;
                    // Spara till travel_time_cache (upsert)
                    await db.query(`
                      INSERT INTO travel_time_cache (from_address, to_address, hour, travel_minutes, updated_at)
                      VALUES ($1, $2, $3, $4, NOW())
                      ON CONFLICT (from_address, to_address, hour)
                      DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes, updated_at = NOW()
                    `, [fromAddress, toAddress, start.getHours(), travelTimeMin]);
                    context.log(`🗃️ Sparade travel_time_cache för ${slotIso}: ${travelTimeMin} min`);
                  } catch (err) {
                    context.log('⚠️ Misslyckades hämta restid från Apple Maps:', err.message);
                    travelTimeMin = Number.MAX_SAFE_INTEGER;
                    travelTimeCache[travelKey] = travelTimeMin;
                    travelTimeCache[hourKey] = travelTimeMin; // Spara även per timme
                    appleCache[slotIso] = travelTimeMin;
                  }
                }
                if (appleCache[slotIso] === undefined) {
                  appleCache[slotIso] = travelTimeCache[hourKey];
                }
                // Lägg till block-cache för negativa resultat
                const fallback = parseInt(settings.fallback_travel_time_minutes || '90', 10);
                if (appleCache[slotIso] > fallback) {
                  appleCache[`${fromAddress}->${toAddress}`] = 'BLOCKED';
                }
              } catch (err) {
                context.log('⚠️ Restidskontroll misslyckades, använder fallback:', err.message);
                appleCache[slotIso] = 0; // tillåt ändå slot
              }
            }
            travelTimeMin = appleCache[slotIso];
            const fallback = parseInt(settings.fallback_travel_time_minutes || '90', 10);
            context.log(`🚦 Fallback restidsgräns: ${fallback} min`);
            if (travelTimeMin > fallback) {
              context.log(`❌ Slot avvisad: restid ${travelTimeMin} > fallback ${fallback}`);
              continue;
            }

            // 🍽️ Undvik restid mitt i lunch
            const arrivalTime = new Date(start.getTime() - travelTimeMin * 60000);
            if (arrivalTime >= lunchStartDate && arrivalTime < lunchEndDate) {
              context.log(`🍽️ Slot avvisad: restid skär i lunch (${arrivalTime.toISOString()} inom lunch)`);
              continue;
            }

            // Kontrollera Graph API schema för atOffice, hoppa om ej tillgängligt
            if (meeting_type === 'atOffice') {
              const scheduleData = graphHourlyCache[graphHourKey];
              if (!scheduleData) continue;
              const errors = (scheduleData.value || [])
                .filter(s => s.error)
                .map(s => ({ room: s.scheduleId, message: s.error.message }));
              context.log('🧨 Graph errors per rum:', errors);

              if (Array.isArray(scheduleData.value)) {
                const availableRoom = scheduleData.value.find(s => Array.isArray(s.availabilityView) && !s.availabilityView.includes('1'));
                if (!availableRoom) {
                  context.log('⚠️ Inget tillgängligt rum i Graph response:', scheduleData.value);
                  continue;
                }
              } else {
                context.log('⚠️ Ogiltig Graph response:', scheduleData);
                continue;
              }
            }

            // ⏰ Kontrollera travel_time_window_start/end
            const travelStart = arrivalTime;
            const travelHour = travelStart.getHours();
            const windowStart = parseInt((settings.travel_time_window_start || '06:00').split(':')[0], 10);
            const windowEnd = parseInt((settings.travel_time_window_end || '23:00').split(':')[0], 10);
            const requiresApproval = settings.require_approval || [];

            if (travelHour < windowStart || travelHour > windowEnd) {
              context.log(`⏰ Slot kräver godkännande: restid utanför tillåtet fönster (${travelHour}:00)`);
              if (!requiresApproval.includes(true)) continue;
            }

            context.log('✅ Slot godkänd:', start.toISOString());
            // --- Cache slot in available_slots_cache ---
            const slotDay = start.toISOString().split('T')[0];
            const slotPart = hour < 12 ? 'fm' : 'em';
            const minDist = Math.min(...existing.map(e => Math.abs(slotStart - e.end)));
            const slotScore = isFinite(minDist) ? minDist : 99999;

            await db.query(`
              INSERT INTO available_slots_cache (
                meeting_type,
                meeting_length,
                slot_day,
                slot_part,
                slot_iso,
                slot_score,
                travel_time_min,
                generated_at,
                expires_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + interval '${settings.cache_ttl_minutes || 1440} minutes')
              ON CONFLICT DO NOTHING
            `, [
              meeting_type,
              len,
              slotDay,
              slotPart,
              slotIso,
              slotScore,
              travelTimeMin
            ]);
            context.log(`🗃️ Slot cache tillagd i available_slots_cache: ${slotIso}`);
            context.log(`🎯 Slot score som cachades: ${slotScore}`);
            // returnera första godkända slot för denna timme
            return { key, slot: { iso: slotIso, score: slotScore } };
          }
          }
          return null;
        })());
      }
      const results = await Promise.all(hourTasks);
      for (const result of results) {
        if (result && result.slot && !slotGroupPicked[result.key]) {
          if (!slotMap[result.key]) slotMap[result.key] = [];
          slotMap[result.key].push(result.slot);
          slotGroupPicked[result.key] = true;
        }
      }
      // Stop loop if maxDays reached
      // (inte behövs, loopen är nu for (let i = 1; i <= maxDays; i++) )
    }

    // ────────────── 4. VÄLJ BÄSTA PER DAGGRUPP ──────────────
    const chosen = [];
    context.log('🧮 Börjar välja bästa slot per grupp...');
    Object.entries(slotMap).forEach(([key, candidates]) => {
      context.log(`📅 Utvärderar slotgrupp ${key} med ${candidates.length} kandidater`);
      const best = candidates.sort((a, b) => b.score - a.score)[0];
      if (best) {
        context.log(`✅ Valde slot ${best.iso} för grupp ${key}`);
        context.log(`📂 Slotgrupp (dag/fm-em): ${key}`);
        context.log(`🏆 Vald slot för ${key}: ${best.iso} (score: ${best.score})`);
        chosen.push(best.iso);
        slotGroupPicked[key] = true; // markera att gruppen har fått en vald slot
      }
    });

    // Log frequency map of slot patterns
    context.log('📈 Slotmönsterfrekvens per timme/längd:', slotPatternFrequency);

    context.log('📊 Antal godkända slots (totalt):', chosen.length);

    // ────────────── 5. RETURNERA TILL KLIENT ──────────────
    context.log('📤 Förbereder svar med valda slots:', chosen);
    context.res = {
      status: 200,
      body: { slots: chosen }
    };
    context.log('🚀 Svar skickas till klient');

    // Trigga bakgrundsrefresh för resterande dagar (deferred)
    fetch(process.env.BACKGROUND_SLOT_REFRESH_URL || 'https://macspotbackend.azurewebsites.net/api/refreshRemainingSlots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: booking_email, meeting_type, meeting_length: requestedLength })
    })
      .then(() => context.log('🚀 Bakgrundsrefresh av slots startad'))
      .catch(err => context.log('⚠️ Misslyckades trigga bakgrundsrefresh:', err.message));

    setTimeout(() => pool.end().then(() => context.log('🛑 pool.end() klar')).catch(e => context.log('⚠️ pool.end() fel:', e.message)), 0);
    return;
  } catch (err) {
    context.log('❌ Fel i getavailableslots:', err.message);
    context.res = {
      status: 500,
      body: { error: err.message }
    };
    return;
  } finally {
    logDuration(context, execStart);
    if (db) db.release();
  }
}
