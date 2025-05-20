console.log("🧪 appleCalendar.js laddades");
const fetch = require("node-fetch");
const xml2js = require("xml2js");

function createAppleClient(context) {
  return {
    async getEvent(calendarId, eventId) {
      const caldavUrl = process.env.CALDAV_CALENDAR_URL;
      const username = process.env.CALDAV_USER;
      const password = process.env.CALDAV_PASSWORD;

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
                <d:calendar-data xmlns="urn:ietf:params:xml:ns:caldav"/>
              </d:prop>
            </d:propfind>`
        });

        if (!res.ok) {
          context.log("⚠️ CalDAV fetch failed:", res.statusText);
          return null;
        }

        const xml = await res.text();
        const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
        const responses = parsed['d:multistatus']?.['d:response'];
        let calendarData;

        if (Array.isArray(responses)) {
          for (const response of responses) {
            const data = response['d:propstat']?.['d:prop']?.['cal:calendar-data'];
            if (data) {
              calendarData = data;
              break;
            }
          }
        } else {
          calendarData = responses?.['d:propstat']?.['d:prop']?.['cal:calendar-data'];
        }

        if (!calendarData) {
          context.log("⚠️ No calendar-data found in CalDAV response.");
          return null;
        }

        const locationMatch = calendarData.match(/LOCATION:(.*)/);
        const endTimeMatch = calendarData.match(/DTEND(?:;[^:]*)?:(.*)/);

        const location = locationMatch ? locationMatch[1].trim() : null;
        const endTime = endTimeMatch ? endTimeMatch[1].trim() : null;

        return { location, endTime };
      } catch (err) {
        context.log("⚠️ Error parsing CalDAV response:", err.message);
        return null;
      }
    }
  };
}

module.exports = createAppleClient;