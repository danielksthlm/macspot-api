console.log("✅ Alla require-satser exekverades utan fel");
console.log("🧪 getavailableslots/index.js – laddning startar");

const { DateTime } = require("luxon");
console.log("✅ luxon import ok");

const pool = require("../shared/db/pgPool");
console.log("✅ pgPool import ok");

const loadSettings = require("../shared/config/settingsLoader");
console.log("✅ settingsLoader import ok");

const verifyBookingSettings = require("../shared/config/verifySettings");
console.log("✅ verifySettings import ok");

const { createDebugLogger } = require("../shared/utils/debugLogger");
console.log("✅ debugLogger import ok");

const graphClient = require("../shared/calendar/msGraph")();
console.log("✅ msGraph import ok");

const appleClient = require("../shared/calendar/appleCalendar")();
console.log("✅ appleCalendar import ok");

const { getAppleMapsAccessToken } = require("../shared/maps/appleMaps");
console.log("✅ appleMaps import ok");

module.exports = async function (context, req) {
  context.log("🧪 Azure Function entrypoint nådd");
  context.log("🧪 Function initierad");
  console.log("🧪 Kontrollpunkt: Azure Function körs med method:", req?.method);
  console.log("🧪 Payload body:", JSON.stringify(req?.body || {}, null, 2));
  console.log("🧪 Miljövariabler:", Object.keys(process.env).filter(k => k.startsWith("PG") || k.startsWith("APPLE") || k.startsWith("MS")).join(", "));
  Object.entries(process.env).forEach(([key, val]) => {
    if (key.startsWith("PG") || key.startsWith("APPLE") || key.startsWith("MS")) {
      console.log(`🔐 ENV ${key} = ${val ? val.slice(0, 5) : ""}... (${val ? val.length : 0} tecken)`);
    }
  });
  context.res = {
    status: 200,
    body: { message: "✅ Alla require är OK" }
  };
};