// Global Apple Maps access token cache
let appleMapsAccessToken = null;
// Slot pattern frequency tracker
const slotPatternFrequency = {}; // key = hour + meeting_length → count
const travelTimeCache = {}; // key = fromAddress->toAddress


let jwt;

console.log('📍 Definierar getGraphAccessToken...');

// ────────────── Microsoft Graph Access Token Helper ──────────────
async function getGraphAccessToken(fetch) {
  const tenant = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    scope: 'https://graph.microsoft.com/.default',
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('Kunde inte hämta Graph-token');
  return data.access_token;
}



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
async function preloadTravelTime(context, db, settings, fullAddress, meeting_type, fetchParam) {
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
    const fs = await import('fs');
    const privateKey = process.env.APPLE_MAPS_PRIVATE_KEY?.replace(/\\n/g, '\n') || fs.readFileSync(process.env.APPLE_MAPS_KEY_PATH, 'utf8');
    const token = jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      issuer: teamId,
      keyid: keyId,
      expiresIn: '1h',
      header: { alg: 'ES256', kid: keyId, typ: 'JWT' }
    });
    try {
      const tokenRes = await fetchParam('https://maps-api.apple.com/v1/token', {
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
    // const travelKey = `${fromAddress}->${toAddress}`; // removed as per instructions
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
      const res = await fetchParam(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const durationSec = data.routes?.[0]?.durationSeconds;
      const travelTimeMin = Math.round((durationSec || 0) / 60);
      travelTimeCache[hourKey] = travelTimeMin;
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
  let execStart;
  let db;
  let lengths;
  context.log('🔍 Börjar köra funktionen – före import');
  try {
    context.log('📦 Försöker importera pg...');
    ({ Pool } = await import('pg'));
    context.log('✅ pg importerat');

    context.log('📦 Försöker importera node-fetch...');
    fetch = (await import('node-fetch')).default;
    context.log('✅ node-fetch importerat');

    context.log('📦 Försöker importera uuid...');
    ({ v4: uuidv4 } = await import('uuid'));
    context.log('✅ uuid importerat');

    jwt = await import('jsonwebtoken');
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
    await preloadTravelTime(context, db, settings, fullAddress, meeting_type, fetch);

    // ────────────── 3. GENERERA TILLGÄNGLIGA SLOTS ──────────────
    // --- Cacha bokningar per dag ---
    const bookingsByDay = {};

    for (let i = 1; i <= maxDays; i++) {
      const day = new Date(now);
      day.setUTCDate(now.getUTCDate() + i);
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
          // --- START: TIMLOOP KOD ---
          // Skapa slot start och end
          let slotAccepted = true;
          const wd = day.getUTCDay();
          // Exempel: Skapa start och end Date-objekt
          const start = new Date(day);
          start.setUTCHours(hour, 0, 0, 0);
          const len = lengths && lengths.length ? lengths[0] : requestedLength;
          const end = new Date(start);
          end.setUTCMinutes(end.getUTCMinutes() + len);

          // 1. Helgkoll
          if (wd === 0 || wd === 6) {
            // Söndag (0) eller lördag (6)
            // Avvisad: helgdag
            context.log('📛 Avvisad: helgdag');
            continue;
          }

          // 2. Lunchkoll
          // Antag: lunch är 12:00-13:00 (eller från settings)
          const lunchStart = settings.lunch_start || '12:00';
          const lunchEnd = settings.lunch_end || '13:00';
          const lunchStartDate = new Date(start);
          lunchStartDate.setUTCHours(parseInt(lunchStart.split(':')[0], 10), parseInt(lunchStart.split(':')[1], 10), 0, 0);
          const lunchEndDate = new Date(start);
          lunchEndDate.setUTCHours(parseInt(lunchEnd.split(':')[0], 10), parseInt(lunchEnd.split(':')[1], 10), 0, 0);
          // Om sloten överlappar lunch
          if ((start < lunchEndDate && end > lunchStartDate)) {
            context.log(`📛 Avvisad: överlappar lunch (${start.toISOString()}–${end.toISOString()})`);
            continue;
          }

          // 3. Krockkoll: Finns bokning som krockar?
          // (Pseudo: hämta krockar från DB, här simulerat)
          const conflictRes = await db.query(
            `SELECT 1 FROM bookings
             WHERE ($1, $2) OVERLAPS (start_time, end_time)`,
            [start.toISOString(), end.toISOString()]
          );
          // ... här skulle DB-koden gå ...
          if (conflictRes.rowCount > 0) {
            context.log('📛 Avvisad: krockar med befintlig bokning');
            continue;
          }

          // 4. Veckokvot koll (ex: max_weekly_booking_minutes)
          const weekRes = await db.query(
            `SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS minutes
             FROM bookings WHERE meeting_type = $1
             AND start_time >= $2::date
             AND start_time < ($2::date + interval '7 days')`,
            [meeting_type, start.toISOString()]
          );
          const bookedMinutes = parseInt(weekRes.rows[0].minutes) || 0;
          if (bookedMinutes + len > (settings.max_weekly_booking_minutes || 99999)) {
            context.log(`📛 Avvisad: veckokvot överskriden (${bookedMinutes} + ${len} > ${settings.max_weekly_booking_minutes})`);
            continue;
          }

          // 5. Isolationskoll (för nära annan bokning?)
          let isIsolated = true;
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
          const bufferMin = settings.buffer_between_meetings || 15;
          const bufferMs = bufferMin * 60 * 1000;
          const slotStart = start.getTime();
          const slotEnd = end.getTime();
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
          if (!isIsolated) {
            context.log('📛 Avvisad: för nära annan bokning (ej isolerad)');
            continue;
          }

          // 6. Restidskoll (ex: travelTimeMin > fallback)
          const hourKey = `${fullAddress.toLowerCase()}|${settings.default_office_address.toLowerCase()}|${start.getUTCHours()}`;
          let travelTimeMin = travelTimeCache[hourKey] || settings.fallback_travel_time_minutes || 90;
          const fallback = settings.fallback_travel_time_minutes || 60;
          if (travelTimeMin > fallback) {
            context.log(`📛 Avvisad: restid ${travelTimeMin} > fallback ${fallback}`);
            continue;
          }

          // 7. Ankomsttid mitt i lunch?
          let arrivalTime = new Date(start); // Simulerat
          if (arrivalTime >= lunchStartDate && arrivalTime < lunchEndDate) {
            context.log(`📛 Avvisad: ankomsttid (${arrivalTime.toISOString()}) skär i lunch (${lunchStart}–${lunchEnd})`);
            continue;
          }

          // 8. Graph: ledigt mötesrum?
          let availableRoom = true;
          if (meeting_type === 'atOffice') {
            const roomList = settings.available_meeting_room || [];
            const accessToken = await getGraphAccessToken(fetch);
            const res = await fetch(`https://graph.microsoft.com/v1.0/users/${process.env.GRAPH_USER_ID}/calendar/getSchedule`, {
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
            const data = await res.json();
            availableRoom = Array.isArray(data.value) && data.value.find(s => !s.availabilityView.includes('1'));
          }
          if (!availableRoom) {
            context.log('📛 Avvisad: inget tillgängligt mötesrum enligt Graph');
            context.log('🪪 Graph-svar:', JSON.stringify(data, null, 2));
            continue;
          }

          // 9. Restid inom fönster?
          let travelHour = hour; // Simulerat
          let windowStart = openHour, windowEnd = closeHour;
          if (travelHour < windowStart || travelHour > windowEnd) {
            context.log(`📛 Avvisad: restid utanför fönster (${travelHour} < ${windowStart} eller > ${windowEnd})`);
            continue;
          }

          // Om sloten är godkänd, returnera info (mock)
          return {
            slot: { iso: start.toISOString(), score: 1 },
            key: `${dayStr}_${hour < 12 ? 'fm' : 'em'}`
          };
          // --- SLUT: TIMLOOP KOD ---
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
