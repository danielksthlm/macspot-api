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

    context.log("🧪 fetchEventsByDateRange() kallas med:", { startDate, endDate });
    context.log(`🍏 fetchEventsByDateRange(): använder CALDAV_USER = ${process.env.CALDAV_USER}`);

    if (!caldavUrl || !username || !password) {
      context.log("⚠️ Missing CalDAV credentials");
      return [];
    }

    const formatToFloating = (dateObj) => DateTime.fromISO(dateObj).toFormat("yyyyMMdd'T'HHmmss");
    const rangeStart = formatToFloating(startDate);
    const rangeEnd = formatToFloating(endDate);

    const xmlBody = `
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data content-type="text/calendar"/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${rangeStart}" end="${rangeEnd}"/>
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

      const xml = await res.text();
      context.log("🔎 Rå XML-svar från CalDAV:");
      context.log(xml.slice(0, 2000)); // logga de första 2000 tecknen
      const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
      const responses = parsed?.['multistatus']?.['response'] || parsed?.['D:multistatus']?.['D:response'];
      context.log("📦 Parsed CalDAV-respons:", JSON.stringify(responses, null, 2));
      if (!responses) return [];

      const items = Array.isArray(responses) ? responses : [responses];
      // Filtrera på exakt rätt kalender-href
      const targetPath = new URL(process.env.CALDAV_CALENDAR_URL.trim()).pathname;
      context.log("🎯 Filtrerar på exakt href-prefix:", targetPath);
      const filteredItems = items.filter(item => {
        const href = item['href'] || item['D:href'] || '';
        const match = href.trim().startsWith(targetPath);
        if (!match) context.log("⛔ Hoppar annan kalender:", href.trim());
        return match;
      });
      const results = [];

      for (const item of filteredItems) {
        let calendarData = item?.['propstat']?.['prop']?.['calendar-data'] || item?.['D:propstat']?.['D:prop']?.['C:calendar-data'];

        if (calendarData && typeof calendarData === 'object' && '_' in calendarData) {
          calendarData = calendarData._;
        }

        const href = item['href'] || item['D:href'];
        if (!calendarData || !calendarData.includes('VEVENT')) {
          const fullUrl = `${caldavUrl.replace(/\/$/, '')}${href}`;
          const fallbackRes = await fetch(fullUrl, {
            method: "GET",
            headers: {
              "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64")
            }
          });
          calendarData = await fallbackRes.text();
          if (!calendarData.includes("VEVENT")) continue;
        }

        const vevents = Array.from(calendarData.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g));
        for (const vevent of vevents) {
          const v = vevent[0];
          const summary = v.match(/SUMMARY:(.*)/)?.[1]?.trim() ?? "–";
          const dtstart = v.match(/DTSTART(?:;[^:]*)?:(\d{8}(T\d{6})?)/)?.[1]?.trim() ?? "–";
          const dtend = v.match(/DTEND(?:;[^:]*)?:(\d{8}(T\d{6})?)/)?.[1]?.trim() ?? "–";
          const location = v.match(/LOCATION:(.*)/)?.[1]?.trim() ?? "–";
          const uid = v.match(/UID:(.*)/)?.[1]?.trim() ?? "–";
          results.push({ summary, dtstart, dtend, location, uid });
        }
      }

      results.sort((a, b) => {
        const aTime = new Date(a.dtstart.replace(/^(\d{8})$/, '$1T000000')).getTime();
        const bTime = new Date(b.dtstart.replace(/^(\d{8})$/, '$1T000000')).getTime();
        return aTime - bTime;
      });

      context.log(`✅ Hittade ${results.length} events totalt`);
      const now = new Date();
      const upcoming = results.filter(ev => {
        const dt = ev.dtstart.replace(/^(\d{8})$/, '$1T000000');
        return new Date(dt) > now;
      });
      return upcoming;
    } catch (err) {
      context.log("❌ Fel i fetchEventsByDateRange():", err.message);
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