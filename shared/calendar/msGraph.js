const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");
const fetch = require("node-fetch");

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
  return data.access_token;
}

async function getEvent(calendarId, eventId) {
  try {
    const token = await getAccessToken();
    const client = Client.init({
      authProvider: (done) => done(null, token)
    });

    const result = await client
      .api(`/users/${process.env.MS365_USER_EMAIL}/calendar/events/${eventId}`)
      .select("location,end")
      .get();

    return {
      location: result.location?.displayName || null,
      endTime: result.end?.dateTime || null
    };
  } catch (err) {
    console.error("⚠️ getEvent error (Graph):", err.message);
    return null;
  }
}

module.exports = { getEvent };