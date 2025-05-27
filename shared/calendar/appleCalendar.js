console.log("🧪 appleCalendar.js laddades");
const fetch = require("node-fetch");
const xml2js = require("xml2js");
const { DateTime } = require("luxon");

function createAppleClient(context) {
  async function getEvent(calendarId, eventId) {
    context.log("🍏 appleClient.getEvent() anropad med:", { calendarId, eventId });
    const caldavUrl = process.env.CALDAV_CALENDAR_URL;
    const username = process.env.CALDAV_USER;
    const password = process.env.CALDAV_PASSWORD;

    context.log("🧪 getEvent() kallas med:", { calendarId, eventId });
    context.log("🍏 appleClient.getEvent() startar – kontrollera om .ics-innehåll innehåller LOCATION och DTEND...");
    context.log("🌐 caldavUrl:", caldavUrl);
    context.log("👤 username:", username);

    context.log("🌐 Kontroll: CALDAV_CALENDAR_URL =", caldavUrl);
    context.log("👤 Kontroll: CALDAV_USER =", username);
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
      context.log("🧾 Förhandsvisning av ICS-innehåll (första 500 tecken):", icsText.slice(0, 500));
      context.log("🧾 Full ICS-innehåll:");
      context.log(icsText);
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
    if (!caldavUrl || !username || !password) {
      context.log("⚠️ Missing CalDAV credentials");
      return [];
    }
    // CalDAV REPORT XML
    const reportXml = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${startDate.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '').slice(0, 15)}" end="${endDate.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '').slice(0, 15)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
    try {
      const res = await fetch(caldavUrl, {
        method: "REPORT",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
          "Content-Type": "application/xml",
          "Depth": "1"
        },
        body: reportXml
      });
      if (!res.ok) {
        context.log("❌ CalDAV REPORT misslyckades:", res.status, res.statusText);
        return [];
      }
      const xml = await res.text();
      // Parse XML
      const parsed = await xml2js.parseStringPromise(xml);
      // Extract VEVENTs from calendar-data
      const responses = parsed['d:multistatus']?.['d:response'] || [];
      let events = [];
      for (const resp of responses) {
        const calendarData = resp['d:propstat']?.[0]?.['d:prop']?.[0]?.['calendar-data']?.[0];
        if (!calendarData) continue;
        // Extract SUMMARY, UID, DTSTART, DTEND, LOCATION from ICS data
        const dtstartMatch = calendarData.match(/DTSTART(?:;[^:]*)?:(.*)/);
        context.log("🧪 Hittad DTSTART-rad:", dtstartMatch?.[0]);
        const summary = (calendarData.match(/SUMMARY:(.*)/) || [])[1]?.trim();
        const uid = (calendarData.match(/UID:(.*)/) || [])[1]?.trim();
        const dtstart = dtstartMatch ? dtstartMatch[1].trim() : undefined;
        const dtend = (calendarData.match(/DTEND(?:;[^:]*)?:(.*)/) || [])[1]?.trim();
        const location = (calendarData.match(/LOCATION:(.*)/) || [])[1]?.trim();
        events.push({
          summary,
          uid,
          dtstart,
          dtend,
          location
        });
      }
      return events;
    } catch (err) {
      context.log("❌ Fel i fetchEventsByDateRange:", err.message);
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