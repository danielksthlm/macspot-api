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
  }
}

module.exports = async function (context, req) {
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
    const { Pool } = require('pg');
    const fetch = require('node-fetch');
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

    const pool = new Pool({
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: { rejectUnauthorized: false }
    });
    debugLog('✅ PostgreSQL pool created');
    debugLog('⏱️ Efter env och pool: ' + (Date.now() - t0) + ' ms');

    const { email, meeting_type, meeting_length } = req.body || {};

    const db = await pool.connect();

    const contactRes = await db.query('SELECT * FROM contact WHERE booking_email = $1', [email]);
    const contact = contactRes.rows[0];
    debugLog(`👤 Kontakt hittad: ${contact?.id || 'ej funnen'}`);
    const t1 = Date.now();
    debugLog('⏱️ Efter kontakt: ' + (Date.now() - t0) + ' ms');

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
    debugLog(`⚙️ Inställningar laddade: ${Object.keys(settings).join(', ')}`);
    verifyBookingSettings(settings, context);
    debugLog('⚙️ Inställningar klara');
    const t2 = Date.now();
    debugLog('⏱️ Efter settings: ' + (Date.now() - t0) + ' ms');

    const bookingsByDay = {};
    const slotGroupPicked = {};
    const chosen = [];

    const maxDays = settings.max_days_in_advance || 14;
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + maxDays);
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0); // sista dagen i månaden
    const totalDays = Math.ceil((endMonth - today) / (1000 * 60 * 60 * 24)) + 1;
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
    const allBookings = allBookingsRes.rows.map(b => ({
      start: new Date(b.start_time).getTime(),
      end: new Date(b.end_time).getTime(),
      date: new Date(b.start_time).toISOString().split('T')[0],
      meeting_type: b.meeting_type
    }));
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

    if (!email || !meeting_type || !meeting_length) {
      context.res = {
        status: 400,
        body: { error: 'Missing one or more required fields: email, meeting_type, meeting_length' }
      };
      return;
    }

    let travelTimeMin = settings.fallback_travel_time_minutes || 0;
    const returnTravelTimeMin = travelTimeMin;

    const windowStartHour = parseInt((settings.travel_time_window_start || '06:00').split(':')[0], 10);
    const windowEndHour = parseInt((settings.travel_time_window_end || '23:00').split(':')[0], 10);

    // Hämta Apple Maps-token en gång tidigt
    const accessToken = await getAppleMapsAccessToken(context);
    const t3 = Date.now();
    debugLog('⏱️ Efter Apple Maps token: ' + (Date.now() - t0) + ' ms');

    // Parallellisera dag-loop i chunkar om 28
    const chunkSize = 28;
    debugLog('🔁 Startar slot-loop i chunkar');
    let slotCount = 0;
    for (let i = 0; i < days.length; i += chunkSize) {
      const chunk = days.slice(i, i + chunkSize);
      const results = await Promise.allSettled(
        chunk.map(async (day) => {
          const dateStr = day.toISOString().split('T')[0];
          const weekdayName = day.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

          if (settings.block_weekends && (day.getDay() === 0 || day.getDay() === 6)) {
            // context.log(`⏭️ Skipper ${dateStr} (helg)`);
            return;
          }

          if (
            meeting_type === 'atClient' &&
            Array.isArray(settings.allowed_atClient_meeting_days) &&
            !settings.allowed_atClient_meeting_days.includes(weekdayName)
          ) {
            // context.log(`⏭️ Skipper ${dateStr} – ej tillåten veckodag (${weekdayName}) för atClient`);
            return;
          }

          await Promise.all([10, 14].map(async (hour) => {
            debugLog(`🕑 Bearbetar datum ${dateStr}, timmar: 10 och 14`);
            const slotTime = new Date(`${dateStr}T${hour.toString().padStart(2, '0')}:00:00Z`);

            const lunchStart = new Date(`${dateStr}T${settings.lunch_start || '11:45'}:00Z`);
            const lunchEnd = new Date(`${dateStr}T${settings.lunch_end || '13:15'}:00Z`);
            const slotEndTime = new Date(slotTime.getTime() + meeting_length * 60000);

            if (slotTime < lunchEnd && slotEndTime > lunchStart) {
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

            const travelStart = new Date(slotTime.getTime() - travelTimeMin * 60000);
            const travelEnd = new Date(slotTime.getTime() + meeting_length * 60000 + returnTravelTimeMin * 60000);

            let requireApprovalForThisSlot = false;
            if (travelStart.getHours() < windowStartHour || travelEnd.getHours() > windowEndHour) {
              debugLog(`⚠️ Slot ${slotTime.toISOString()} kräver godkännande – utanför restidsfönster`);
              requireApprovalForThisSlot = true;
            }

            // --- CACHE: Kontrollera om restiden redan finns i minnescache/databasen ---
            let cacheHit = false;
            const origin = meeting_type === 'atClient'
              ? settings.default_office_address
              : contact.metadata.address + ' ' + contact.metadata.postal_code + ' ' + contact.metadata.city;
            const destination = meeting_type === 'atClient'
              ? contact.metadata.address + ' ' + contact.metadata.postal_code + ' ' + contact.metadata.city
              : settings.default_office_address;
            const hourKey = slotTime.getUTCHours();
            const cacheKey = `${origin}|${destination}|${hourKey}`;
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
            // --- SLUT CACHE ---
            if (!cacheHit) {
              if (!accessToken) {
                context.log(`⚠️ Apple Maps-token saknas – använder fallback restid ${travelTimeMin} min`);
              } else {
                const url = new URL('https://maps-api.apple.com/v1/directions');
                url.searchParams.append('origin', origin);
                url.searchParams.append('destination', destination);
                url.searchParams.append('transportType', 'automobile');
                url.searchParams.append('departureTime', slotTime.toISOString());
                try {
                  const res = await fetch(url.toString(), {
                    headers: { Authorization: `Bearer ${accessToken}` }
                  });
                  const data = await res.json();
                  const travelSeconds = data.routes?.[0]?.durationSeconds;
                  if (!travelSeconds) {
                    context.log(`⚠️ Apple Maps kunde inte hitta restid – använder fallback`);
                  } else {
                    travelTimeMin = Math.round(travelSeconds / 60);
                    // context.log(`🗺️ Restid Apple Maps: ${travelTimeMin} min (${origin} → ${destination})`);
                  }
                } catch (err) {
                  context.log(`⚠️ Fel vid Apple Maps-anrop: ${err.message}`);
                }
              }
            }
            // --- CACHE: Spara restid om vi just hämtade från Apple Maps ---
            if (!cacheHit && travelTimeMin < Number.MAX_SAFE_INTEGER) {
              try {
                const hour = slotTime.getUTCHours();
                // Lägg till till minnescache
                travelCache.set(cacheKey, travelTimeMin);
                await db.query(`
                  INSERT INTO travel_time_cache (from_address, to_address, hour, travel_minutes, created_at, updated_at)
                  VALUES ($1, $2, $3, $4, NOW(), NOW())
                  ON CONFLICT (from_address, to_address, hour)
                  DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes, updated_at = NOW()
                `, [origin, destination, hour, travelTimeMin]);
                // context.log(`💾 Restid sparad i cache: ${travelTimeMin} min (${origin} → ${destination} @ ${hour}:00)`);
              } catch (err) {
                context.log(`⚠️ Kunde inte spara restid till cache: ${err.message}`);
              }
            }
            // --- SLUT CACHE ---

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

            // Kontrollera om retur från tidigare möte till denna slot fungerar
            const previous = bookingsByDay[dateStr]
              .filter(b => b.end < slotStart)
              .sort((a, b) => b.end - a.end)[0];

            if (previous) {
              const prevEnd = new Date(previous.end);
              const from = previous.address || settings.default_office_address;
              const to = meeting_type === 'atClient'
                ? contact.metadata.address + ' ' + contact.metadata.postal_code + ' ' + contact.metadata.city
                : settings.default_office_address;

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
                      await db.query(`
                        INSERT INTO travel_time_cache (from_address, to_address, hour, travel_minutes, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, NOW(), NOW())
                        ON CONFLICT (from_address, to_address, hour)
                        DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes, updated_at = NOW()
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

            slotMap[key].push({
              slot_iso: slotTime.toISOString(),
              score: minDist,
              require_approval: requireApprovalForThisSlot,
              travel_time_min: travelTimeMin
            });
            slotCount++;
          }));
        })
      );
    }
    const t4 = Date.now();
    debugLog(`🧮 Slot-loop tog totalt: ${t4 - t3} ms`);
    debugLog('⏱️ Efter slot-loop: ' + (Date.now() - t0) + ' ms');

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
    debugLog(`📦 Slots genererade: ${chosen.length}`);

    const elapsedMs = Date.now() - t0;
    context.log(`⏱️ Total exekveringstid: ${elapsedMs} ms`);

    debugLog(`✅ getavailableslots klar med ${chosen.length} slots`);
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
    debugLog(`💥 Fel uppstod: ${error.message}`);
    context.log('🔥 FEL:', error.message, '\nSTACK:', error.stack);
    context.res = {
      status: 500,
      body: { error: error.message, stack: error.stack }
    };
  }
};

// Återanvändbar funktion för att hämta Apple Maps access token
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
    return null;
  }
}
