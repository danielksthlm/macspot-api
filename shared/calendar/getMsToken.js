require('dotenv').config(); // Ladda miljövariabler från .env
const fetch = require('node-fetch');

console.log("🧪 getMsToken.js laddades");

module.exports = async function getMsToken(context = { log: console.log }) {
  context.log("🧪 getMsToken() anropades – initierar tokenhämtning");
  context.log("🔍 MS365_CLIENT_ID:", process.env.MS365_CLIENT_ID?.slice(0, 8));
  context.log("🔍 MS365_CLIENT_SECRET:", process.env.MS365_CLIENT_SECRET ? "[satt]" : "[saknas]");
  context.log("🔍 MS365_TENANT_ID:", process.env.MS365_TENANT_ID?.slice(0, 8));
  if (!process.env.MS365_CLIENT_ID || !process.env.MS365_CLIENT_SECRET || !process.env.MS365_TENANT_ID) {
    context.log("❌ En eller flera miljövariabler för MS Graph saknas.");
    return null;
  }
  try {
    const tokenEndpoint = `https://login.microsoftonline.com/${process.env.MS365_TENANT_ID}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('client_id', process.env.MS365_CLIENT_ID);
    params.append('client_secret', process.env.MS365_CLIENT_SECRET);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('grant_type', 'client_credentials');

    context.log("📡 Försöker hämta token från:", tokenEndpoint);

    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    context.log(`📬 Response status: ${res.status}`);

    if (!res.ok) {
      const errorText = await res.text();
      context.log(`⚠️ Tokenhämtning misslyckades: ${res.status} ${res.statusText}\nSvar: ${errorText}`);
      context.log("🪵 Fullständigt svar från Graph:", errorText);
      return null;
    }

    const data = await res.json();
    return data.access_token;
  } catch (err) {
    context.log(`⚠️ Tokenhämtning fel: ${err.message}`);
    return null;
  }
};

if (require.main === module) {
  (async () => {
    const token = await module.exports();
    if (token) {
      console.log("✅ Token hämtad:", token.slice(0, 20) + "...");
    } else {
      console.log("❌ Kunde inte hämta token.");
    }
  })();
}