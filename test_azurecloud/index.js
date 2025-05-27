const fetch = require("node-fetch");

module.exports = async function (context, req) {
  const username = process.env.CALDAV_USER;
  const calendarUrl = process.env.CALDAV_CALENDAR_URL;

  context.log("📧 CALDAV_USER:", username);
  context.log("🌐 CALDAV_CALENDAR_URL:", calendarUrl);

  context.log("🧪 test_azurecloud klassisk start");
  try {
    const res = await fetch('https://ifconfig.me/ip');
    const text = await res.text();
    const timestamp = new Date().toISOString();
    context.log("🕒 Timestamp:", timestamp);
    context.log("✅ fetch fungerade – IP:", text);
    const password = process.env.CALDAV_PASSWORD;
    const basicAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    const reportXml = `
<C:calendar-query xmlns:C="urn:ietf:params:xml:ns:caldav">
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT"/>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    const caldavRes = await fetch(calendarUrl, {
      method: 'REPORT',
      headers: {
        Authorization: basicAuth,
        'Content-Type': 'application/xml',
        Depth: '0',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Prefer': 'return-minimal'
      },
      body: reportXml
    });

    const caldavText = await caldavRes.text();
    context.log("📡 CALDAV REPORT status:", caldavRes.status);
    context.log("📄 CALDAV XML body:", caldavText);

    context.res = {
      status: 200,
      body: {
        status: "✅ Success",
        ip: text.trim(),
        timestamp,
        caldav_user: username,
        calendar_url: calendarUrl,
        caldav_status_code: caldavRes.status,
        caldav_body_snippet: caldavText.substring(0, 1000)
      }
    };
  } catch (err) {
    context.log("❌ Fetch fel:", err.stack || err.message);
    context.res = { status: 500, body: `❌ ${err.message}` };
  }
};