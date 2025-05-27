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

  async function fetchEventsByDateRange(startDate, endDate) {
    const caldavUrl = process.env.CALDAV_CALENDAR_URL;
    const username = process.env.CALDAV_USER;
    const password = process.env.CALDAV_PASSWORD;

    context.log("🧪 fetchEventsByDateRange() kallas med:", { startDate, endDate });

    if (!caldavUrl || !username || !password) {
      context.log("⚠️ Missing CalDAV credentials");
      return [];
    }

    const formatToUTC = (dateObj) => DateTime.fromISO(dateObj, { zone: "utc" }).toFormat("yyyyMMdd'T'HHmmss'Z'");
    const rangeStart = formatToUTC(startDate);
    const rangeEnd = formatToUTC(endDate);

    context.log("📆 Intervall (UTC):", { rangeStart, rangeEnd });

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
      context.log(xml.slice(0, 2000));
      context.log("🔍 XML innan parsing:", xml.slice(0, 2000));
      const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
  context.log("📦 parsed XML till objekt:", JSON.stringify(parsed, null, 2));
      const responses = parsed?.['multistatus']?.['response'] || parsed?.['D:multistatus']?.['D:response'];
  if (!responses) {
    context.log("⛔ Inga responses hittades i CalDAV-XML – parsed var:", JSON.stringify(parsed, null, 2));
    return [];
  }

      const items = Array.isArray(responses) ? responses : [responses];
      context.log(`🔍 Antal CalDAV-responses totalt: ${items.length}`);
      const targetPath = new URL(process.env.CALDAV_CALENDAR_URL.trim()).pathname;
      const filteredItems = items.filter(item => {
        const href = item['href'] || item['D:href'] || '';
        const match = href.trim().startsWith(targetPath);
        context.log("🔗 href:", href.trim(), "→ matchar?", match);
        return match;
      });

      const results = [];

      for (const item of filteredItems) {
        let calendarData = item?.['propstat']?.['prop']?.['calendar-data'] || item?.['D:propstat']?.['D:prop']?.['C:calendar-data'];

        if (calendarData && typeof calendarData === 'object' && '_' in calendarData) {
          calendarData = calendarData._;
          const href = item['href'] || item['D:href'];
          context.log("📁 Analyserar href:", href);
          context.log("📄 calendarData:", calendarData.slice(0, 500));
        }

        const href = item['href'] || item['D:href'];
        if (!calendarData || !calendarData.includes('VEVENT')) {
          context.log("❔ Ingen VEVENT hittad i calendar-data, försöker fallback:", href);
          const fullUrl = `${caldavUrl.replace(/\/$/, '')}${href}`;
          const fallbackRes = await fetch(fullUrl, {
            method: "GET",
            headers: {
              "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64")
            }
          });
          calendarData = await fallbackRes.text();
          context.log("📄 Fallback calendarData:", calendarData.slice(0, 500));
          if (!calendarData.includes("VEVENT")) {
            context.log("⛔ Inget VEVENT i fallback-data – hoppar denna:", href);
            continue;
          }
        }

        const vevents = Array.from(calendarData.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g));
        for (const vevent of vevents) {
          const v = vevent[0];
          context.log("🧪 VEVENT:", v.slice(0, 300));
          const summary = v.match(/SUMMARY:(.*)/)?.[1]?.trim() ?? "–";
          const dtstart = v.match(/DTSTART(?:;[^:]*)?:(\d{8}(T\d{6})?)/)?.[1]?.trim() ?? "–";
          const dtend = v.match(/DTEND(?:;[^:]*)?:(\d{8}(T\d{6})?)/)?.[1]?.trim() ?? "–";
          context.log("🕒 Eventdatum:", { dtstart, dtend });
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

      const now = new Date();
      const upcoming = results.filter(ev => {
        const dt = ev.dtstart.replace(/^(\d{8})$/, '$1T000000');
        return new Date(dt) > now;
      });
      context.log(`✅ Hittade ${results.length} events totalt`);
      context.log(`📊 upcoming.length: ${upcoming.length}`);
      for (const u of upcoming) {
        context.log("📆 Upcoming:", u);
      }
      return upcoming;
    } catch (err) {
      context.log("❌ Fel i fetchEventsByDateRange():", err.message);
      return [];
    }
  }

  return { getEvent, fetchEventsByDateRange };
}

module.exports = () => createAppleClient({ log: console.log });