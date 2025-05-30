const fetch = require("node-fetch");
const xml2js = require("xml2js");
const { DateTime } = require("luxon");

function createAppleClient(context) {
  const debugLog = (...args) => { if (process.env.DEBUG === 'true') context.log(...args); };

  async function getEvent(calendarId, eventId) {
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


    if (!caldavUrl || !username || !password) {
      context.log("⚠️ Missing CalDAV credentials");
      return [];
    }

    const parseDate = (d) => {
      if (d instanceof Date) return DateTime.fromJSDate(d);
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) return DateTime.fromJSDate(parsed);
      return DateTime.invalid("Ogiltigt datumformat");
    };
    const startIso = parseDate(startDate).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
    const endIso = parseDate(endDate).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
    const xmlBody = `
    <C:calendar-query xmlns:C="urn:ietf:params:xml:ns:caldav"
                      xmlns:D="DAV:">
      <D:prop>
        <D:getetag/>
        <C:calendar-data/>
      </D:prop>
      <C:filter>
        <C:comp-filter name="VCALENDAR">
          <C:comp-filter name="VEVENT">
            <C:time-range start="${startIso}" end="${endIso}"/>
          </C:comp-filter>
        </C:comp-filter>
      </C:filter>
    </C:calendar-query>`;

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

      if (!xml || xml.length < 20) {
        context.log("⚠️ XML-svar verkar tomt – avbryter parsing.");
        return [];
      }

      const parsed = await xml2js.parseStringPromise(xml, {
        explicitArray: false,
        tagNameProcessors: [xml2js.processors.stripPrefix],
        mergeAttrs: true
      });

      const responses = parsed?.['multistatus']?.['response'] || parsed?.['D:multistatus']?.['D:response'];

      if (!responses) {
        context.log("⚠️ Inga responses hittades i CalDAV-XML");
        return [];
      }

      const items = Array.isArray(responses) ? responses : [responses];
      const targetPath = new URL(process.env.CALDAV_CALENDAR_URL.trim()).pathname;

      const filteredItems = items; // TEMP: inaktiverat filter för test

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
          if (!calendarData.includes("VEVENT")) {
            continue;
          }
        }

        const vevents = Array.from(calendarData.matchAll(/BEGIN:VEVENT[\S\s]*?END:VEVENT/g));
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


      const now = DateTime.local().setZone("Europe/Stockholm");
      const upcoming = results.filter(ev => {
        const dtRaw = ev.dtstart.replace(/^(\d{8})$/, '$1T000000');
        const dt = DateTime.fromFormat(dtRaw, "yyyyLLdd'T'HHmmss", { zone: "UTC" }).setZone("Europe/Stockholm");
        return dt > now;
      });

      return upcoming;
    } catch (err) {
      context.log("❌ Fel i fetchEventsByDateRange try/catch:", err.stack || err.message);
      return [];
    }
  }

  return { getEvent, fetchEventsByDateRange };
}

module.exports = (context) => createAppleClient(context || { log: console.log });