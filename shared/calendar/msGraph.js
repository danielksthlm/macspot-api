const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
const fetch = require("node-fetch");
const { loadSettings } = require("../config/settingsLoader");
const getMsToken = require("./getMsToken");

function createMsGraphClient() {

  async function getEvent(calendarId, eventId) {
    try {
      if (!calendarId || !eventId) {
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

      return {
        eventId: created?.id || null,
        onlineMeetingUrl: created?.onlineMeeting?.joinUrl || null,
        subject: created?.subject || null,
        location: created?.location?.displayName || null,
        body: created?.body || null
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

const client = createMsGraphClient();
module.exports = () => client;