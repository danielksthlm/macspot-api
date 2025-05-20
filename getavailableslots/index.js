const pool = require("../shared/db/pgPool");
const loadSettings = require("../shared/config/settingsLoader");
console.log("✅ pool + settingsLoader import ok");

module.exports = async function (context, req) {
  context.log("🧪 Azure Function entrypoint nådd");

  try {
    const db = await pool.connect();
    context.log("✅ DB-anslutning OK");

    const settings = await loadSettings(db, context);
    context.log("✅ Inställningar laddade");
    context.log("📦 Nycklar i settings:", Object.keys(settings).join(", "));

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