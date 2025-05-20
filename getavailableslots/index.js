const db = require("../shared/db/pgPool");
const createMsGraphClient = require('../shared/calendar/msGraph');
const createAppleClient = require('../shared/calendar/appleCalendar');
const { getAppleMapsAccessToken } = require('../shared/maps/appleMaps');
console.log("✅ getavailableslots/index.js laddad");
require('../shared/config/verifySettings');

module.exports = async function (context, req) {
  const appleClient = createAppleClient(context);
  const graphClient = createMsGraphClient();
  context.log("🧪 Azure Function entrypoint nådd");
  context.log("🧪 graphClient.getEvent:", typeof graphClient.getEvent === "function");
  context.log("🧪 appleClient.getEvent:", typeof appleClient.getEvent === "function");

  try {
    const client = await db.connect();

    if (!req || !req.body) {
      context.log("❌ Ingen request body mottagen");
      context.res = { status: 400, body: { error: "Missing request body" } };
      return;
    }

    const { email, meeting_type } = req.body;
    const { contact_id } = req.body;
    context.log("✅ Request body innehåller:", { email, meeting_type });
    context.log("✅ Steg 1: Anropar DB med contact_id:", contact_id);

    // Declare allBookings, days, and contact at the top-level scope of the outer try block
    let allBookings = [];
    let days = [];
    let contact;
    let bookingsByDay = {};

    try {
      const contactRes = await client.query("SELECT * FROM contact WHERE id = $1", [contact_id]);
      contact = contactRes.rows[0];
      if (contact) {
        context.log("✅ Kontakt hittad:", contact.id);
      } else {
        context.log("⚠️ Ingen kontakt hittad för contact_id:", contact_id);
      }
    } catch (err) {
      context.log("🔥 DB-fel:", err.message);
      context.res = { status: 500, body: { error: "DB error", detail: err.message } };
      client.release();
      return;
    }

    context.log("✅ Steg 2: Laddar booking_settings...");

    const loadSettings = require('../shared/config/settingsLoader');
    const verifyBookingSettings = require('../shared/config/verifySettings');

    let settings;
    try {
      settings = await loadSettings(db, context);
      context.log("✅ Steg 2a: Inställningar laddade – nycklar:", Object.keys(settings).join(', '));
      verifyBookingSettings(settings, context);
      context.log("✅ Steg 2b: Inställningar verifierade");

      context.log("✅ Steg 3: Genererar days[] och laddar bokningar");

      const maxDays = settings.max_days_in_advance || 14;
      const today = new Date();
      days = Array.from({ length: maxDays }, (_, i) => {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        return date;
      });

      const startDateStr = days[0].toISOString().split('T')[0];
      const endDateStr = days[days.length - 1].toISOString().split('T')[0];

      const allBookingsRes = await client.query(
        'SELECT start_time, end_time, meeting_type FROM bookings WHERE start_time::date >= $1 AND start_time::date <= $2',
        [startDateStr, endDateStr]
      );
      context.log("🔢 Antal bokningar hämtade:", allBookingsRes.rows.length);

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

      context.log("✅ Steg 3: Dagar genererade och bokningar summerade");

    } catch (err) {
      context.log("🔥 Fel vid laddning/verifiering av settings:", err.message);
      context.res = { status: 500, body: { error: "Settings error", detail: err.message } };
      client.release();
      return;
    }

    let generateSlotChunks;
    try {
      generateSlotChunks = require('../shared/slots/slotEngine').generateSlotChunks;
      context.log("✅ generateSlotChunks import ok");
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

    // Riktigt anrop till generateSlotChunks
    const slotGroupPicked = {};
    const chosenSlotsResult = await generateSlotChunks({
      days,
      context,
      contact,
      contact_id,
      meeting_type,
      meeting_length: 20,
      bookingsByDay,
      weeklyMinutesByType,
      settings,
      graphClient,
      appleClient,
      travelCache: new Map(),
      accessToken: await getAppleMapsAccessToken(context),
      timezone: settings.timezone || 'Europe/Stockholm',
      debugHelper: { debugLog: context.log, skipReasons: {} },
      client: client,
      slotGroupPicked
    });
    context.log("✅ generateSlotChunks kördes utan fel");

    context.res = {
      status: 200,
      body: {
        message: "✅ getavailableslots är kontaktbar och fungerar i minimal version",
        received: { email, meeting_type }
      }
    };
    client.release();
  } catch (err) {
    context.log("🔥 FEL i minimal testfunktion:", err.message);
    context.res = { status: 500, body: { error: err.message } };
  }
  context.log("✅ getavailableslots/index.js – HELA FUNKTIONEN KÖRDES UTAN FEL");
};