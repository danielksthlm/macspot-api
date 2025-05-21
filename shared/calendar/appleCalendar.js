console.log("🧪 appleCalendar.js laddades");
const fetch = require("node-fetch");
const xml2js = require("xml2js");

function createAppleClient(context) {
  async function getEvent(calendarId, eventId) {
    const caldavUrl = process.env.CALDAV_CALENDAR_URL;
    const username = process.env.CALDAV_USER;
    const password = process.env.CALDAV_PASSWORD;

    context.log("🧪 getEvent() kallas med:", { calendarId, eventId });
    context.log("🌐 caldavUrl:", caldavUrl);
    context.log("👤 username:", username);

    if (!caldavUrl || !username || !password) {
      context.log("⚠️ Missing CalDAV credentials");
      return null;
    }

    try {
      const res = await fetch(caldavUrl, {
        method: "PROPFIND",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
          "Content-Type": "application/xml",
          "Depth": "1"
        },
        body: `<?xml version="1.0"?>
          <d:propfind xmlns:d="DAV:">
            <d:prop>
              <d:getetag/>
            </d:prop>
          </d:propfind>`
      });

      if (!res.ok) {
        context.log("⚠️ CalDAV PROPFIND failed:", res.statusText);
        return null;
      }

      const xml = await res.text();
      const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
      const responses = parsed['d:multistatus']?.['d:response'];
      const files = Array.isArray(responses) ? responses : [responses];

      for (const item of files) {
        const href = item?.['d:href'];
        if (!href || !href.endsWith('.ics')) continue;

        const eventUrl = `${caldavUrl.replace(/\/$/, '')}${href}`;
        const icsRes = await fetch(eventUrl, {
          method: "GET",
          headers: {
            "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64")
          }
        });

        if (!icsRes.ok) {
          context.log(`⚠️ Misslyckades hämta ICS-fil: ${href}`);
          continue;
        }

        const icsText = await icsRes.text();
        const locationMatch = icsText.match(/LOCATION:(.*)/);
        const endTimeMatch = icsText.match(/DTEND(?:;[^:]*)?:(.*)/);

        const location = locationMatch ? locationMatch[1].trim() : null;
        const endTime = endTimeMatch ? endTimeMatch[1].trim() : null;

        if (location && endTime) {
          context.log("✅ Hittade event med location och endTime:", { location, endTime });
          return { location, endTime };
        }
      }

      context.log("⚠️ Inget event med både location och endTime hittades.");
      return null;

    } catch (err) {
      context.log("⚠️ Error i getEvent():", err.message);
      return null;
    }
  }

  return { getEvent };
}

const client = createAppleClient({ log: console.log });

if (process.env.NODE_ENV === 'test') {
  console.log("🧪 TEST appleClient:", typeof client.getEvent === 'function' ? '✅ getEvent finns' : '❌ getEvent saknas');
}

module.exports = () => client;