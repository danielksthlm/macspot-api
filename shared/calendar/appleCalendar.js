const fetch = require("node-fetch");
const xml2js = require("xml2js");

async function getEvent(calendarId, eventId) {
  // Example CalDAV basic auth and request (adjust based on real server config)
  const caldavUrl = process.env.CALDAV_CALENDAR_URL;
  const username = process.env.CALDAV_USER;
  const password = process.env.CALDAV_PASSWORD;

  if (!caldavUrl || !username || !password) {
    console.warn("Missing CalDAV credentials.");
    return null;
  }

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
    console.error("⚠️ CalDAV fetch failed:", res.statusText);
    return null;
  }

  const xml = await res.text();
  console.log("🔍 CalDAV response XML:", xml);

  // Parse XML to extract event location and endTime
  try {
    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
    // The response structure depends on the server; attempt to locate calendar-data
    const responses = parsed['d:multistatus']?.['d:response'];
    let calendarData;
    if (Array.isArray(responses)) {
      for (const response of responses) {
        if (response['d:propstat']?.['d:prop']?.['cal:calendar-data']) {
          calendarData = response['d:propstat']['d:prop']['cal:calendar-data'];
          break;
        }
      }
    } else if (responses && responses['d:propstat']?.['d:prop']?.['cal:calendar-data']) {
      calendarData = responses['d:propstat']['d:prop']['cal:calendar-data'];
    }

    if (!calendarData) {
      console.warn("No calendar-data found in CalDAV response.");
      return null;
    }

    // calendarData is a string containing iCalendar format, parse it to find location and end time
    const locationMatch = calendarData.match(/LOCATION:(.*)/);
    const endTimeMatch = calendarData.match(/DTEND(?:;[^:]*)?:(.*)/);

    const location = locationMatch ? locationMatch[1].trim() : null;
    const endTime = endTimeMatch ? endTimeMatch[1].trim() : null;

    return { location, endTime };
  } catch (err) {
    console.error("Error parsing CalDAV XML response:", err);
    return null;
  }
}

module.exports = { getEvent };