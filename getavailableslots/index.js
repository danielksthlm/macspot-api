const pool = require("../shared/db/pgPool");
console.log("✅ getavailableslots/index.js laddad");

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
    } catch (err) {
      context.log("🔥 Fel vid laddning/verifiering av settings:", err.message);
      context.res = { status: 500, body: { error: "Settings error", detail: err.message } };
      return;
    }

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
};