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
    context.log("✅ Request body innehåller:", { email, meeting_type });

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