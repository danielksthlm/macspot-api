const fetch = require("node-fetch");
require("dotenv").config();
const getCloudSecrets = require("./shared/config/settingsLoader");

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
  } catch (err) {
    console.error("❌ Fel vid tokenhämtning:", err);
  }
}

async function main() {
  const cloudSecrets = await getCloudSecrets();
  const tenantId = cloudSecrets.MS365_TENANT_ID;
  const clientId = cloudSecrets.MS365_CLIENT_ID;
  const clientSecret = cloudSecrets.MS365_CLIENT_SECRET;

  tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");

  await getAccessToken();
} 

main();