console.log("🧪 getavailableslots/index.js laddades – FÖRSTA RADEN I FILEN KÖRS");

const { getAppleMapsAccessToken } = require("../shared/maps/appleMaps");
console.log("✅ appleMaps import ok");

module.exports = async function (context, req) {
  try {
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
  } catch (err) {
    context.log.error("❌ FEL i getavailableslots/index.js:", err.message);
    context.log.error(err.stack);
    context.res = {
      status: 500,
      body: { error: "Kritiskt fel i function handler", message: err.message, stack: err.stack }
    };
  }
};