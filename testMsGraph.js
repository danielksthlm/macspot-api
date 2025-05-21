const fetch = require("node-fetch");
require("dotenv").config();
process.env.PG_USE_SSL = "false";

let tokenEndpoint, params;

async function getAccessToken() {
  try {
    const res = await fetch(tokenEndpoint, {
      method: "POST",
      body: params
    });

    if (!res.ok) {
      console.error(`❌ Token fetch failed: ${res.statusText}`);
      const text = await res.text();
      console.error(text);
      return;
    }

    const data = await res.json();
    console.log("✅ Access token hämtad:");
    console.log(data.access_token.substring(0, 80) + "...");
    console.log(`🔐 Giltig i ${data.expires_in} sekunder`);
    return data.access_token;
  } catch (err) {
    console.error("❌ Fel vid tokenhämtning:", err);
  }
}

async function main() {
  let cloudSecrets;
  try {
    cloudSecrets = {
      MS365_TENANT_ID: process.env.MS365_TENANT_ID,
      MS365_CLIENT_ID: process.env.MS365_CLIENT_ID,
      MS365_CLIENT_SECRET: process.env.MS365_CLIENT_SECRET
    };
  } catch (err) {
    console.warn("⚠️ Kunde inte ladda från DB – använder process.env istället");
    cloudSecrets = {
      MS365_TENANT_ID: process.env.MS365_TENANT_ID,
      MS365_CLIENT_ID: process.env.MS365_CLIENT_ID,
      MS365_CLIENT_SECRET: process.env.MS365_CLIENT_SECRET
    };
  }
  console.log("🔍 Laddade miljövariabler:");
  console.log("  MS365_TENANT_ID:", cloudSecrets.MS365_TENANT_ID);
  console.log("  MS365_CLIENT_ID:", cloudSecrets.MS365_CLIENT_ID);
  console.log("  MS365_CLIENT_SECRET:", cloudSecrets.MS365_CLIENT_SECRET ? "[OK]" : "[SAKNAS]");
  const tenantId = cloudSecrets.MS365_TENANT_ID;
  const clientId = cloudSecrets.MS365_CLIENT_ID;
  const clientSecret = cloudSecrets.MS365_CLIENT_SECRET;

  tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");

  const accessToken = await getAccessToken();

  // === Början på MS Graph event-hämtning ===
  const { Client } = require("@microsoft/microsoft-graph-client");
  require("isomorphic-fetch");

  const graphClient = Client.init({
    authProvider: (done) => done(null, accessToken)
  });

  const calendarId = process.env.MS365_USER_EMAIL;

  const now = new Date();
  const startDate = now.toISOString();
  const endDate = new Date(now.getTime() + 180 * 86400000).toISOString(); // 180 dagar framåt
  const events = await graphClient
    .api(`/users/${calendarId}/calendarView?startDateTime=${startDate}&endDateTime=${endDate}`)
    .top(100)
    .select("subject,start,end,id")
    .orderby("start/dateTime ASC")
    .get();

  const upcoming = events.value.filter(ev => new Date(ev.start.dateTime) > new Date());
  console.log(`📋 Framtida events (${upcoming.length}):`);
  upcoming.forEach(ev => {
    console.log(`📌 ${ev.subject} (${ev.start.dateTime}) – ID: ${ev.id}`);
  });
  process.exit(0);
} 

main();