const fetch = require("node-fetch");

module.exports = async function (context, req) {
  context.log("🧪 test_azurecloud klassisk start");
  try {
    const res = await fetch('https://ifconfig.me');
    const text = await res.text();
    context.log("✅ fetch fungerade – IP:", text);
    context.res = { status: 200, body: `✅ IP: ${text}` };
  } catch (err) {
    context.log("❌ Fetch fel:", err.stack || err.message);
    context.res = { status: 500, body: `❌ ${err.message}` };
  }
};