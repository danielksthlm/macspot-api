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
      const eventUrl = `${caldavUrl.replace(/\/$/, '')}/${eventId}.ics`;
      const icsRes = await fetch(eventUrl, {
        method: "GET",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64")
        }
      });

      if (!icsRes.ok) {
        context.log(`⚠️ Misslyckades hämta ICS-fil: ${eventUrl}`);
        return null;
      }

      const icsText = await icsRes.text();
      context.log("🔍 locationMatch:", icsText.match(/LOCATION:(.*)/));
      context.log("🔍 endTimeMatch:", icsText.match(/DTEND(?:;[^:]*)?:(.*)/));
      const locationMatch = icsText.match(/LOCATION:(.*)/);
      const endTimeMatch = icsText.match(/DTEND(?:;[^:]*)?:(.*)/);

      const location = locationMatch ? locationMatch[1].trim() : null;
      const endTime = endTimeMatch ? endTimeMatch[1].trim() : null;

      if (location && endTime) {
        context.log("✅ Hittade event med location och endTime:", { location, endTime });
        return { location, endTime };
      }

      context.log("⚠️ Inget event med både location och endTime hittades.");
      return null;

    } catch (err) {
      context.log("⚠️ Error i getEvent():", err.message);
      return null;
    }
  }

  // Hämtar alla events i ett datumintervall via CalDAV REPORT
  async function fetchEventsByDateRange(startDate, endDate) {
    const caldavUrl = process.env.CALDAV_CALENDAR_URL;
    const username = process.env.CALDAV_USER;
    const password = process.env.CALDAV_PASSWORD;

    context.log("🧪 fetchEventsByDateRange() kallas med:", { startDate, endDate });

    if (!caldavUrl || !username || !password) {
      context.log("⚠️ Missing CalDAV credentials");
      return [];
    }

    const xmlBody = `
<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${startDate}" end="${endDate}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`.trim();

    try {
      const res = await fetch(caldavUrl, {
        method: "REPORT",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
          "Depth": "1",
          "Content-Type": "application/xml"
        },
        body: xmlBody
      });

      if (!res.ok) {
        context.log(`⚠️ REPORT-förfrågan misslyckades: ${res.status}`);
        return [];
      }

      const xml = await res.text();
      const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });

      const responses = parsed['D:multistatus']?.['D:response'];
      if (!responses) {
        context.log("⚠️ Inga response-element i svar.");
        return [];
      }

      const items = Array.isArray(responses) ? responses : [responses];
      const result = [];

      for (const item of items) {
        // propstat kan vara array eller objekt
        let propstat = item?.['D:propstat'];
        if (Array.isArray(propstat)) {
          propstat = propstat[0];
        }
        const calendarData = propstat?.['D:prop']?.['C:calendar-data'];
        if (!calendarData) continue;

        const locationMatch = calendarData.match(/LOCATION:(.*)/);
        const endTimeMatch = calendarData.match(/DTEND(?:;[^:]*)?:(.*)/);
        const location = locationMatch ? locationMatch[1].trim() : null;
        const endTime = endTimeMatch ? endTimeMatch[1].trim() : null;

        if (location && endTime) {
          result.push({ location, endTime });
        }
      }

      context.log(`✅ Hittade ${result.length} events med både location och endTime`);
      return result;

    } catch (err) {
      context.log("⚠️ Error i fetchEventsByDateRange():", err.message);
      return [];
    }
  }

  return { getEvent, fetchEventsByDateRange };
}

const client = createAppleClient({ log: console.log });

if (process.env.NODE_ENV === 'test') {
  console.log("🧪 TEST appleClient:", typeof client.getEvent === 'function' ? '✅ getEvent finns' : '❌ getEvent saknas');
  console.log("🧪 TEST appleClient:", typeof client.fetchEventsByDateRange === 'function' ? '✅ fetchEventsByDateRange finns' : '❌ fetchEventsByDateRange saknas');
}

module.exports = () => client;