const db = require("../shared/db/pgPool");
const createMsGraphClient = require('../shared/calendar/msGraph');
const createAppleClient = require('../shared/calendar/appleCalendar');
const { getAppleMapsAccessToken } = require('../shared/maps/appleMaps');
const { createDebugLogger } = require('../shared/utils/debugLogger');
const isDebug = process.env.DEBUG === 'true';
const { getSettings } = require('../shared/config/settingsLoader');
const verifyBookingSettings = require('../shared/config/verifySettings');
// console.log("✅ getavailableslots/index.js laddad");

module.exports = async function (context, req) {
  const debugLog = (msg) => { if (isDebug) context.log(msg); };
  const appleClient = createAppleClient(context);
  // --- Apple-kalenderanropet startas parallellt, men inväntas först senare ---
  const testStart = new Date();
  const testEnd = new Date(Date.now() + 7 * 86400000);
  if (!(testStart instanceof Date) || isNaN(testStart)) {
    debugLog("⛔ TEST Apple – Ogiltigt testStart:", testStart);
  }
  if (!(testEnd instanceof Date) || isNaN(testEnd)) {
    debugLog("⛔ TEST Apple – Ogiltigt testEnd:", testEnd);
  }
  const appleEventsPromise = appleClient.fetchEventsByDateRange(testStart, testEnd).catch(err => {
    debugLog("❌ Apple fetchEventsByDateRange FEL:", err.message);
    return [];
  });
  // --- Starta parallell laddning av inställningar ---
  const settingsPromise = getSettings(context).catch(err => {
    debugLog("❌ getSettings FEL:", err.message);
    return null;
  });
  const graphClient = createMsGraphClient();
  // context.log("🧪 Azure Function entrypoint nådd");
  // context.log("🧪 graphClient.getEvent:", typeof graphClient.getEvent === "function");
  // context.log("🧪 appleClient.getEvent:", typeof appleClient.getEvent === "function");

  try {
    const client = await db.connect();

    if (!req || !req.body) {
      context.log("❌ Ingen request body mottagen");
      context.res = { status: 400, body: { error: "Missing request body" } };
      return;
    }

    const { email, meeting_type, meeting_length, contact_id } = req.body;
    debugLog("✅ Request body innehåller: " + JSON.stringify({ email, meeting_type }));
    debugLog("✅ Steg 1: Anropar DB med contact_id: " + contact_id);

    // Declare allBookings, days, and contact at the top-level scope of the outer try block
    let allBookings = [];
    let days = [];
    let contact;
    let bookingsByDay = {};

    // --- Hämta Apple-kalenderdata parallellt och lägg in i bookingsByDay ---
    const testAppleRange = await appleEventsPromise;
    if (!testAppleRange || testAppleRange.length === 0) {
      debugLog("⛔ [BEVIS] Apple CalDAV returnerade inga events – möjligt problem med API eller filter.");
    } else {
      debugLog(`✅ [BEVIS] Apple CalDAV returnerade ${testAppleRange.length} event(s).`);
      const preview = testAppleRange.slice(0, 3);
      for (const ev of preview) {
        debugLog("📆 [BEVIS] Apple Event:", ev);
      }
    }
    if (Array.isArray(testAppleRange)) {
      for (const ev of testAppleRange) {
        if (ev.start && ev.end) {
          const dateKey = new Date(ev.start).toISOString().split('T')[0];
          if (!bookingsByDay[dateKey]) bookingsByDay[dateKey] = [];
          bookingsByDay[dateKey].push({
            start: new Date(ev.start).getTime(),
            end: new Date(ev.end).getTime()
          });
        }
      }
      debugLog("📥 Apple events insatta i bookingsByDay:");
      Object.entries(bookingsByDay).forEach(([date, events]) => {
        debugLog(`📅 ${date}: ${events.length} event(s)`);
        events.forEach(ev => {
          const start = new Date(ev.start).toISOString();
          const end = new Date(ev.end).toISOString();
          debugLog(`   ⏰ ${start} → ${end}`);
        });
      });
    }

    try {
      const contactRes = await client.query("SELECT * FROM contact WHERE id = $1", [contact_id]);
      contact = contactRes.rows[0];
      if (contact) {
        debugLog("✅ Kontakt hittad: " + contact.id);
      } else {
        debugLog("⚠️ Ingen kontakt hittad för contact_id: " + contact_id);
      }
    } catch (err) {
      context.log("🔥 DB-fel:", err.message);
      context.res = { status: 500, body: { error: "DB error", detail: err.message } };
      client.release();
      return;
    }

    debugLog("✅ Steg 2: Laddar booking_settings...");

    let settings;
    try {
      settings = await settingsPromise;
      verifyBookingSettings(settings, context);
      debugLog("✅ Steg 2a: Inställningar laddade – nycklar: " + Object.keys(settings).join(', '));
      debugLog("✅ Steg 2b: Inställningar verifierade");

      debugLog("✅ Steg 3: Genererar days[] och laddar bokningar");

      const maxDays = settings.max_days_in_advance || 14;
      const today = new Date();
      days = Array.from({ length: maxDays }, (_, i) => {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        return date;
      });

      // 🔍 Validera days[]
      days = days.filter((d, idx) => {
        const isValid = d instanceof Date && !isNaN(d);
        if (!isValid) {
          debugLog(`⛔ Ogiltigt datum i days[${idx}]: ` + d);
        }
        return isValid;
      });

      if (days.length === 0) {
        context.log("⛔ Alla datum i days[] var ogiltiga – avbryter exekvering.");
        context.res = { status: 500, body: { error: "Inga giltiga datum kunde genereras" } };
        client.release();
        return;
      }

      const startDateStr = days[0].toISOString().split('T')[0];
      const endDateStr = days[days.length - 1].toISOString().split('T')[0];

      const startDate = days[0];
      const endDate = days[days.length - 1];
      if (!(startDate instanceof Date) || isNaN(startDate)) {
        debugLog("⛔ Ogiltigt startDate skickat till fetchEventsByDateRange: " + startDate);
      }
      if (!(endDate instanceof Date) || isNaN(endDate)) {
        debugLog("⛔ Ogiltigt endDate skickat till fetchEventsByDateRange: " + endDate);
      }

      const allBookingsRes = await client.query(
        'SELECT start_time, end_time, meeting_type FROM bookings WHERE start_time::date >= $1 AND start_time::date <= $2',
        [startDateStr, endDateStr]
      );
      debugLog("🔢 Antal bokningar hämtade: " + allBookingsRes.rows.length);

      allBookings = allBookingsRes.rows.map(b => ({
        start: new Date(b.start_time).getTime(),
        end: new Date(b.end_time).getTime(),
        date: new Date(b.start_time).toISOString().split('T')[0],
        meeting_type: b.meeting_type
      }));

      for (const booking of allBookings) {
        if (!bookingsByDay[booking.date]) bookingsByDay[booking.date] = [];
        bookingsByDay[booking.date].push({ start: booking.start, end: booking.end });
      }

      debugLog("✅ Steg 3: Dagar genererade och bokningar summerade");

    } catch (err) {
      context.log("🔥 Fel vid laddning/verifiering av settings:", err.message);
      context.res = { status: 500, body: { error: "Settings error", detail: err.message } };
      client.release();
      return;
    }

    let generateSlotChunks;
    try {
      generateSlotChunks = require('../shared/slots/slotEngine').generateSlotChunks;
      debugLog("✅ generateSlotChunks import ok");
    } catch (importErr) {
      context.log("❌ Misslyckades importera generateSlotChunks:", importErr.message);
      context.res = { status: 500, body: { error: "Import error", detail: importErr.message } };
      client.release();
      return;
    }

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

    const debugHelper = createDebugLogger(context);

    const appleMapsToken = await getAppleMapsAccessToken(context);
    context.accessToken = appleMapsToken;
    if (appleMapsToken) {
      debugLog("✅ Apple Maps token hämtad – längd: " + appleMapsToken.length);
    } else {
      debugLog("⚠️ Apple Maps token saknas – fallback kommer att användas");
    }

    // Riktigt anrop till generateSlotChunks
    const slotGroupPicked = {};
    const startSlotGen = Date.now();
    const chosenSlotsResult = await generateSlotChunks({
      days,
      context,
      contact,
      contact_id,
      meeting_type,
      meeting_length,
      bookingsByDay,
      weeklyMinutesByType,
      settings,
      graphClient,
      appleClient,
      travelCache: new Map(),
      accessToken: appleMapsToken,
      timezone: settings.timezone || 'Europe/Stockholm',
      debugHelper,
      client: client,
      slotGroupPicked,
      logSlotContext: true
    });
    const durationMs = Date.now() - startSlotGen;
    debugLog(`⏱️ Slotgenerering klar på ${durationMs} ms`);
    debugLog("✅ generateSlotChunks kördes utan fel");
    debugLog("🔎 Efter generateSlotChunks – dags att filtrera FM/EM");

    const slots = Array.isArray(chosenSlotsResult?.chosenSlots) ? chosenSlotsResult.chosenSlots : [];
    const fallbackCount = slots.filter(s => s.source === 'fallback').length;
    const appleCount = slots.filter(s => s.source === 'apple').length;

    // Flyttat block för fm/em loggning precis före slutlogg:
    const fm = slots.filter(s => s.slot_part === 'fm');
    const em = slots.filter(s => s.slot_part === 'em');

    debugLog("📋 Tillgängliga FM-slots:\n" + fm.map(s => `☀️ ${s.slot_local} (${s.slot_iso}) – score: ${s.score}`).join('\n'));
    debugLog("📋 Tillgängliga EM-slots:\n" + em.map(s => `🌙 ${s.slot_local} (${s.slot_iso}) – score: ${s.score}`).join('\n'));
    debugHelper.logSlotsSummary(slots);

    // 📋 Logga tydlig lista på tillgängliga slots (en rad per slot)
    if (isDebug) {
      const uniqueSlotLog = slots.map(s => `${s.slot_local} (${s.weekday}, ${s.slot_part}, score: ${s.score})`).join('\n');
      debugLog("📋 Tillgängliga slots:\n" + uniqueSlotLog);
    }

    debugLog("🎯 Slut på exekvering av getavailableslots");
    const finalSlots = Array.isArray(chosenSlotsResult?.chosenSlots) ? chosenSlotsResult.chosenSlots : [];
    const finalApple = finalSlots.filter(s => s.source === 'apple').length;
    const finalFallback = finalSlots.filter(s => s.source === 'fallback').length;
    debugLog(`🎉 Slutlig summering: ${finalSlots.length} slots, ${finalApple} Apple Maps, ${finalFallback} fallback`);
    
    // Moved this debugLog line here, just before sending response:
    debugLog("✅ getavailableslots/index.js – HELA FUNKTIONEN KÖRDES UTAN FEL");
    debugLog("📋 getavailableslots – sista logg före response.");
    context.log("✅ getavailableslots – context.res sätts nu, detta är sista logg.");

    // context.log("📦 Slotresultat:", JSON.stringify(chosenSlotsResult?.chosenSlots || [], null, 2));

    // if (chosenSlotsResult?.chosenSlots?.length) {
    //   for (const slot of chosenSlotsResult.chosenSlots) {
    //     const slotHour = new Date(slot.slot_iso).getUTCHours();
    //     context.log(`📆 Slot: ${slot.slot_iso}, Part: ${slot.slot_part}, Origin: ${slot.origin}, Source: ${slot.source}`);
    //   }
    // }

    debugLog(`📊 Slot-källor: ${appleCount} med Apple Maps, ${fallbackCount} med fallback`);

    // context.log("📤 Response skickas med antal slots:", (chosenSlotsResult?.chosenSlots || []).length);
    debugLog("⏳ På väg att returnera response...");
    try {
      context.res = {
        status: 200,
        body: {
          message: "✅ getavailableslots är kontaktbar och fungerar i full version",
          received: { email, meeting_type, meeting_length },
          travel_stats: {
            apple_count: appleCount,
            fallback_count: fallbackCount
          },
          slots: Array.isArray(chosenSlotsResult?.chosenSlots)
            ? chosenSlotsResult.chosenSlots.map(slot => ({
                ...slot,
                score: slot.score ?? null
              }))
            : []
        }
      };
      client.release();
      debugLog("✅ Databasanslutning släppt");
      debugLog("✅ client.release() lyckades");
      debugLog("🏁 Funktion getavailableslots/index.js avslutad helt utan fel");
      context.log("✅ Azure Function getavailableslots har returnerat response.");
    } catch (err) {
      debugLog("❌ Fel vid response/build/release: " + err.message);
      context.res = {
        status: 500,
        body: { error: "Internal error after slot gen", detail: err.message }
      };
      context.log("✅ Azure Function getavailableslots har returnerat response.");
    }


  } catch (err) {
    context.log("🔥 FEL i funktion:", err.message);
    context.res = { status: 500, body: { error: err.message } };
  }
  // (Flyttad summering och slutloggar till rätt plats)
  context.log("🧪 SLUTPUNKT: Nådde allra sista raden");
};