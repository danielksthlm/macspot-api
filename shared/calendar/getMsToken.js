console.log("🧪 getMsToken.js laddades");
const fetch = require('node-fetch');

module.exports = async function getMsToken(context = { log: console.log }) {
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

    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    if (!res.ok) {
      const errorText = await res.text();
      context.log(`⚠️ Tokenhämtning misslyckades: ${res.status} ${res.statusText}\nSvar: ${errorText}`);
      return null;
    }

    const data = await res.json();
    return data.access_token;
  } catch (err) {
    context.log(`⚠️ Tokenhämtning fel: ${err.message}`);
    return null;
  }
};