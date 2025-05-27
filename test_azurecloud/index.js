const { app } = require('@azure/functions');
const fetch = global.fetch;

app.http('test_azurecloud', {
  methods: ['GET'],
  authLevel: 'function',
  handler: async (request, context) => {
    try {
      const calendarUrl = process.env.CALDAV_CALENDAR_URL;
      const username = process.env.CALDAV_USER;
      const password = process.env.CALDAV_PASSWORD;

      if (!calendarUrl || !username || !password) {
        context.log("❌ Miljövariabler saknas – kontrollera CALDAV_CALENDAR_URL, CALDAV_USER, CALDAV_PASSWORD");
        return {
          status: 500,
          body: '❌ En eller flera CalDAV-miljövariabler saknas.'
        };
      }

      const basicAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

      const reportXml = `
<C:calendar-query xmlns:C="urn:ietf:params:xml:ns:caldav">
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT"/>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

      const res = await fetch(calendarUrl, {
        method: 'REPORT',
        headers: {
          Authorization: basicAuth,
          'Content-Type': 'application/xml',
          Depth: '1'
        },
        body: reportXml
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