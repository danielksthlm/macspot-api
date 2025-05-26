const { app } = require('@azure/functions');
const fetch = global.fetch;

app.http('test_apple_raw', {
  methods: ['GET'],
  authLevel: 'function',
  handler: async (request, context) => {
    try {
      const url = 'https://caldav.icloud.com/';
      const username = process.env.CALDAV_USER;
      const password = process.env.CALDAV_PASSWORD;

      const basicAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

      const res = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          Authorization: basicAuth
        }
      });

      const text = await res.text();

      context.log("📡 Status:", res.status);
      context.log("📄 Headers:", JSON.stringify([...res.headers]));
      context.log("📄 Body:", text);

      return {
        status: res.status,
        headers: { 'Content-Type': 'text/plain' },
        body: `✅ Apple CalDAV test klar – status ${res.status}`
      };
    } catch (err) {
      context.log("❌ Fel vid fetch:", err.message);
      return {
        status: 500,
        body: `❌ Fel vid fetch: ${err.message}`
      };
    }
  }
});