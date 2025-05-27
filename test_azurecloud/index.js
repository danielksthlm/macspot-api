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

    const appleClient = require('../shared/calendar/appleCalendar')();
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 dagar
    const events = await appleClient.fetchEventsByDateRange(now.toISOString(), end.toISOString());
    context.log("📊 Antal event:", events.length);
    if (events.length > 0) {
      context.log("📌 Exempel på event:", events[0]);
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