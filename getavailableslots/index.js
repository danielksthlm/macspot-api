const pool = require("../shared/db/pgPool");
console.log("✅ getavailableslots/index.js laddad");
require('../shared/config/verifySettings');

module.exports = async function (context, req) {
  context.log("🧪 Azure Function entrypoint nådd");

  try {
    if (!req || !req.body) {
      context.log("❌ Ingen request body mottagen");
      context.res = { status: 400, body: { error: "Missing request body" } };
      return;
    }

    const { email, meeting_type } = req.body;
    const { contact_id } = req.body;
    context.log("✅ Request body innehåller:", { email, meeting_type });
    context.log("✅ Steg 1: Anropar DB med contact_id:", contact_id);

    try {
      const db = await pool.connect();
      const contactRes = await db.query("SELECT * FROM contact WHERE id = $1", [contact_id]);
      const contact = contactRes.rows[0];
      if (contact) {
        context.log("✅ Kontakt hittad:", contact.id);
      } else {
        context.log("⚠️ Ingen kontakt hittad för contact_id:", contact_id);
      }
      db.release();
    } catch (err) {
      context.log("🔥 DB-fel:", err.message);
      context.res = { status: 500, body: { error: "DB error", detail: err.message } };
      return;
    }

    context.log("✅ Steg 2: Laddar booking_settings...");

    const loadSettings = require('../shared/config/settingsLoader');
    const verifyBookingSettings = require('../shared/config/verifySettings');

    let settings;
    try {
      settings = await loadSettings(pool, context);
      context.log("✅ Steg 2a: Inställningar laddade – nycklar:", Object.keys(settings).join(', '));
      verifyBookingSettings(settings, context);
      context.log("✅ Steg 2b: Inställningar verifierade");

      context.log("✅ Steg 3: Genererar days[] och laddar bokningar");

      const bookingsByDay = {};
      const maxDays = settings.max_days_in_advance || 14;
      const today = new Date();
      const days = Array.from({ length: maxDays }, (_, i) => {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        return date;
      });

      const startDateStr = days[0].toISOString().split('T')[0];
      const endDateStr = days[days.length - 1].toISOString().split('T')[0];

      const db = await pool.connect();
      const allBookingsRes = await db.query(
        'SELECT start_time, end_time, meeting_type FROM bookings WHERE start_time::date >= $1 AND start_time::date <= $2',
        [startDateStr, endDateStr]
      );
      context.log("🔢 Antal bokningar hämtade:", allBookingsRes.rows.length);

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

      context.log("✅ Steg 3: Dagar genererade och bokningar summerade");
      db.release();

    } catch (err) {
      context.log("🔥 Fel vid laddning/verifiering av settings:", err.message);
      context.res = { status: 500, body: { error: "Settings error", detail: err.message } };
      return;
    }

    let generateSlotChunks;
    try {
      generateSlotChunks = require('../shared/slots/slotEngine').generateSlotChunks;
      context.log("✅ generateSlotChunks import ok");
    } catch (importErr) {
      context.log("❌ Misslyckades importera generateSlotChunks:", importErr.message);
      context.res = { status: 500, body: { error: "Import error", detail: importErr.message } };
      return;
    }

    // Test-anrop till generateSlotChunks
    const chosenSlotsResult = await generateSlotChunks({
      days: [], // vi skickar tom array som test
      context,
      contact: { metadata: {} },
      contact_id,
      meeting_type,
      meeting_length: 20,
      bookingsByDay: {},
      weeklyMinutesByType: {},
      settings,
      graphClient: null,
      appleClient: null,
      travelCache: new Map(),
      accessToken: null,
      timezone: settings.timezone || 'Europe/Stockholm',
      debugHelper: { debugLog: context.log, skipReasons: {} }
    });
    context.log("✅ generateSlotChunks kördes utan fel");

    context.res = {
      status: 200,
      body: {
        message: "✅ getavailableslots är kontaktbar och fungerar i minimal version",
        received: { email, meeting_type }
      }
    };
  } catch (err) {
    context.log("🔥 FEL i minimal testfunktion:", err.message);
    context.res = { status: 500, body: { error: err.message } };
  }
  context.log("✅ getavailableslots/index.js – HELA FUNKTIONEN KÖRDES UTAN FEL");
};