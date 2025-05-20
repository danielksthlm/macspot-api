const pool = require("../shared/db/pgPool");
const loadSettings = require("../shared/config/settingsLoader");
const verifyBookingSettings = require("../shared/config/verifySettings");
const { createDebugLogger } = require("../shared/utils/debugLogger");
const graphClient = require("../shared/calendar/msGraph")();
const appleClient = require("../shared/calendar/appleCalendar")();
console.log("✅ pool + settingsLoader import ok");
console.log("✅ debugLogger import ok");

module.exports = async function (context, req) {
  context.log("🧪 Azure Function entrypoint nådd");

  try {
    const db = await pool.connect();
    context.log("✅ DB-anslutning OK");

    const settings = await loadSettings(db, context);
    context.log("✅ settingsLoader OK – inställningar hämtade");
    verifyBookingSettings(settings, context);
    context.log("✅ verifySettings OK – inställningar verifierade");
    const timezone = settings.timezone || 'Europe/Stockholm';
    context.log(`🕒 Använder tidszon: ${timezone}`);

    const { email, contact_id, meeting_type: rawMeetingType, meeting_length } = req.body || {};
    context.log("📨 Inparametrar:", { email, contact_id, meeting_type: rawMeetingType, meeting_length });

    context.log("✅ Hoppar kontroll av graphClient/AppleClient i detta steg");

    context.res = {
      status: 200,
      body: { message: "✅ DB + settingsLoader OK", keys: Object.keys(settings) }
    };
    db.release();
  } catch (err) {
    context.log.error("❌ FEL i steg 1:", err.message);
    context.res = {
      status: 500,
      body: { error: err.message, stack: err.stack }
    };
  }
};