require('dotenv').config();
const fetch = require('node-fetch');

async function renewSubscription() {
  const tenantId = process.env.MS365_TENANT_ID;
  const clientId = process.env.MS365_CLIENT_ID;
  const clientSecret = process.env.MS365_CLIENT_SECRET;
  const subscriptionId = process.env.SUBSCRIPTION_ID; // lägg till i din .env

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error('❌ Kunde inte hämta access token:', tokenData);
    return;
  }

  const newExpiration = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1 timme

  const res = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expirationDateTime: newExpiration })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('❌ Fel vid förnyelse:', err);
  } else {
    const result = await res.json();
    console.log('✅ Förnyad subscription:', result);
  }
}

renewSubscription();