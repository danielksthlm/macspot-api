console.log("🧪 msGraph.js laddades");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
const fetch = require("node-fetch");
const { loadSettings } = require("../config/settingsLoader");

function createMsGraphClient() {
  let token = null;
  let tokenExpiresAt = null;

  async function getAccessToken() {
    const now = Date.now();
    if (token && tokenExpiresAt && now < tokenExpiresAt - 60000) {
      return token;
    }

    const tenantId = process.env.MS365_TENANT_ID;
    const clientId = process.env.MS365_CLIENT_ID;
    const clientSecret = process.env.MS365_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error("❌ En eller flera MS365_* miljövariabler saknas.");
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("scope", "https://graph.microsoft.com/.default");
    params.append("grant_type", "client_credentials");

    const res = await fetch(tokenEndpoint, {
      method: "POST",
      body: params
    });

    if (!res.ok) {
      console.error(`⚠️ Token fetch failed: ${res.statusText}`);
      throw new Error(`Token fetch failed: ${res.statusText}`);
    }
    const data = await res.json();
    token = data.access_token;
    tokenExpiresAt = now + data.expires_in * 1000;
    return token;
  }

  async function getEvent(calendarId, eventId) {
    try {
      if (!calendarId || !eventId) {
        console.warn("❌ getEvent missing calendarId or eventId (Graph)");
        return null;
      }

      const authToken = token || await getAccessToken();
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

      const authToken = token || await getAccessToken();
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

  return { getEvent, listUpcomingEvents };
}

if (process.env.NODE_ENV === 'test') {
  const testClient = createMsGraphClient();
  console.log("🧪 TEST graphClient:", typeof testClient.getEvent === 'function' ? '✅ getEvent finns' : '❌ getEvent saknas');
}

const client = createMsGraphClient();
console.log("🧪 msGraph-klient skapad – getEvent är funktion:", typeof client.getEvent === 'function');
module.exports = () => client;