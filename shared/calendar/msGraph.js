const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
const DEBUG = process.env.DEBUG === 'true';
const silentLog = DEBUG ? console.log : () => {};
const fetch = require("node-fetch");
const { loadSettings } = require("../config/settingsLoader");
const getMsToken = require("./getMsToken");

function createMsGraphClient() {

  async function getEvent(calendarId, eventId) {
    try {
      if (!calendarId || !eventId) {
        return null;
      }

      const authToken = await getMsToken({ log: silentLog });
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
        return null;
      }
    } catch (err) {
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

      const authToken = await getMsToken({ log: silentLog });
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
      return [];
    }
  }

  async function createEvent({ start, end, subject, location, attendees, meetingType }) {
    try {
      const calendarId = process.env.MS365_USER_EMAIL;
      if (!calendarId) throw new Error("❌ MS365_USER_EMAIL saknas");

      const authToken = await getMsToken({ log: silentLog });
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
        isOnlineMeeting: meetingType === "teams",
        onlineMeetingProvider: meetingType === "teams" ? "teamsForBusiness" : null
      };

      // Uppdaterat Graph-anrop för att skicka inbjudan direkt till mottagaren
      silentLog("📤 Event som skickas till Graph:", JSON.stringify({ ...event, sendUpdates: 'all' }, null, 2));
      silentLog("🛠 createEvent() reached – preparing to send to Graph...");
      const created = await client
        .api(`/users/${calendarId}/events`)
        .header('Prefer', 'outlook.timezone="Europe/Stockholm"')
        .post({ ...event, attendees: event.attendees, sendUpdates: 'all' });
      silentLog("📥 Graph API svar:", created);

      return {
        eventId: created?.id || null,
        onlineMeetingUrl: created?.onlineMeeting?.joinUrl || null,
        subject: created?.subject || null,
        location: created?.location?.displayName || null,
        body: created?.body || null
      };
    } catch (err) {
      silentLog("❌ Graph createEvent error (full):", err.stack || err.toString());
      if (err.response) {
        const body = await err.response.text();
        silentLog("📡 Graph response error details:", body);
      }
      return null;
    }
  }

  async function sendEmailInvite({ to, subject, body }) {
    try {
      const senderEmail = process.env.MS365_USER_EMAIL;
      const authToken = await getMsToken({ log: silentLog });
      if (!authToken) throw new Error("❌ Kunde inte hämta Graph-token");

      const client = Client.init({
        authProvider: (done) => done(null, authToken)
      });

      const message = {
        message: {
          subject,
          body: {
            contentType: "HTML",
            content: body
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ]
        },
        saveToSentItems: "true"
      };

      await client.api(`/users/${senderEmail}/sendMail`).post(message);
      return { status: "sent" };
    } catch (err) {
      return null;
    }
  }

  return { getEvent, listUpcomingEvents, createEvent, sendEmailInvite };
}

const client = createMsGraphClient();
module.exports = () => client;