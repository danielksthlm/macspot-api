const fetch = require("node-fetch");
const xml2js = require("xml2js");

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

    const appleClient = require('../shared/calendar/appleCalendar')(context);
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 dagar
    context.log("🧪 fetchEventsByDateRange anropas med:", {
      start: now.toISOString(),
      end: end.toISOString()
    });
    const events = await appleClient.fetchEventsByDateRange(now.toISOString(), end.toISOString());
    context.log("📊 Antal event:", events.length);
    if (events.length > 0) {
      context.log("📌 Exempel på event:", events[0]);
    }

    // 🔍 Direkt CalDAV-test mot Apple
    const caldavUrl = process.env.CALDAV_CALENDAR_URL;
    const username = process.env.CALDAV_USER;
    const password = process.env.CALDAV_PASSWORD;

    const xmlBody = `
    <C:calendar-query xmlns:C="urn:ietf:params:xml:ns:caldav"
                      xmlns:D="DAV:">
      <D:prop>
        <D:getetag/>
        <C:calendar-data/>
      </D:prop>
      <C:filter>
        <C:comp-filter name="VCALENDAR">
          <C:comp-filter name="VEVENT">
            <C:time-range start="20250528T000000Z" end="20250628T000000Z"/>
          </C:comp-filter>
        </C:comp-filter>
      </C:filter>
    </C:calendar-query>`;

    try {
      context.log("📡 TEST – skickar CalDAV REPORT direkt till Apple...");
      const caldavRes = await fetch(caldavUrl, {
        method: "REPORT",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
          "Depth": "1",
          "Content-Type": "application/xml"
        },
        body: xmlBody
      });

      const caldavText = await caldavRes.text();
      context.log("📡 Apple CalDAV response status:", caldavRes.status);
      context.log("📄 Första 1000 tecken av svar:", caldavText.slice(0, 1000));
      context.log("🔍 Innehåller VEVENT?", caldavText.includes("VEVENT"));
    } catch (err) {
      context.log("❌ Direkt CalDAV-test misslyckades:", err.message);
    }

    context.res = {
      status: 200,
      body: {
        status: "✅ Success via shared module",
        count: events.length,
        events
      }
    };
  } catch (err) {
    context.log("❌ Fetch fel:", err.stack || err.message);
    context.res = { status: 500, body: `❌ ${err.message}` };
  }
};