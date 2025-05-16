require('dotenv').config();
// createSubscription.js
const fetch = require('node-fetch');

const tenantId = process.env.MS365_TENANT_ID;
const clientId = process.env.MS365_CLIENT_ID;
const clientSecret = process.env.MS365_CLIENT_SECRET;

const userId = process.env.MS365_USER_EMAIL;
const notificationUrl = process.env.MSGRAPH_WEBHOOK_URL;

async function createSubscription() {
  try {
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
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error('❌ Ingen access token kunde erhållas. Fullt svar från token-endpoint:', tokenData);
      throw new Error('Ingen access token kunde erhållas');
    }

    const now = new Date();
    const expiration = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(); // max 4230 min för beta, 2h för v1.0

    const subscriptionBody = {
      changeType: 'created,updated,deleted',
      notificationUrl,
      resource: `/users/${userId}/calendar/events`,
      expirationDateTime: expiration,
      clientState: 'macspot-secret-state'
    };

    const subRes = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscriptionBody)
    });

    const result = await subRes.json();
    console.log('✅ Subscription skapad:', result);
  } catch (err) {
    console.error('❌ Fel vid skapande av subscription:', err.message);
  }
}

if (require.main === module) {
  createSubscription();
}