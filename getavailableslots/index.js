console.log('🚀 Funktion initierad');
const DEBUG = (process.env.DEBUG_MODE || '').toLowerCase() === 'true';
console.log('📛 DEBUG_MODE:', process.env.DEBUG_MODE);
// Kontrollfunktion för booking_settings - förbättrad version 6
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
      // Tillåt require_approval att vara boolean (eller hantera legacy array)
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
  } else {
    context.log('✅ Alla booking_settings har rätt typ och finns definierade.');
  }
}
// Slot pattern frequency tracker - test 2
const slotPatternFrequency = {}; // key = hour + meeting_length → count
const travelTimeCache = {}; // key = fromAddress->toAddress
const slotGroupPicked = {}; // flyttad hit så den behåller status över alla timmar och dagar
const jwt = require('jsonwebtoken');
const fs = require('fs');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

module.exports = async function(context, req) {

    context.log('📥 Funktion getavailableslots anropad');
    console.log('📛 DEBUG_MODE:', process.env.DEBUG_MODE);
    if (!process.env.DEBUG_MODE) {
      context.log('⚠️ DEBUG_MODE är inte satt – standard är false');
    }
    const startTimeMs = Date.now();

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

  // 🔁 Rensa gamla cacheade slots
  async function pruneExpiredSlotCache() {
    try {
      // Använd pool direkt för enkelhet här
      await pool.query('DELETE FROM available_slots_cache WHERE expires_at < NOW()');
      context.log('🧹 Rensade utgångna slots från available_slots_cache');
    } catch (err) {
      context.log.warn('⚠️ Kunde inte rensa cache:', err.message);
    }
  }
  await pruneExpiredSlotCache();

  let db;
  let lengths;
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
    // const slots = [];
    // const lengths = ... (old declaration removed, see above)
    const slotMap = {}; // dag_fm/em → [{ iso, score }]

    const graphCache = {}; // key = dayStr_fm/em, value = Graph schedule data
    const appleCache = {}; // key = slot ISO, value = travel time (minutes)

    // --- Ladda kontakt, metadata, settings, fullAddress --- (en gång innan slot-loopen)
    if (!db) db = await pool.connect();
    // Hämta kontakt
    const contactRes = await db.query('SELECT * FROM contact WHERE booking_email = $1', [booking_email]);
    contact = contactRes.rows[0];
    metadata = contact?.metadata || {};
    fullAddress = `${metadata.address || ''} ${metadata.postal_code || ''} ${metadata.city || ''}`.trim();
    context.log('📍 Fullständig kundadress:', fullAddress);
    context.log('👤 Kontakt hittad:', contact);
    context.log('📍 Metadata-adress:', metadata?.address);
    // Hämta alla inställningar
    settingsRes = await db.query('SELECT key, value, value_type FROM booking_settings');
    settings = {};
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
    context.log('⚙️ Inställningar laddade:', Object.keys(settings));
    context.log(`🕓 Öppettider enligt inställningar: ${settings.open_time}–${settings.close_time}`);
    // Verifiera booking_settings direkt efter laddning
    verifyBookingSettings(settings, context);
    // Kontrollera att mötestypen är giltig
    if (!settings.meeting_types.includes(meeting_type)) {
      context.res = {
        status: 400,
        body: { error: `Ogiltig mötestyp: ${meeting_type}` }
      };
      return;
    }
    // Ta bort onödiga settings
    delete settings.available_meeting_room;
    delete settings.room_priority;
    const requiredKeys = [
      'default_office_address',
      'default_home_address',
      'fallback_travel_time_minutes',
      'buffer_between_meetings',
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
      context.log('🧪 Råvärde settings.default_meeting_length_atClient:', settings.default_meeting_length_atClient);
      lengths = settings.default_meeting_length_atClient.map(Number);
    } else {
      lengths = [requestedLength];
    }
    lengths = lengths.filter(l => l === requestedLength);
    context.log('📏 lengths innan kontroll:', lengths);

    // --- Cacha bokningar per dag ---
    const bookingsByDay = {};

    // Justera logik för att inkludera hela månaden även om max_days_in_advance bara täcker delar av den
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + maxDays);
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0); // sista dagen i den månaden
    const daysToGenerate = Math.ceil((endMonth - now) / (1000 * 60 * 60 * 24));

    // Flytta Apple Maps-tokenhämtning till början av hour-loopen
    let accessToken;
    // Parallell chunkning på dag-nivå
    const allDayOffsets = Array.from({ length: daysToGenerate }, (_, i) => i + 1);
    const chunkSize = 7;
    // Hämta Apple Maps-token en gång per batch (kan återanvändas)
    let accessToken;
    for (let chunkStart = 0; chunkStart < allDayOffsets.length; chunkStart += chunkSize) {
      const chunk = allDayOffsets.slice(chunkStart, chunkStart + chunkSize);
      // Parallellisera dag-bearbetning inom chunk
      await Promise.all(chunk.map(async (dayOffset) => {
        const dayStart = Date.now();
        const day = new Date(now);
        day.setDate(day.getDate() + dayOffset);
        const dayStr = day.toISOString().split('T')[0];
        const weekdayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][day.getDay()];
        // Tidig avbrytning om båda fm/em redan finns i cache
        if (slotGroupPicked[`${dayStr}_fm`] && slotGroupPicked[`${dayStr}_em`]) {
          context.log(`⏩ Skippar dag ${dayStr} – både fm och em redan i cache/valda`);
          return;
        }
        // Kontrollera veckodagstillåtelse för atClient innan timloopen
        if (
          meeting_type === 'atClient' &&
          Array.isArray(settings.allowed_atClient_meeting_days) &&
          !settings.allowed_atClient_meeting_days.map(d => d.toLowerCase()).includes(weekdayName.toLowerCase())
        ) {
          context.log(`⏩ Skipped ${dayStr} – ej tillåten veckodag (${weekdayName}) för atClient`);
          return;
        }
        context.log(`🕒 Startar bearbetning för dag ${dayStr}`);
        // Apple Maps-token hämtas först när den behövs (se restidskontroll)
        const openHour = parseInt((settings.open_time || '08:00').split(':')[0], 10);
        const closeHour = parseInt((settings.close_time || '16:00').split(':')[0], 10);
        let lastAllowedStartHour = closeHour;
        if (lengths) {
          lastAllowedStartHour = closeHour - Math.max(...lengths) / 60;
        }
        // Defensiv kontroll för längder innan timloop
        if (!Array.isArray(lengths) || lengths.length === 0 || lengths.some(l => isNaN(l))) {
          context.log.warn('⚠️ Ogiltiga möteslängder. Avbryter generation av timmar.');
          return;
        }
        // Precache mode: endast en slot per dagdel genereras, bryt timloopen direkt efter en godkänd slot
        const precacheMode = req.body?.precache_mode === true;
        // Håll koll på om vi redan valt slot för fm/em denna dag (för precache/brytning)
        let dayPartSlotFound = { fm: false, em: false };
        // Timme-loop (ej Promise.all, men brytbar)
        for (let hour = openHour; hour <= closeHour && hour <= 23; hour++) {
          const hourStart = Date.now();
          context.log(`⏳ Bearbetar timme ${hour}:00 för dag ${dayStr}`);
          const slotDay = dayStr;
          const slotPart = hour < 12 ? 'fm' : 'em';
          // Tidig avbrytning om redan vald i slotGroupPicked
          if (slotGroupPicked[`${dayStr}_${slotPart}`]) {
            context.log(`⏩ Skippar ${dayStr}_${slotPart} – slot redan vald`);
            if (precacheMode) dayPartSlotFound[slotPart] = true;
            continue;
          }
          // Kontrollera cache för denna slot direkt
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
            if (!slotMap[`${slotDay}_${slotPart}`]) slotMap[`${slotDay}_${slotPart}`] = [];
            slotMap[`${slotDay}_${slotPart}`].push({ iso, score: 99999 });
            const key = `${slotDay}_${slotPart}`;
            if (DEBUG) context.log(`🧷 (cached slot) Markering: slotGroupPicked[${key}] = true`);
            slotGroupPicked[key] = true;
            if (DEBUG) context.log('🧷 slotGroupPicked status just nu:', JSON.stringify(slotGroupPicked, null, 2));
            if (DEBUG) context.log(`📣 DEBUG: Slot för ${key} tillagd, nuvarande keys: ${Object.keys(slotGroupPicked)}`);
            if (DEBUG) context.log(`🧷 (efter cached set) slotGroupPicked[${key}] =`, slotGroupPicked[key]);
            context.log(`📦 Återanvände cached slot: ${iso} för ${slotDay} ${slotPart}`);
            if (precacheMode) dayPartSlotFound[slotPart] = true;
            continue;
          }
          // För varje möteslängd (oftast bara en)
          let slotAccepted = false;
          for (const len of lengths) {
            const start = new Date(`${dayStr}T${String(hour).padStart(2, '0')}:00:00`);
            const end = new Date(start.getTime() + len * 60000);
            const key = `${dayStr}_${hour < 12 ? 'fm' : 'em'}`;
            const slotDay = dayStr;
            const slotPart = hour < 12 ? 'fm' : 'em';
            // Kontroll innan slotprövning
            context.log(`⏳ Kontroll innan slotprövning – slotGroupPicked[${key}] = ${slotGroupPicked[key]}`);
            if (slotGroupPicked[key]) {
              context.log(`⏩ Skippar ${key} – redan vald slot`);
              context.log(`⚠️ Avvisad slot ${start.toISOString()} → ${end.toISOString()} av orsak ovan.`);
              continue;
            }
            // 🚫 Kolla helg
            if (settings.block_weekends) {
              const wd = start.getDay();
              if (wd === 0 || wd === 6) {
                context.log(`❌ Avvisad pga helg (${wd})`);
                context.log(`⚠️ Avvisad slot ${start.toISOString()} → ${end.toISOString()} av orsak ovan.`);
                continue;
              }
            }
            const wd = start.getDay();
            const weekdayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][wd];
            if (meeting_type === 'atClient' && Array.isArray(settings.allowed_atClient_meeting_days) && !settings.allowed_atClient_meeting_days.map(d => d.toLowerCase()).includes(weekdayName.toLowerCase())) {
              context.log(`❌ Avvisad pga otillåten veckodag för atClient: ${weekdayName}`);
              context.log(`⚠️ Avvisad slot ${start.toISOString()} → ${end.toISOString()} av orsak ovan.`);
              continue;
            }
            if (!bookingsByDay[dayStr]) {
              const existingRes = await db.query(
                `SELECT start_time, end_time, metadata FROM bookings WHERE start_time::date = $1`,
                [dayStr]
              );
              bookingsByDay[dayStr] = existingRes.rows.map(r => ({
                start: new Date(r.start_time).getTime(),
                end: new Date(r.end_time).getTime(),
                metadata: r.metadata
              }));
            }
            const existing = bookingsByDay[dayStr];
            // Kontrollera restid till nästa möte – men först efter slotvalet (optimering)
            // Kontrollera returresa från tidigare möte före denna slot
            const previous = existing
              .filter(e => e.end < start.getTime())
              .sort((a, b) => b.end - a.end)[0];
            if (previous?.metadata?.address) {
              if (!accessToken) accessToken = await getAppleMapsAccessToken(context);
              if (accessToken) {
                const returnTravelTime = await getTravelTime(
                  previous.metadata.address,
                  settings.default_office_address,
                  new Date(previous.end),
                  accessToken,
                  context,
                  db
                );
                const arrivalTime = new Date(previous.end + returnTravelTime * 60000);
                if (arrivalTime > start) {
                  context.log(`❌ Avvisad pga för lång retur från tidigare möte (${arrivalTime.toISOString()} > ${start.toISOString()})`);
                  context.log(`⚠️ Avvisad slot ${start.toISOString()} → ${end.toISOString()} av orsak ovan.`);
                  continue;
                }
              }
            }
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
            if (bookedMinutes + len > (settings.max_weekly_booking_minutes || 99999)) {
              context.log(`❌ Avvisad pga veckokvot överskrids (${bookedMinutes} + ${len} > ${settings.max_weekly_booking_minutes})`);
              context.log(`⚠️ Avvisad slot ${start.toISOString()} → ${end.toISOString()} av orsak ovan.`);
              continue;
            }
            // 🍽️ Uteslut slot som helt eller delvis överlappar lunch
            const lunchStart = settings.lunch_start || '11:45';
            const lunchEnd = settings.lunch_end || '13:15';
            const lunchStartDate = new Date(start.toISOString().split('T')[0] + 'T' + lunchStart + ':00');
            const lunchEndDate = new Date(start.toISOString().split('T')[0] + 'T' + lunchEnd + ':00');
            if (start < lunchEndDate && end > lunchStartDate) {
              context.log(`❌ Avvisad pga överlappar lunch (${start.toISOString()} - ${end.toISOString()})`);
              context.log(`⚠️ Avvisad slot ${start.toISOString()} → ${end.toISOString()} av orsak ovan.`);
              continue;
            }
            // ⛔ Krockar (förenklad mock – riktig logik kan ersättas senare)
            if (conflictRes.rowCount > 0) {
              context.log('❌ Avvisad pga kalenderkrock');
              context.log(`⚠️ Avvisad slot ${start.toISOString()} → ${end.toISOString()} av orsak ovan.`);
              continue;
            }
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
            if (!isIsolated) {
              context.log('❌ Avvisad pga ligger för nära annan bokning (buffer)');
              context.log(`⚠️ Avvisad slot ${start.toISOString()} → ${end.toISOString()} av orsak ovan.`);
              continue;
            }
            // key redan beräknad ovan
            if (DEBUG) context.log(`🕵️‍♀️ Slotgruppsnyckel: ${key}`);
            if (!slotMap[key]) slotMap[key] = [];
            const minDist = Math.min(...existing.map(e => Math.abs(slotStart - e.end)));
            if (DEBUG) context.log(`🆕 Förbereder att lägga till slot i slotMap[${key}]`);
            if (DEBUG) context.log(`🔍 slotMap-data: ISO=${start.toISOString()}, score=${isFinite(minDist) ? minDist : 99999}`);
            if (DEBUG) context.log(`📎 Före push – key: ${key}, iso: ${start.toISOString()}, score: ${isFinite(minDist) ? minDist : 99999}`);
            slotMap[key].push({
              iso: start.toISOString(),
              score: isFinite(minDist) ? minDist : 99999
            });
            if (DEBUG) context.log(`🧷 (ny slot) Markering: slotGroupPicked[${key}] = true`);
            slotGroupPicked[key] = true;
            if (DEBUG) context.log('🧷 slotGroupPicked status just nu:', JSON.stringify(slotGroupPicked, null, 2));
            if (DEBUG) context.log(`📣 DEBUG: Slot för ${key} tillagd, nuvarande keys: ${Object.keys(slotGroupPicked)}`);
            if (DEBUG) context.log(`🧷 (efter set) slotGroupPicked[${key}] =`, slotGroupPicked[key]);
            if (DEBUG) context.log(`📌 Slot tillagd i slotMap[${key}]: ${start.toISOString()} (${len} min)`);
            if (DEBUG) context.log(`📍 Efter push – slotMap[${key}].length: ${slotMap[key].length}`);
            if (DEBUG) context.log(`📌 Slot tillagd i slotMap[${key}]: ${start.toISOString()}`);
            if (DEBUG) context.log(`⭐️ Slot score (isolation): ${isFinite(minDist) ? minDist : 99999}`);
            // Precache mode: bryt timloop direkt efter första godkända slot per dagdel
            slotAccepted = true;
            if (precacheMode) {
              dayPartSlotFound[slotPart] = true;
              break;
            }
          }
          // ⏹️ Klar timme-logg
          context.log(`⏹️ Klar timme ${hour}:00 (${Date.now() - hourStart} ms)`);
          // ⛔ Avsluta dag-loopen om fm och em är valda för denna dag
          if (DEBUG) {
            context.log(`🧷 Debug-status innan kontroll:`);
            context.log(`  slotGroupPicked keys:`, Object.keys(slotGroupPicked));
            context.log(`  slotGroupPicked[${dayStr}_fm] =`, slotGroupPicked[`${dayStr}_fm`]);
            context.log(`  slotGroupPicked[${dayStr}_em] =`, slotGroupPicked[`${dayStr}_em`]);
            context.log(`🔁 Kontroll: fm = ${slotGroupPicked[`${dayStr}_fm`]}; em = ${slotGroupPicked[`${dayStr}_em`]}`);
          }
          if (
            (slotGroupPicked[`${dayStr}_fm`] && slotGroupPicked[`${dayStr}_em`]) ||
            (precacheMode && dayPartSlotFound.fm && dayPartSlotFound.em)
          ) {
            context.log(`✅ ${dayStr} har fm och em – avbryter dagens bearbetning`);
            break;
          }
        }
        context.log(`✅ Klar med dag ${dayStr} på ${Date.now() - dayStart} ms`);
      }));
    }
          }));
        }
        context.log(`✅ Klar med dag ${dayStr} på ${Date.now() - dayStart} ms`);
      }));
    }

    const chosen = [];
    if (DEBUG) context.log('🧮 Börjar välja bästa slot per grupp...');
    // Efter att alla slot-kandidater samlats per dagdel: välj bästa och gör restidskontroll först nu (optimering)
    for (const [key, candidates] of Object.entries(slotMap)) {
      if (DEBUG) context.log(`📊 Slotgrupp ${key} innehåller ${candidates.length} kandidater`);
      if (DEBUG) candidates.forEach(c => context.log(`  - Kandidat: ${c.iso}, score: ${c.score}`));
      if (DEBUG) context.log(`📅 Utvärderar slotgrupp ${key} med ${candidates.length} kandidater`);
      // Sortera högst score först (mest isolerad)
      const best = candidates.sort((a, b) => b.score - a.score)[0];
      if (!best) continue;
      // Gör restidskontroll och Apple Maps-tokenhämtning enbart för slutgiltigt vald slot
      const slotIso = best.iso;
      // Undvik om redan gjort
      if (appleCache[slotIso] === undefined) {
        if (!accessToken) accessToken = await getAppleMapsAccessToken(context);
        let travelTimeMin = 0;
        try {
          const fromAddress = meeting_type === 'atClient'
            ? settings.default_office_address
            : fullAddress || settings.default_home_address;
          const toAddress = meeting_type === 'atClient'
            ? fullAddress || settings.default_home_address
            : settings.default_office_address;
          const start = new Date(slotIso);
          travelTimeMin = await getTravelTime(fromAddress, toAddress, start, accessToken, context, db);
          appleCache[slotIso] = travelTimeMin;
        } catch (err) {
          context.log('⚠️ Restidskontroll misslyckades, använder fallback:', err.message);
          appleCache[slotIso] = 0;
        }
        const fallback = parseInt(settings.fallback_travel_time_minutes || '90', 10);
        if (travelTimeMin === Number.MAX_SAFE_INTEGER && fallback > 0) {
          context.log(`❌ Avvisad pga restid okänd och fallback överstigen`);
          continue;
        }
        // 🍽️ Undvik restid mitt i lunch
        const lunchStart = settings.lunch_start || '11:45';
        const lunchEnd = settings.lunch_end || '13:15';
        const lunchStartDate = new Date(slotIso.split('T')[0] + 'T' + lunchStart + ':00');
        const lunchEndDate = new Date(slotIso.split('T')[0] + 'T' + lunchEnd + ':00');
        const arrivalTime = new Date(new Date(slotIso).getTime() - travelTimeMin * 60000);
        if (arrivalTime >= lunchStartDate && arrivalTime < lunchEndDate) {
          context.log(`❌ Avvisad pga restid skär i lunch (${arrivalTime.toISOString()})`);
          continue;
        }
        // ⏰ Kontrollera travel_time_window_start/end
        const travelHour = arrivalTime.getHours();
        const windowStart = parseInt((settings.travel_time_window_start || '06:00').split(':')[0], 10);
        const windowEnd = parseInt((settings.travel_time_window_end || '23:00').split(':')[0], 10);
        const requiresApproval = settings.require_approval || [];
        if (travelHour < windowStart || travelHour > windowEnd) {
          if (!requiresApproval.includes(true)) {
            context.log(`❌ Avvisad pga restid utanför tillåtet fönster (${travelHour}:00)`);
            continue;
          }
        }
      }
      context.log(`✅ Valde slot ${best.iso} för grupp ${key}`);
      if (DEBUG) context.log(`📂 Slotgrupp (dag/fm-em): ${key}`);
      if (DEBUG) context.log(`🏆 Vald slot för ${key}: ${best.iso} (score: ${best.score})`);
      chosen.push(best.iso);
      slotGroupPicked[key] = true;
    }

    // Log frequency map of slot patterns
    // (slotPatternFrequency statistik borttaget)

    context.log('📊 Antal godkända slots (totalt):', chosen.length);
    // Object.entries(slotMap).forEach(([key, list]) => {
    //   context.log(`📅 ${key}: testade ${list.length} kandidater`);
    // });

    context.log('📤 Förbereder svar med valda slots:', chosen);
    // 📋 Logga slotGroupPicked-status före svar
    context.log('📋 Sammanfattning slotGroupPicked-status:');
    Object.entries(slotGroupPicked).forEach(([k, v]) => {
      context.log(`  ${k} = ${v}`);
    });
    const elapsedMs = Date.now() - startTimeMs;
    context.log(`⏱️ Total exekveringstid: ${elapsedMs} ms`);
    context.res = {
      status: 200,
      body: { slots: chosen }
    };
    context.log('🚀 Svar skickas till klient');

    // 🚀 Trigger bakgrunds-refresh om BACKGROUND_SLOT_REFRESH_URL är satt
    try {
      if (process.env.BACKGROUND_SLOT_REFRESH_URL) {
        const triggerUrl = process.env.BACKGROUND_SLOT_REFRESH_URL;
        await fetch(triggerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: booking_email, meeting_type })
        });
        context.log('🚀 Startade bakgrunds-refresh via BACKGROUND_SLOT_REFRESH_URL');
      }
    } catch (err) {
      context.log('⚠️ Kunde inte trigga bakgrunds-refresh:', err.message);
    }

    // pool.end() tas bort, db.release() sköter kopplingen
    return;
  } catch (err) {
    context.log('❌ Fel i getavailableslots:', err.message);
    context.res = {
      status: 500,
      body: { error: err.message }
    };
    return;
  } finally {
    if (db) db.release();
  }
}

// Extraherad funktion: Apple Maps access token
async function getAppleMapsAccessToken(context) {
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
    const tokenRes = await fetch('https://maps-api.apple.com/v1/token', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const tokenData = await tokenRes.json();
    return tokenData.accessToken;
  } catch (err) {
    if (context && context.log) context.log('⚠️ Misslyckades hämta Apple Maps token:', err.message);
    return null;
  }
}

// Extraherad funktion: Travel time
async function getTravelTime(fromAddress, toAddress, start, accessToken, context, db) {
  // Snabbspår för kända adresser – restid 0 min
  if (fromAddress === toAddress) {
    context?.log?.('📍 Samma adress – restid 0 min');
    return 0;
  }
  const t0 = Date.now();
  const travelKey = `${fromAddress}->${toAddress}`;
  const hourKey = `${fromAddress}|${toAddress}|${start.getHours()}`;

  if (travelTimeCache[hourKey] !== undefined) {
    context?.log?.('📍 Återanvänder restid (timvis cache):', travelTimeCache[hourKey], 'min');
    return travelTimeCache[hourKey];
  }
  if (travelTimeCache[travelKey] !== undefined) {
    context?.log?.('📍 Återanvänder restid från cache:', travelTimeCache[travelKey], 'min');
    return travelTimeCache[travelKey];
  }

  try {
    const dbRes = await db.query(
      `SELECT travel_minutes FROM travel_time_cache
       WHERE from_address = $1 AND to_address = $2 AND hour = $3 LIMIT 1`,
      [fromAddress, toAddress, start.getHours()]
    );
    if (dbRes.rows.length > 0) {
      const mins = dbRes.rows[0].travel_minutes;
      travelTimeCache[hourKey] = mins;
      travelTimeCache[travelKey] = mins;
      context?.log?.('📍 Återanvänder restid från DB-cache:', mins, 'min');
      return mins;
    }
  } catch (err) {
    context?.log?.('⚠️ Kunde inte läsa från travel_time_cache:', err.message);
  }

  try {
    const url = new URL('https://maps-api.apple.com/v1/directions');
    url.searchParams.append('origin', fromAddress);
    url.searchParams.append('destination', toAddress);
    url.searchParams.append('transportType', 'automobile');
    url.searchParams.append('departureTime', start.toISOString());
    context?.log?.('📡 Maps request URL:', url.toString());

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    context?.log?.(`⏱️ Apple Maps-respons på ${Date.now() - t0} ms`);
    const travelMin = Math.round((data.routes?.[0]?.durationSeconds || 0) / 60);
    travelTimeCache[travelKey] = travelMin;
    travelTimeCache[hourKey] = travelMin;

    // Spara i databasen
    try {
      await db.query(`
        INSERT INTO travel_time_cache (from_address, to_address, hour, travel_minutes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (from_address, to_address, hour)
        DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes, updated_at = NOW()
      `, [fromAddress, toAddress, start.getHours(), travelMin]);
    } catch (err) {
      context?.log?.('⚠️ Kunde inte spara restid till DB-cache:', err.message);
    }

    return travelMin;
  } catch (err) {
    context?.log?.('⚠️ Misslyckades hämta restid från Apple Maps:', err.message);
    travelTimeCache[travelKey] = Number.MAX_SAFE_INTEGER;
    travelTimeCache[hourKey] = Number.MAX_SAFE_INTEGER;
    return Number.MAX_SAFE_INTEGER;
  }
}

// Extraherad funktion: Ladda booking settings
async function loadBookingSettings(db) {
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
  return settings;
}

// Extraherad funktion: Validera restid till nästa möte
async function validateTravelToNextMeeting(end, next, accessToken, settings, context, db) {
  if (!next?.metadata?.address) return true;
  const travelTimeAfter = await getTravelTime(
    settings.default_office_address,
    next.metadata.address,
    end,
    accessToken,
    context,
    db
  );
  const arrivalAtNext = end.getTime() + travelTimeAfter * 60000;
  if (arrivalAtNext > next.start) {
    context.log(`⛔ Slot avvisad: restid till nästa möte för lång (${arrivalAtNext} > ${next.start})`);
    if (context && context.log) {
      context.log(`⚠️ Avvisad slot ${end.toISOString()} → ${new Date(next.start).toISOString()} av orsak ovan.`);
    }
    return false;
  }
  return true;
}