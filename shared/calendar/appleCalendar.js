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
      <c:comp-filter name="VEVENT"/>
      <!-- <c:time-range start="${DateTime.fromISO(startDate).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}" end="${DateTime.fromISO(endDate).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}"/> -->
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
      context.log("📡 CALDAV REPORT-status:", res.status, res.statusText, "✅ res.ok:", res.ok);
      if (!res.ok) {
        context.log("⚠️ REPORT misslyckades med status:", res.status, res.statusText);
        return [];
      }
      const xml = await res.text();
      context.log("🧾 XML preview (1000 tecken):", xml.slice(0, 1000));
      // Parse XML
      const parsed = await xml2js.parseStringPromise(xml, {
        explicitArray: false,
        ignoreAttrs: false,
        tagNameProcessors: [xml2js.processors.stripPrefix],
        explicitRoot: false
      });
      context.log("🧩 parsed objekt:", JSON.stringify(parsed, null, 2));
      // Extract VEVENTs from calendar-data
      const responses = [].concat(parsed?.multistatus?.response || []);
      let events = [];
      for (const resp of responses) {
        context.log("🔍 response-exempel:", JSON.stringify(resp, null, 2));
        const propstats = [].concat(resp?.propstat || []);
        for (const p of propstats) {
          context.log("📦 propstat:", JSON.stringify(p, null, 2));
          context.log("🧪 typeof calendar-data:", typeof p?.prop?.['calendar-data']);
          context.log("🧪 calendar-data raw:", JSON.stringify(p?.prop?.['calendar-data'], null, 2));
          const calendarData = typeof p?.prop?.['calendar-data'] === 'string'
            ? p?.prop?.['calendar-data']
            : p?.prop?.['calendar-data']?._;
          if (!calendarData) continue;
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

module.exports = (context) => createAppleClient(context);