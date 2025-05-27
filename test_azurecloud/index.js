const fetch = require('node-fetch');

app.http('test_azurecloud', {
  methods: ['GET'],
  authLevel: 'function',
  handler: async (request, context) => {
    context.log("🧪 Minimal fetch startar");
    try {
      const res = await fetch('https://ifconfig.me/ip');
      const ip = await res.text();
      context.log("✅ IP:", ip);
      return {
        status: 200,
        body: `✅ Din IP är: ${ip}`
      };
    } catch (err) {
      context.log("❌ Fel vid minimal fetch:", err.message);
      return {
        status: 500,
        body: `❌ Fetch-fel: ${err.message}`
      };
    }
  }
});