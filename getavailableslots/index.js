const fetch = require("node-fetch");
const { ClientSecretCredential } = require("@azure/identity");

module.exports = async function (context, req) {
  context.log("🟢 Funktion startar – enkel rumstest");

  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  const tenantId = process.env.GRAPH_TENANT_ID;

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  let token;

  try {
    token = await credential.getToken("https://graph.microsoft.com/.default");
    context.log("🔐 Token hämtad.");
  } catch (err) {
    context.log.error("❌ Fel vid tokenhämtning:", err.message);
    context.res = {
      status: 500,
      body: { error: err.message },
    };
    return;
  }

  const roomEmails = [
    "lillarummet@ettelva.se",
    "motesrummet@ettelva.se",
    "audiensen@ettelva.se",
    "mellanrummet@ettelva.se",
    "konferensen@ettelva.se",
  ];

  const start = new Date("2025-05-08T09:00:00+02:00").toISOString();
  const end = new Date("2025-05-08T11:00:00+02:00").toISOString();

  const body = {
    schedules: roomEmails,
    startTime: { dateTime: start, timeZone: "Europe/Stockholm" },
    endTime: { dateTime: end, timeZone: "Europe/Stockholm" },
    availabilityViewInterval: 30,
  };

  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/users/daniel@klrab.se/calendar/getSchedule", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    context.log("📆 Graph-svar:");
    context.log(JSON.stringify(result, null, 2));

    context.res = {
      status: 200,
      body: {
        message: "Rumstest färdig",
        result,
      },
    };
  } catch (err) {
    context.log.error("❌ Fel vid Graph-anrop:", err.message);
    context.res = {
      status: 500,
      body: { error: err.message },
    };
  }
};
