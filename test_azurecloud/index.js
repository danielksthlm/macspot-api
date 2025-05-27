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
    context.res = {
      status: 200,
      body: {
        status: "✅ Success",
        ip: text.trim(),
        timestamp,
        caldav_user: username,
        calendar_url: calendarUrl,
      }
    };
  } catch (err) {
    context.log("❌ Fetch fel:", err.stack || err.message);
    context.res = { status: 500, body: `❌ ${err.message}` };
  }
};