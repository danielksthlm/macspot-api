const { DateTime } = require("luxon");
console.log("🧪 getavailableslots/index.js – första rad körd (fil laddades)");
console.log("✅ luxon import ok");
console.log("🧪 getavailableslots/index.js – FÖRSTA RADEN I FILEN KÖRS");
console.log("✅ Loading debugLogger");
const { createDebugLogger } = require('../shared/utils/debugLogger');
console.log("✅ Loading settingsLoader");
const loadSettings = require('../shared/config/settingsLoader');
console.log("✅ Loading verifySettings");
const verifyBookingSettings = require('../shared/config/verifySettings');
console.log("✅ Loading pgPool");
const pool = require('../shared/db/pgPool');
// console.log("✅ Loading msGraph");
// const createGraphClient = require('../shared/calendar/msGraph');
// let graphClient;
// console.log("✅ Loading appleCalendar");
// const appleClient = require('../shared/calendar/appleCalendar')();
console.log("✅ Loading appleMaps");
const { getAppleMapsAccessToken } = require('../shared/maps/appleMaps');
console.log("🧪 Försöker importera generateSlotChunks");
const { generateSlotChunks } = require('../shared/slots/slotEngine');
if (typeof generateSlotChunks !== 'function') {
  console.log("❌ generateSlotChunks är inte en funktion!");
} else {
  console.log("✅ generateSlotChunks är en funktion och redo att användas");
}
if (typeof generateSlotChunks !== 'function') {
  console.log("❌ generateSlotChunks är inte en funktion (efter import)");
} else {
  console.log("✅ generateSlotChunks är en funktion (efter import)");
}
console.log("🧪 generateSlotChunks importerat från slotEngine.js");
console.log("✅ generateSlotChunks import ok");
console.log("🧪 getavailableslots/index.js – samtliga imports klara");
console.log("✅ Alla imports genomförda – exporterar handler");
module.exports = async function (context, req) {
  context.log("🧪 getavailableslots – module.exports funktionen körs");
  console.log("🧪 Handler har kallats – första raden i handler");
  console.log("🧪 getavailableslots/index.js – handler påbörjad");
  context.log('🧪 Handler körs – första rad i handler');
  try {
    // context.log('🔧 Initialiserar graphClient...');
    // graphClient = createGraphClient();
    // context.log('✅ graphClient initierad');
    if (!req || !req.body) {
      context.log.error('❌ Ingen request body mottagen');
      context.res = { status: 400, body: { error: 'Missing request body' } };
      return;
    }
    const startTimeMs = Date.now();
    context.log("🧪 Steg 1 – startTimeMs satt");
    context.log(`📥 Request mottagen: ${JSON.stringify(req.body || {}, null, 2)}`);
    let msGraphAccessToken = null;
    const isDebug = process.env.DEBUG === 'true';
    const { debugLog, skipReasons, getSkipSummary } = createDebugLogger(context);
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
      // if (typeof graphClient?.setToken !== 'function') {
      //   throw new Error('graphClient saknar setToken-metod');
      // }
      // if (typeof appleClient?.setContext !== 'function') {
      //   throw new Error('appleClient saknar setContext-metod');
      // }
      // context.log('📦 graphClient keys:', Object.keys(graphClient || {}));
      // context.log('📦 appleClient keys:', Object.keys(appleClient || {}));
      // // Hämta MS Graph-token en gång
      // const getMsToken = require('../shared/calendar/getMsToken');
      // msGraphAccessToken = await getMsToken(context);
      // graphClient.setToken(msGraphAccessToken);
      // appleClient.setContext(context);
      debugLog('🏁 Börjar getavailableslots');
      const t0 = Date.now();
      const travelCache = new Map(); // key: from|to|hour
      // Flyttad slot-chunk och slot-generation till hjälpfunktion
      // Anropa generateSlotChunks direkt efter travelCache
      // (chunk-loop och slot-generation är nu flyttad)

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
    context.log("🧪 Steg 2 – inparametrar extraherade");
      const meeting_type = (rawMeetingType || '').toLowerCase();
      debugLog(`📨 Begäran mottagen med meeting_type: ${meeting_type}, meeting_length: ${meeting_length}, contact_id: ${contact_id}, email: ${email}`);

    const db = await pool.connect();
    context.log("🧪 Steg 3 – DB-anslutning etablerad");


    const contactRes = await db.query('SELECT * FROM contact WHERE id = $1', [contact_id]);
    context.log("🧪 Steg 4 – contact hämtad från DB");
    const contact = contactRes.rows[0];
    debugLog(`👤 Kontakt hittad: ${contact?.id || 'ej funnen'}`);
      const t1 = Date.now();
      debugLog('⏱️ Efter kontakt: ' + (Date.now() - t0) + ' ms');

      const settings = await loadSettings(db, context);
      context.log("🧪 Steg 5 – inställningar laddade");
      debugLog(`⚙️ Inställningar laddade: ${Object.keys(settings).join(', ')}`);
      verifyBookingSettings(settings, context);
      debugLog('⚙️ Inställningar klara');
      const timezone = settings.timezone || 'Europe/Stockholm';
      const t2 = Date.now();
      debugLog('⏱️ Efter settings: ' + (Date.now() - t0) + ' ms');

      const bookingsByDay = {};

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

      // Restidslogik (travelTimeMin) hanteras nu av resolveTravelTime i slotRules/generateSlotChunks

      const windowStartHour = DateTime.fromISO(`${days[0].toISOString().split('T')[0]}T${settings.travel_time_window_start || '06:00'}`, { zone: timezone }).toUTC().hour;
      const windowEndHour = DateTime.fromISO(`${days[0].toISOString().split('T')[0]}T${settings.travel_time_window_end || '23:00'}`, { zone: timezone }).toUTC().hour;

      // Skippa Apple Maps-token för felsökning
      context.log("🧪 Skippade Apple Maps-token för felsökning");

      // Parallellisera dag-loop i chunkar om 7
      // --- Ny slot-generation via generateSlotChunks ---
      context.log("🧪 Innan generateSlotChunks anrop");
      context.log("📦 Parametrar till generateSlotChunks:", {
        totalDays: days.length,
        contact_id,
        meeting_type,
        meeting_length
      });
      context.log("🧪 generateSlotChunks kommer nu anropas");
      const { chosenSlots, slotMapResult, slotLogSummary } = await generateSlotChunks({
        days,
        context,
        contact,
        contact_id,
        meeting_type,
        meeting_length,
        bookingsByDay,
        weeklyMinutesByType,
        settings,
        graphClient: null,
        appleClient: null,
        travelCache,
        accessToken,
        timezone,
        debugHelper: { debugLog, skipReasons }
      });
      context.log("🧪 generateSlotChunks anrop utfört");
      if (!chosenSlots || !slotMapResult) {
        context.log("❌ generateSlotChunks returnerade null eller undefined");
        context.res = {
          status: 500,
          body: { error: "generateSlotChunks failed to return expected data" }
        };
        return;
      }
      context.log(`✅ generateSlotChunks gav ${chosenSlots.length} slots och ${Object.keys(slotMapResult).length} map-keys`);
      context.log("🧪 Efter generateSlotChunks – kontroll om vi ens når hit");
      context.log("📊 chosenSlots:", Array.isArray(chosenSlots) ? chosenSlots.length : 'undefined');
      context.log("📊 slotMapResult keys:", slotMapResult ? Object.keys(slotMapResult).length : 'undefined');
      const slotMap = slotMapResult;
      const chosen = chosenSlots;
      const slotCount = chosen.length;

      // Scan for fallback travel time usage
      const fallbackSlots = chosen.filter(s => s.origin && s.travel_time_min && s.is_fallback === true);
      if (fallbackSlots.length > 0) {
        context.log(`🟡 ${fallbackSlots.length} slots använder fallback-restid – överväg att uppdatera cache`);
        // Optional: add logic to trigger refreshTravelTimes for those routes
      }

      const elapsedMs = Date.now() - t0;
      context.log(`⏱️ Total exekveringstid: ${elapsedMs} ms`);

      debugLog(`✅ getavailableslots klar med ${chosen.length} slots`);
      // --- Summerad loggning av varför slots har avvisats (om isDebug) ---
      if (isDebug) {
        for (const [reason, count] of Object.entries(getSkipSummary())) {
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
      context.log('🔥 FEL:', error.message);
      context.log(error.stack);
      context.res = {
        status: 500,
        body: { error: error.message, stack: error.stack }
      };
    }
  } catch (outerError) {
    context.log.error('🔥 FATALT FEL före try-blocket:', outerError.message);
    context.res = { status: 500, body: { error: 'Fatal error before try block', stack: outerError.stack } };
    return;
  }
};

console.log("✅ End of getavailableslots/index.js reached");

console.log("✅ getavailableslots/index.js – HELA FILEN exekverad");