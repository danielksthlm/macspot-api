console.log("🧪 msGraph.js laddades");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
const fetch = require("node-fetch");
const { loadSettings } = require("../config/settingsLoader");
const getMsToken = require("./getMsToken");

function createMsGraphClient() {

  async function getEvent(calendarId, eventId) {
    console.log(`🧪 getEvent() kallas med calendarId=${calendarId}, eventId=${eventId}`);
    console.log(`📡 getEvent(): använder calendarId = ${calendarId}, förväntad = ${process.env.MS365_USER_EMAIL}`);
    try {
      if (!calendarId || !eventId) {
        console.warn("❌ getEvent missing calendarId or eventId (Graph)");
        return null;
      }

      const authToken = await getMsToken({ log: console.log });
      if (!authToken) {
        throw new Error("🛑 Tokenhämtning misslyckades – accessToken saknas. Funktion avbryts.");
      }
      const client = Client.init({
        authProvider: (done) => done(null, authToken)
      });

      try {
        const result = await client
          .api(`/users/${calendarId}/events/${encodeURIComponent(eventId)}`)
          .select("subject,location,start,end")
          .get();

        const location = result.location?.displayName || null;
        const endTime = result.end?.dateTime || null;

        return { location, endTime };
      } catch (err) {
        if (err.statusCode === 404) {
          console.warn(`⚠️ getEvent: event ${eventId} saknas`);
          return { location: null, endTime: null, deleted: true };
        }
        console.error("⚠️ getEvent error (Graph):", err.message);
        return null;
      }
    } catch (err) {
      console.error("⚠️ getEvent error (Graph):", err.message);
      return null;
    }
  }

  async function listUpcomingEvents(daysAhead) {
    try {
      if (!daysAhead) {
        const settings = await loadSettings(null);
        daysAhead = settings.max_days_in_advance || 90;
      }
      const calendarId = process.env.MS365_USER_EMAIL;
      if (!calendarId) throw new Error("❌ MS365_USER_EMAIL saknas");

      const authToken = await getMsToken({ log: console.log });
      if (!authToken) {
        throw new Error("🛑 Tokenhämtning misslyckades – accessToken saknas. Funktion avbryts.");
      }
      const client = Client.init({
        authProvider: (done) => done(null, authToken)
      });

      const now = new Date();
      const startDate = now.toISOString();
      const endDate = new Date(now.getTime() + daysAhead * 86400000).toISOString();

      const response = await client
        .api(`/users/${calendarId}/calendarView?startDateTime=${startDate}&endDateTime=${endDate}`)
        .top(100)
        .select("subject,start,end,id")
        .orderby("start/dateTime ASC")
        .get();

      const upcoming = response.value.filter(ev => new Date(ev.start.dateTime) > new Date());
      return upcoming.map(ev => ({
        subject: ev.subject,
        start: ev.start.dateTime,
        end: ev.end?.dateTime || null,
        id: ev.id
      }));
    } catch (err) {
      console.error("⚠️ listUpcomingEvents error (Graph):", err.message);
      return [];
    }
  }

  async function createEvent({ start, end, subject, location, attendees }) {
    try {
      const calendarId = process.env.MS365_USER_EMAIL;
      if (!calendarId) throw new Error("❌ MS365_USER_EMAIL saknas");

      const authToken = await getMsToken({ log: console.log });
      if (!authToken) throw new Error("🛑 Tokenhämtning misslyckades");

      const client = Client.init({
        authProvider: (done) => done(null, authToken)
      });

      const event = {
        subject: subject || "Möte",
        body: {
          contentType: "HTML",
          content: `Detta är en inbjudan till möte: ${subject || "Möte"}`
        },
        start: {
          dateTime: start,
          timeZone: "Europe/Stockholm"
        },
        end: {
          dateTime: end,
          timeZone: "Europe/Stockholm"
        },
        location: {
          displayName: location || "Online"
        },
        attendees: (attendees || []).map(email => ({
          emailAddress: { address: email },
          type: "required"
        })),
        allowNewTimeProposals: true,
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness"
      };

      const created = await client.api(`/users/${calendarId}/events`).post(event);
      if (!created) {
        console.warn("⚠️ createEvent returnerade null");
      } else {
        console.log("📬 createEvent FULLT RESULTAT:", JSON.stringify(created, null, 2));
        console.log("✅ createEvent: Event skapades i MS Graph:", created.id);
        if (!created.onlineMeeting?.joinUrl) {
          console.warn("⚠️ Ingen joinUrl genererad – event skapades men saknar Teams-länk.");
          console.warn("📌 Kontrollera fältet isOnlineMeeting och onlineMeetingProvider i responsen:");
          console.warn("🔍 isOnlineMeeting:", created.isOnlineMeeting);
          console.warn("🔍 onlineMeetingProvider:", created.onlineMeetingProvider);
          console.warn("🔍 bodyPreview:", created.bodyPreview);
        }
      }
      return {
        eventId: created?.id || null,
        onlineMeetingUrl: created?.onlineMeeting?.joinUrl || null,
        subject: created?.subject || null,
        location: created?.location?.displayName || null,
        body: created?.body || null  // ✅ Lägg till detta
      };
    } catch (err) {
      console.error("❌ createEvent error (Graph):", err.message || err);
      if (err.response?.text) {
        const raw = await err.response.text();
        console.error("📄 Graph response text:", raw);
      }
      console.error("📄 Detaljerat Graph-felobjekt:", JSON.stringify(err, null, 2));
      return null;
    }
  }

  return { getEvent, listUpcomingEvents, createEvent };
}

if (process.env.NODE_ENV === 'test') {
  const testClient = createMsGraphClient();
  console.log("🧪 TEST graphClient:", typeof testClient.getEvent === 'function' ? '✅ getEvent finns' : '❌ getEvent saknas');
}

const client = createMsGraphClient();
console.log("🧪 msGraph-klient skapad – getEvent är funktion:", typeof client.getEvent === 'function');
module.exports = () => client;