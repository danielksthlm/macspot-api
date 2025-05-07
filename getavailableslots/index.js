const { Client } = require("@microsoft/microsoft-graph-client");
const { ClientSecretCredential } = require("@azure/identity");
require("isomorphic-fetch");

async function handler(context, req) {
  context.log("✅ Funktion getavailableslots anropad (med Graph)");

  if (!req || !req.body) {
    context.log.error("❌ req eller req.body är undefined!");
    context.res = {
      status: 400,
      body: { error: "Missing request body" }
    };
    return;
  }

  context.log("🧪 Kontrollpunkt startad.");
  context.log("🧪 req-body typ:", typeof req.body);
  context.log("🧪 req-body:", JSON.stringify(req.body, null, 2));

  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  const tenantId = process.env.GRAPH_TENANT_ID;
  const userId = process.env.GRAPH_USER_ID;

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  let token;
  try {
    token = await credential.getToken("https://graph.microsoft.com/.default");
    context.log("🟢 Token hämtad.");
  } catch (authError) {
    context.log.error("❌ Fel vid tokenhämtning:", authError);
    context.res = {
      status: 500,
      body: { error: "Misslyckades att hämta token", details: authError.message }
    };
    return;
  }

  const client = Client.init({
    authProvider: (done) => {
      done(null, token.token);
    },
  });

  const start = new Date("2025-05-08T09:00:00+02:00").toISOString();
  const end = new Date("2025-05-08T11:00:00+02:00").toISOString(); // 2 timmar framåt

  let response;
  try {
    const roomEmails = [
      "lillarummet@ettelva.se",
      "motesrummet@ettelva.se",
      "audiensen@ettelva.se",
      "mellanrummet@ettelva.se",
      "konferensen@ettelva.se",
    ];

    const result = await client.api("/me/calendar/getSchedule").post({
      schedules: roomEmails,
      startTime: {
        dateTime: start,
        timeZone: "Europe/Stockholm",
      },
      endTime: {
        dateTime: end,
        timeZone: "Europe/Stockholm",
      },
      availabilityViewInterval: 30,
    });

    context.log("📆 Graph getSchedule resultat:");
    context.log(JSON.stringify(result, null, 2));

    const availableRooms = result.value.filter(schedule => {
      return schedule.availabilityView && !schedule.availabilityView.includes("1");
    });

    context.log("✅ Lediga rum:");
    context.log(JSON.stringify(availableRooms.map(r => r.scheduleId), null, 2));

    if (!req.body) {
      context.log.warn("⚠️ Ingen body i requesten – använder standardvärden.");
    }
    const meetingType = (req.body && req.body.meeting_type) || "atOffice";
    response = {
      success: true,
      meeting_type: meetingType,
      available_rooms: availableRooms.map(r => r.scheduleId),
      all_schedules: result.value,
    };
  } catch (error) {
    context.log.error("❌ Fel vid getSchedule:", error);
    response = {
      success: false,
      error: error.message,
    };
  }

  context.res = {
    status: 200,
    body: response,
  };
}

module.exports = handler;