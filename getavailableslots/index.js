import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import "isomorphic-fetch";

export default async function (context, req) {
  context.log("🚨 Kontroll: Filen laddades korrekt!");
  context.log("🔧 Kontroll: Funktion startar – om du ser detta loggas det INNAN något annat.");
  try {
    context.log("🟢 Funktion startar");

    try {
      context.log("📦 Miljövariabler:");
      context.log("GRAPH_CLIENT_ID", process.env.GRAPH_CLIENT_ID);
      context.log("GRAPH_CLIENT_SECRET", process.env.GRAPH_CLIENT_SECRET ? "[hemlig]" : "❌ Saknas");
      context.log("GRAPH_TENANT_ID", process.env.GRAPH_TENANT_ID);
      context.log("GRAPH_USER_ID", process.env.GRAPH_USER_ID);

      context.log("📨 Request-objekt:", JSON.stringify(req || {}, null, 2));
    } catch (fatalErr) {
      context.log.error("❌ Kunde inte ens logga variabler:", fatalErr);
    }

    context.log("✅ Funktion getavailableslots anropad (med Graph)");

    const meetingType = (req && req.body && req.body.meeting_type) || "atOffice";

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

      const result = await client.api(`/users/${userId}/calendar/getSchedule`).post({
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

    // meetingType redan definierad ovan
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
  } catch (err) {
    context.log.error("❌ Ovandefinierat fel i toppnivå:", err);
    context.res = {
      status: 500,
      body: {
        error: "Toppnivå-fel",
        details: err.message,
      },
    };
  }
};
