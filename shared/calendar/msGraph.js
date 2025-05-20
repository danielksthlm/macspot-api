console.log("🧪 msGraph.js laddades");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
const fetch = require("node-fetch");

function createMsGraphClient() {
  let token = null;

  async function getAccessToken() {
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

      const result = await client
        .api(`/users/${calendarId}/events/${encodeURIComponent(eventId)}`)
        .select("location,end")
        .get();

      const location = result.location?.displayName || null;
      const endTime = result.end?.dateTime || null;

      return { location, endTime };
    } catch (err) {
      console.error("⚠️ getEvent error (Graph):", err.message);
      return null;
    }
  }

  return { getEvent };
}

module.exports = createMsGraphClient;