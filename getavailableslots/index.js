// SQL: GRANT USAGE, SELECT ON SEQUENCE calendar_origin_cache_id_seq TO <user>;
const { DateTime } = require('luxon');
const pool = require('../shared/db/pgPool');
const loadSettings = require('../shared/config/settingsLoader');

function verifyBookingSettings(settings, context) {
  const expected = {
    default_office_address: 'string',
    default_home_address: 'string',
    fallback_travel_time_minutes: 'number',
    buffer_between_meetings: 'number',
    default_meeting_length_atoffice: 'array',
    default_meeting_length_atclient: 'array',
    default_meeting_length_digital: 'array',
    meeting_types: 'array',
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
    allowed_atclient_meeting_days: 'array',
    timezone: 'string'
  };

  const issues = [];
  for (const [key, type] of Object.entries(expected)) {
    const val = settings[key];
    if (val === undefined || val === null || (key === 'timezone' && String(val).trim() === '')) {
      issues.push(`❌ Saknar inställning: ${key}`);
    } else if (key === 'allowed_atclient_meeting_days') {
      if (!Array.isArray(val) || !val.every(v => typeof v === 'string')) {
        issues.push(`⚠️ Typfel för ${key}: ska vara array av strängar`);
      }
    } else if (key === 'require_approval') {
      if (typeof val !== 'boolean') {
        issues.push(`⚠️ Typfel för ${key}: ska vara boolean`);
      }
    } else if (type === 'array' ? !Array.isArray(val) : typeof val !== type) {
      issues.push(`⚠️ Typfel för ${key}: har ${typeof val}, förväntade ${type}`);
    }
  }

  if (issues.length > 0) {
    const message = '🛑 Problem med booking_settings:\n' + issues.join('\n');
    context.log.warn(message);
    throw new Error(message);
  }
}

module.exports = async function (context, req) {
  const startTimeMs = Date.now();
  context.log(`📥 Request mottagen: ${JSON.stringify(req.body || {}, null, 2)}`);
  let msGraphAccessToken = null;
  const isDebug = process.env.DEBUG === 'true';
  let debugLog = (msg) => {
    if (isDebug && context && context.log) {
      context.log(msg);
    }
  };
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
    // Pool återanvänds från global instans
    // Import cache-driven origin resolution logic
    const { resolveOriginAddress } = require('../shared/calendar/resolveOrigin');
    debugLog('🏁 Börjar getavailableslots');
    const t0 = Date.now();
    const travelCache = new Map(); // key: from|to|hour

    const slotMap = {}; // dag_fm eller dag_em → array av { iso, score, require_approval }

    const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
    for (const key of requiredEnv) {
      if (!process.env[key]) {
        throw new Error(`Missing environment variable: ${key}`);
      }
    }
    debugLog('🔐 Environment variables verified');
    debugLog('✅ PostgreSQL pool created');
    debugLog('⏱️ Efter env och pool: ' + (Date.now() - t0) + ' ms');

    const { email, contact_id, meeting_type: rawMeetingType, meeting_length } = req.body || {};
    const meeting_type = (rawMeetingType || '').toLowerCase();
    debugLog(`📨 Begäran mottagen med meeting_type: ${meeting_type}, meeting_length: ${meeting_length}, contact_id: ${contact_id}, email: ${email}`);

    const db = await pool.connect();

    // Hämta MS Graph-token en gång
    try {
      const tokenEndpoint = `https://login.microsoftonline.com/${process.env.MS365_TENANT_ID}/oauth2/v2.0/token`;
      const params = new URLSearchParams();
      params.append('client_id', process.env.MS365_CLIENT_ID);
      params.append('client_secret', process.env.MS365_CLIENT_SECRET);
      params.append('scope', 'https://graph.microsoft.com/.default');
      params.append('grant_type', 'client_credentials');

      const tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        msGraphAccessToken = tokenData.access_token;
      } else {
        context.log(`⚠️ Misslyckades hämta Graph-token: ${tokenRes.statusText}`);
      }
    } catch (err) {
      context.log(`⚠️ Fel vid Graph-tokenhämtning: ${err.message}`);
    }

  const contactRes = await db.query('SELECT * FROM contact WHERE id = $1', [contact_id]);
  const contact = contactRes.rows[0];
  debugLog(`👤 Kontakt hittad: ${contact?.id || 'ej funnen'}`);
    const t1 = Date.now();
    debugLog('⏱️ Efter kontakt: ' + (Date.now() - t0) + ' ms');

    const settings = await loadSettings(db, context);
    debugLog(`⚙️ Inställningar laddade: ${Object.keys(settings).join(', ')}`);
    verifyBookingSettings(settings, context);
    debugLog('⚙️ Inställningar klara');
    const timezone = settings.timezone || 'Europe/Stockholm';
    const t2 = Date.now();
    debugLog('⏱️ Efter settings: ' + (Date.now() - t0) + ' ms');

    const bookingsByDay = {};
    const slotGroupPicked = {};
    const chosen = [];

    const maxDays = settings.max_days_in_advance || 14;
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + maxDays);
    const totalDays = maxDays;
    const days = Array.from({ length: totalDays }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      return date;
    });
    debugLog(`📆 Antal dagar att bearbeta: ${days.length}`);
    debugLog('📅 Dagar genererade för bearbetning');

    // --- Ladda alla bokningar för hela intervallet i ett slag ---
    const startDateStr = days[0].toISOString().split('T')[0];
    const endDateStr = days[days.length - 1].toISOString().split('T')[0];
    const allBookingsRes = await db.query(
      'SELECT start_time, end_time, meeting_type FROM bookings WHERE start_time::date >= $1 AND start_time::date <= $2',
      [startDateStr, endDateStr]
    );
    context.log("🔢 Mapping allBookings rows:", allBookingsRes.rows.length);
    const allBookings = allBookingsRes.rows.map(b => ({
      start: new Date(b.start_time).getTime(),
      end: new Date(b.end_time).getTime(),
      date: new Date(b.start_time).toISOString().split('T')[0],
      meeting_type: b.meeting_type
    }));
    context.log("📊 allBookings parsed:", allBookings.map(b => b.start));
    const bookingCount = allBookings.length;
    context.log(`📊 Antal bokningar i intervall: ${bookingCount}`);
    context.log(`👤 Kund: ${contact?.first_name || ''} ${contact?.last_name || ''}, Typ: ${meeting_type}`);
    for (const booking of allBookings) {
      if (!bookingsByDay[booking.date]) bookingsByDay[booking.date] = [];
      bookingsByDay[booking.date].push({ start: booking.start, end: booking.end });
    }
    // --- Summera bokade minuter per vecka & mötestyp ---
    const weeklyMinutesByType = {};
    const weekKey = (date) => {
      const start = new Date(date);
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - start.getUTCDay());
      return start.toISOString().split('T')[0];
    };
    for (const b of allBookings) {
      const type = b.meeting_type || 'unknown';
      const week = weekKey(b.start);
      weeklyMinutesByType[type] = weeklyMinutesByType[type] || {};
      weeklyMinutesByType[type][week] = (weeklyMinutesByType[type][week] || 0) + (b.end - b.start) / 60000;
    }

    if (!contact_id || !meeting_type || !meeting_length) {
      context.res = {
        status: 400,
        body: { error: 'Missing one or more required fields: contact_id, meeting_type, meeting_length' }
      };
      return;
    }

    let travelTimeMin = settings.fallback_travel_time_minutes || 0;
    const returnTravelTimeMin = travelTimeMin;

    const windowStartHour = DateTime.fromISO(`${days[0].toISOString().split('T')[0]}T${settings.travel_time_window_start || '06:00'}`, { zone: timezone }).toUTC().hour;
    const windowEndHour = DateTime.fromISO(`${days[0].toISOString().split('T')[0]}T${settings.travel_time_window_end || '23:00'}`, { zone: timezone }).toUTC().hour;

    // Hämta Apple Maps-token en gång tidigt
    const accessToken = await getAppleMapsAccessToken(context);
    if (!accessToken && isDebug) {
      context.log('⚠️ Apple Maps-token saknas – vissa slots kan använda fallback');
    }
    const t3 = Date.now();
    debugLog('⏱️ Efter Apple Maps token: ' + (Date.now() - t0) + ' ms');

    // Parallellisera dag-loop i chunkar om 7
    const chunkSize = 7;
    debugLog('🔁 Startar slot-loop i chunkar');
    context.log('🔁 Startar slot-loop i chunkar');
    const chunkStartMs = Date.now();
    let slotCount = 0;
    for (let i = 0; i < days.length; i += chunkSize) {
      const chunkT0 = Date.now();
      const chunk = days.slice(i, i + chunkSize);
      context.log(`🔁 Bearbetar chunk ${i / chunkSize + 1} (${chunk.length} dagar)`);
      const results = await Promise.allSettled(
        chunk.map(async (day) => {
          // Loggning i början av funktionen för dag och tid
          const dateStr = day.toISOString().split('T')[0];
          const weekdayName = day.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
          context.log(`📊 Analysdag: ${dateStr} (${weekdayName}) för meeting_type=${meeting_type}`);
          debugLog(`🧪 Kontroll av veckodag '${weekdayName}' mot ${JSON.stringify(settings.allowed_atclient_meeting_days)} för mötestyp: ${meeting_type}`);

          if (settings.block_weekends && (day.getDay() === 0 || day.getDay() === 6)) {
            // context.log(`⏭️ Skipper ${dateStr} (helg)`);
            return;
          }

          if (
            meeting_type === 'atclient' &&
            Array.isArray(settings.allowed_atclient_meeting_days) &&
            !settings.allowed_atclient_meeting_days.includes(weekdayName)
          ) {
            context.log(`⏭️ Skipper ${dateStr} – ej tillåten veckodag (${weekdayName}) för atclient. Tillåtna: ${JSON.stringify(settings.allowed_atclient_meeting_days)}`);
            return;
          } else if (
            meeting_type !== 'atclient' &&
            settings.allowed_atclient_meeting_days
          ) {
            debugLog(`🧪 Hoppar veckodagskontroll – meeting_type är ${meeting_type}, ej atClient`);
          }

          await Promise.all([10, 14].map(async (hour) => {
            context.log(`⏱️ Startar slot-generation för ${dateStr} kl ${hour}`);
            debugLog(`🕑 Bearbetar datum ${dateStr}, timmar: 10 och 14`);
            const slotTime = DateTime.fromISO(`${dateStr}T${hour.toString().padStart(2, '0')}:00`, { zone: timezone }).toUTC().toJSDate();

            const openTime = DateTime.fromISO(`${dateStr}T${settings.open_time}`, { zone: timezone }).toUTC().toJSDate();
            const closeTime = DateTime.fromISO(`${dateStr}T${settings.close_time}`, { zone: timezone }).toUTC().toJSDate();
            const lunchStart = DateTime.fromISO(`${dateStr}T${settings.lunch_start || '11:45'}`, { zone: timezone }).toUTC().toJSDate();
            const lunchEnd = DateTime.fromISO(`${dateStr}T${settings.lunch_end || '13:15'}`, { zone: timezone }).toUTC().toJSDate();
            const slotEndTime = new Date(slotTime.getTime() + meeting_length * 60000);

            // Avvisa möten utanför öppettider
            if (slotTime < openTime || slotEndTime > closeTime) {
              debugLog(`⏰ Slot ${slotTime.toISOString()} ligger utanför öppettider (${settings.open_time}–${settings.close_time}) – skippar`);
              return;
            }

            debugLog(`🕵️ Kontroll: slot ${slotTime.toISOString()} till ${slotEndTime.toISOString()} vs lunch ${lunchStart.toISOString()}–${lunchEnd.toISOString()}`);
            if (meeting_type !== 'atclient' && slotTime < lunchEnd && slotEndTime > lunchStart) {
              debugLog(`🍽️ Slot ${slotTime.toISOString()} överlappar lunch – skippar`);
              return;
            }

            // Ersatt daglig DB-fråga: om ingen bokning för dagen, sätt till tom array
            if (!bookingsByDay[dateStr]) bookingsByDay[dateStr] = [];

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

            // Kontrollera konflikt med befintlig kalenderhändelse (privat/jobb)
            const travelStart = new Date(slotTime.getTime() - travelTimeMin * 60000);
            // Anropa nya cache-drivna resolveOriginAddress
            const { origin: latestEvent, originEndTime = null } = await resolveOriginAddress({
              eventId: slotTime.toISOString(),  // Using time as a surrogate event ID
              calendarId: contact_id,           // Using contact_id as calendar surrogate
              pool,
              context,
              fallbackOrigin: settings.default_home_address
            });
            const originLog = latestEvent ? `📌 Möjlig startadress: ${latestEvent}` : '❌ Kunde inte hämta startadress';
            context.log(originLog);

            if (isTooClose) {
              debugLog(`⛔ Slot ${slotTime.toISOString()} krockar eller ligger för nära annan bokning – skippar`);
              return;
            }

            // --- Hämta bokade minuter för veckan och mötestyp från minnesstruktur ---
            const weekKeyStr = weekKey(slotTime);
            const bookedMinutes = (weeklyMinutesByType[meeting_type] || {})[weekKeyStr] || 0;
            const maxMinutes = settings.max_weekly_booking_minutes || 99999;

            if (bookedMinutes + meeting_length > maxMinutes) {
              debugLog(`📛 Slot ${slotTime.toISOString()} avvisad – veckokvot överskrids (${bookedMinutes} + ${meeting_length} > ${maxMinutes})`);
              return;
            }

            // const travelStart = new Date(slotTime.getTime() - travelTimeMin * 60000);
            const travelEnd = new Date(slotTime.getTime() + meeting_length * 60000 + returnTravelTimeMin * 60000);

            let requireApprovalForThisSlot = false;
            const travelStartHour = travelStart.getUTCHours();
            const travelEndHour = travelEnd.getUTCHours();
            if (travelStartHour < windowStartHour || travelEndHour >= windowEndHour) {
              debugLog(`⚠️ Slot ${slotTime.toISOString()} kräver godkännande – utanför restidsfönster`);
              requireApprovalForThisSlot = true;
            }

            // --- Försök alltid beräkna restid enligt kontors-/resefönsterlogik ---
            let origin = latestEvent;
            try {
              // Förbättrad loggning och konfliktkontroll
              if (!origin) {
                if (isDebug) {
                  context.log(`❌ Slot ${slotTime.toISOString()} saknar startadress (ingen plats i kalendern) – använder fallback`);
                }
                travelTimeMin = settings.fallback_travel_time_minutes || 0;
              } else if (originEndTime && new Date(originEndTime) > travelStart) {
                context.log(`📛 Slot ${slotTime.toISOString()} avvisad – kalenderkrock (slut ${originEndTime}, travelStart ${travelStart.toISOString()})`);
                return;
              }

              // Kontroll om restiden startar utanför tillåtet fönster
              // travelStart redan deklarerad ovan
              const startHour = travelStart.getUTCHours();
              if (startHour < windowStartHour || startHour > windowEndHour) {
                requireApprovalForThisSlot = true;
              }
            } catch (err) {
              context.log(`⚠️ Fel vid resolveOriginAddress: ${err.message} – använder fallback_travel_time_minutes`);
              context.log(`⚠️ Slot ${slotTime.toISOString()} använder fallback restid – resvägsadress saknas eller kunde inte tolkas`);
              travelTimeMin = settings.fallback_travel_time_minutes || 0;
            }
            let destination = settings.default_office_address;

            // Om atClient – destination är kundens adress
            if (meeting_type === 'atclient') {
              destination = `${contact.metadata.address} ${contact.metadata.postal_code} ${contact.metadata.city}`;
            }

            const hourKey = slotTime.getUTCHours();
            const cacheKey = `${origin}|${destination}|${hourKey}`;

            let cacheHit = false;
            context.log(`⏱️ Startar restidsanrop/kontroll för slot ${slotTime.toISOString()}, origin: ${origin}, destination: ${destination}, hour: ${hourKey}`);
            try {
              if (travelCache.has(cacheKey)) {
                travelTimeMin = travelCache.get(cacheKey);
                cacheHit = true;
                context.log(`⚡ Cache hit (minne): ${origin} → ${destination} @ ${hourKey}:00 = ${travelTimeMin} min`);
              } else {
                const cacheRes = await db.query(
                  `SELECT travel_minutes FROM travel_time_cache
                   WHERE from_address = $1 AND to_address = $2 AND hour = $3
                   LIMIT 1`,
                  [origin, destination, hourKey]
                );
                if (cacheRes.rows.length > 0) {
                  travelTimeMin = cacheRes.rows[0].travel_minutes;
                  cacheHit = true;
                  travelCache.set(cacheKey, travelTimeMin);
                  context.log(`⚡ Cache hit (db): ${origin} → ${destination} @ ${hourKey}:00 = ${travelTimeMin} min`);
                } else {
                  context.log(`⏳ Cache miss: ${origin} → ${destination} @ ${hourKey}:00`);
                }
              }
            } catch (err) {
              context.log(`⚠️ Kunde inte läsa från restidscache: ${err.message}`);
            }

            if (!cacheHit) {
              if (!accessToken) {
                context.log(`⚠️ Apple Maps-token saknas – använder fallback restid ${travelTimeMin} min`);
                context.log(`⚠️ Slot ${slotTime.toISOString()} använder fallback restid – resvägsadress saknas eller kunde inte tolkas`);
                travelTimeMin = settings.fallback_travel_time_minutes || 0;
                context.log(`⏱️ Fallback-aktivering för slot ${slotTime.toISOString()} pga saknad Apple Maps-token`);
              } else {
                try {
                  const url = new URL('https://maps-api.apple.com/v1/directions');
                  url.searchParams.append('origin', origin);
                  url.searchParams.append('destination', destination);
                  url.searchParams.append('transportType', 'automobile');
                  url.searchParams.append('departureTime', slotTime.toISOString());

                  const controller = new AbortController();
                  const timeout = setTimeout(() => controller.abort(), 8000); // max 8s
                  const res = await fetch(url.toString(), {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    signal: controller.signal
                  });
                  clearTimeout(timeout);
                  const data = await res.json();
                  const travelSeconds = data.routes?.[0]?.durationSeconds;
                  if (!travelSeconds) {
                    context.log(`⚠️ Apple Maps kunde inte hitta restid – använder fallback`);
                    context.log(`⚠️ Slot ${slotTime.toISOString()} använder fallback restid – resvägsadress saknas eller kunde inte tolkas`);
                    travelTimeMin = settings.fallback_travel_time_minutes || 0;
                    context.log(`⏱️ Fallback-aktivering för slot ${slotTime.toISOString()} pga Apple Maps misslyckades`);
                  } else {
                    travelTimeMin = Math.round(travelSeconds / 60);
                  }

                  // Cache spara
                  travelCache.set(cacheKey, travelTimeMin);
                  if (!origin || !destination) {
                    context.log(`⚠️ Hoppar caching – saknar from_address (${origin}) eller to_address (${destination})`);
                    return;
                  }
                  await db.query(`
                    INSERT INTO travel_time_cache (from_address, to_address, hour, travel_minutes)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (from_address, to_address, hour)
                    DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes
                  `, [origin, destination, hourKey, travelTimeMin]);
                } catch (err) {
                  context.log(`⚠️ Fel vid Apple Maps-anrop: ${err.message}`);
                  context.log(`⚠️ Slot ${slotTime.toISOString()} använder fallback restid – resvägsadress saknas eller kunde inte tolkas`);
                  travelTimeMin = settings.fallback_travel_time_minutes || 0;
                  context.log(`⏱️ Fallback-aktivering för slot ${slotTime.toISOString()} pga Apple Maps-anrop fel`);
                }
              }
            }

            // Kontrollera om restiden möjliggör ankomst i tid
            const travelBufferMs = travelTimeMin * 60000;
            if (slotStart - Date.now() < travelBufferMs) {
              debugLog(`⛔ Slot ${slotTime.toISOString()} avvisad – restid (${travelTimeMin} min) möjliggör inte ankomst i tid`);
              return;
            }

            const existing = bookingsByDay[dateStr];
            let minDist = 999999;
            if (existing.length > 0) {
              minDist = Math.min(...existing.map(e => Math.abs(slotTime.getTime() - e.end)));
            }

            const key = `${dateStr}_${hour < 12 ? 'fm' : 'em'}`;
            if (!slotMap[key]) slotMap[key] = [];
            debugLog(`✅ Slot tillagd: ${key}`);

            // Hantera särskild logik för atClient, t.ex. returresvägskrav
            if (meeting_type === 'atclient') {
              const previous = bookingsByDay[dateStr]
                .filter(b => b.end < slotStart)
                .sort((a, b) => b.end - a.end)[0];

              if (previous) {
                const prevEnd = new Date(previous.end);
                const from = previous.address || settings.default_office_address;
                const to = contact.metadata.address + ' ' + contact.metadata.postal_code + ' ' + contact.metadata.city;

                if (accessToken) {
                  try {
                    // Rensa bort och undvik att spara returrestid om from och to är identiska
                    if (from === to) {
                      context.log(`💾 Returrestid är 0 min (${from} → ${to}) – ingen cache behövs`);
                    } else {
                      const url = new URL('https://maps-api.apple.com/v1/directions');
                      url.searchParams.append('origin', from);
                      url.searchParams.append('destination', to);
                      url.searchParams.append('transportType', 'automobile');
                      url.searchParams.append('departureTime', prevEnd.toISOString());

                      const res = await fetch(url.toString(), {
                        headers: { Authorization: `Bearer ${accessToken}` }
                      });
                      const data = await res.json();
                      const returnMinutes = Math.round((data.routes?.[0]?.durationSeconds || 0) / 60);
                      const arrivalTime = new Date(prevEnd.getTime() + returnMinutes * 60000);

                      // --- Cacha returrestid ---
                      try {
                        const hour = prevEnd.getUTCHours();
                        // Lägg till till minnescache även för retur
                        const returnCacheKey = `${from}|${to}|${hour}`;
                        travelCache.set(returnCacheKey, returnMinutes);
                        if (!from || !to) {
                          context.log(`⚠️ Hoppar caching av retur – saknar from_address (${from}) eller to_address (${to})`);
                          return;
                        }
                        await db.query(`
                          INSERT INTO travel_time_cache (from_address, to_address, hour, travel_minutes)
                          VALUES ($1, $2, $3, $4)
                          ON CONFLICT (from_address, to_address, hour)
                          DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes
                        `, [from, to, hour, returnMinutes]);
                        context.log(`💾 Returrestid sparad: ${returnMinutes} min (${from} → ${to} @ ${hour}:00)`);
                      } catch (err) {
                        context.log(`⚠️ Kunde inte spara returrestid till cache: ${err.message}`);
                      }
                      // --- Slut cache returrestid ---

                      if (arrivalTime > slotTime) {
                        debugLog(`⛔ Slot ${slotTime.toISOString()} avvisad – retur från tidigare möte hinner inte fram i tid (ankomst ${arrivalTime.toISOString()})`);
                        return;
                      }
                    }
                  } catch (err) {
                    context.log(`⚠️ Kunde inte verifiera returrestid från tidigare möte: ${err.message}`);
                  }
                }
              }
            }
            // Resten av slot-genereringskoden gäller alla mötestyper
            slotMap[key].push({
              slot_iso: slotTime.toISOString(),
              slot_local: DateTime.fromJSDate(slotTime, { zone: 'utc' }).setZone(timezone).toISO(),
              score: minDist,
              require_approval: requireApprovalForThisSlot,
              travel_time_min: travelTimeMin,
              origin: origin || null,
              originEndTime: originEndTime || null,
              meeting_length: meeting_length,
              weekday: weekdayName,
              slot_part: hour < 12 ? 'fm' : 'em',
              max_days_in_advance: settings.max_days_in_advance,
              buffer_between_meetings: settings.buffer_between_meetings,
              max_weekly_booking_minutes: settings.max_weekly_booking_minutes,
              block_weekends: settings.block_weekends
            });
            if (origin) {
              context.log(`✅ Slot ${slotTime.toISOString()} tillagd med origin: ${origin}`);
            }
            slotCount++;
          }));
        })
      );
      const chunkDuration = Date.now() - chunkT0;
      context.log(`⏱️ Slot-chunk ${i / chunkSize + 1} tog ${chunkDuration} ms`);
    }
    const t4 = Date.now();
    debugLog(`🧮 Slot-loop tog totalt: ${t4 - t3} ms`);
    debugLog('⏱️ Efter slot-loop: ' + (Date.now() - t0) + ' ms');
    // Summerad loggning för avvisade slots p.g.a. kalenderkrock och okänt ursprung
    const allSlots = Object.values(slotMap).flat();
    // Avvisade p.g.a. kalenderkrock (privat/jobb)
    let calendarConflicts = 0;
    for (const s of allSlots) {
      // För varje slot, kolla om originEndTime är satt och slutar efter travelStart
      // travelStart = slotTime - travelTimeMin*60000 (kan ej återskapas exakt här, men vi kan använda originEndTime > slot_iso som approximation)
      if (s.origin && s.originEndTime && new Date(s.originEndTime) > new Date(s.slot_iso)) {
        calendarConflicts++;
      }
    }
    context.log(`📉 Avvisade slots p.g.a. kalenderkrock (för sent slut på föregående möte): ${calendarConflicts}`);
    // Avvisade p.g.a. okänt ursprung (ingen kalenderadress)
    const unknownOrigin = allSlots.filter(s => !s.origin).length;
    context.log(`📉 Avvisade slots p.g.a. saknad startadress (kalender tom): ${unknownOrigin}`);

    if (isDebug) {
      const totalSlots = Object.values(slotMap).flat().length;
      const cacheHits = Object.values(slotMap).flat().filter(s => s.travel_time_min && s.travel_time_min !== settings.fallback_travel_time_minutes).length;
      const requireApprovalCount = Object.values(slotMap).flat().filter(s => s.require_approval).length;

      context.log(`📊 Totalt genererade slots: ${totalSlots}`);
      context.log(`⚡ Slots med cacheträff: ${cacheHits}`);
      context.log(`🛑 Slots som kräver godkännande: ${requireApprovalCount}`);
    }

    // --- Summerad loggning av varför slots har avvisats (om isDebug) ---
    if (isDebug) {
      const skipReasons = {};
      // slotCount already declared above
      const originalDebugLog = debugLog;
      debugLog = (msg) => {
        if (msg.startsWith('⛔') || msg.startsWith('🍽️') || msg.startsWith('📛')) {
          const reason = msg.split(' – ')[0];
          skipReasons[reason] = (skipReasons[reason] || 0) + 1;
        }
        originalDebugLog(msg);
      };

      process.on('beforeExit', () => {
        for (const [reason, count] of Object.entries(skipReasons)) {
          context.log(`📉 ${reason}: ${count} st`);
        }
        context.log(`📈 Totalt tillagda slots: ${slotCount}`);
      });
    }

    for (const [key, candidates] of Object.entries(slotMap)) {
      if (candidates.length === 0) continue;
      const best = candidates.sort((a, b) => b.score - a.score)[0];
      // context.log(`🏆 Bästa slot för ${key}: ${best.slot_iso} (score ${best.score})`);
      chosen.push(best);
    }
    // Sort chosen by slot_iso (chronologically)
    chosen.sort((a, b) => new Date(a.slot_iso) - new Date(b.slot_iso));
    debugLog(`📦 Slots genererade: ${chosen.length}`);

    const elapsedMs = Date.now() - t0;
    context.log(`⏱️ Total exekveringstid: ${elapsedMs} ms`);

    debugLog(`✅ getavailableslots klar med ${chosen.length} slots`);
    // --- Summerad loggning av varför slots har avvisats (om isDebug) ---
    if (isDebug && typeof skipReasons !== 'undefined') {
      for (const [reason, count] of Object.entries(skipReasons)) {
        context.log(`📉 ${reason}: ${count} st`);
      }
      context.log(`📈 Totalt tillagda slots: ${slotCount}`);
    }
    if (chosen.length < 2) {
      context.log(`⚠️ Endast ${chosen.length} slot(s) genererade – kontrollera regler eller data`);
    }
    if (!chosen.length) {
      context.log(`⚠️ Inga tillgängliga slots kunde genereras – returnerar tom lista`);
      context.res = {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: { slots: [] }
      };
      return;
    }
    context.res = {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: {
        slots: chosen
      }
    };
    const totalDurationMs = Date.now() - startTimeMs;
    context.log(`⏱️ getavailableslots färdig – total tid: ${totalDurationMs} ms`);
    return;
  } catch (error) {
    debugLog(`💥 Fel uppstod: ${error.message}`);
    context.log('🔥 FEL:', error.message, '\nSTACK:', error.stack);
    context.res = {
      status: 500,
      body: { error: error.message, stack: error.stack }
    };
  }
};

async function getAppleMapsAccessToken(context) {
  try {
    const jwt = require('jsonwebtoken');
    const fs = require('fs');
    const fetch = require('node-fetch');

    const teamId = process.env.APPLE_MAPS_TEAM_ID;
    const keyId = process.env.APPLE_MAPS_KEY_ID;
    const privateKey = process.env.APPLE_MAPS_PRIVATE_KEY?.replace(/\\n/g, '\n') ||
                       fs.readFileSync(process.env.APPLE_MAPS_KEY_PATH, 'utf8');

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

    const res = await fetch('https://maps-api.apple.com/v1/token', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();
    return data.accessToken;
  } catch (err) {
    context.log('⚠️ Misslyckades hämta Apple Maps token:', err.message);
    if (err.code === 'EAI_AGAIN') {
      context.log('🌐 DNS-fel (EAI_AGAIN) – kunde inte nå servern:', err.message);
    }
    return null;
  }
}
