console.log("🧪 msGraph.js laddades");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
const fetch = require("node-fetch");

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

  return { getEvent };
}

if (process.env.NODE_ENV === 'test') {
  const testClient = createMsGraphClient();
  console.log("🧪 TEST graphClient:", typeof testClient.getEvent === 'function' ? '✅ getEvent finns' : '❌ getEvent saknas');
}

const client = createMsGraphClient();
console.log("🧪 msGraph-klient skapad – getEvent är funktion:", typeof client.getEvent === 'function');
module.exports = () => client;