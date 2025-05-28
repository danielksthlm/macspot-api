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

    const startIso = DateTime.fromJSDate(startDate).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
    const endIso = DateTime.fromJSDate(endDate).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
    context.log("📅 Använder time-range:", { startIso, endIso });
    context.log("📆 REPORT-request time range:", { startIso, endIso });
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
      context.log("📡 Initierar CalDAV REPORT-request…");
      const res = await fetch(caldavUrl, {
        method: "REPORT",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
          "Depth": "1",
          "Content-Type": "application/xml"
        },
        body: xmlBody
      });
      context.log("📡 CalDAV-anrop utfört, statuskod:", res.status);
      context.log("📡 CalDAV response OK?", res.ok);

      const xml = await res.text();
      context.log("📄 CalDAV response text (första 1000 tecken):", xml.slice(0, 1000));
      context.log("📄 Full längd på svar:", xml.length);
      context.log("📄 Rå XML:", xml.slice(0, 2000));
      context.log("🔍 Innehåller <href>? →", xml.includes("&lt;href&gt;") || xml.includes("<href>"));
      context.log("📄 Fick XML-svar, längd:", xml.length);

      if (!xml || xml.length < 20) {
        context.log("⚠️ XML-svar verkar tomt – avbryter parsing.");
        return [];
      }

      context.log("🧾 FULL XML-RÅDATA:", xml.slice(0, 10000));
      context.log("🔍 Försöker parsa XML...");
      const parsed = await xml2js.parseStringPromise(xml, {
        explicitArray: false,
        tagNameProcessors: [xml2js.processors.stripPrefix],
        mergeAttrs: true
      });
      context.log("🧾 xml2js parsed objekt (första 5000 tecken):", JSON.stringify(parsed).slice(0, 5000));
      context.log("🧾 parsed objekt (10 000 tecken):", JSON.stringify(parsed).slice(0, 10000));
      context.log("✅ xml2js parsing lyckades:", JSON.stringify(parsed, null, 2));
      context.log("✅ xml2js.parseStringPromise lyckades – parsed objekt:");
      context.log(JSON.stringify(parsed, null, 2));
      context.log("🧩 parsed multistatus keys:", Object.keys(parsed));
      context.log("🧩 parsed.multistatus.response (rå):", JSON.stringify(parsed?.['multistatus']?.['response'], null, 2));
      context.log("🧩 parsed.D:multistatus.D:response (rå):", JSON.stringify(parsed?.['D:multistatus']?.['D:response'], null, 2));
      if (!parsed?.['multistatus']?.['response'] && !parsed?.['D:multistatus']?.['D:response']) {
        context.log("⛔ parsed innehåller inte förväntade response-nycklar:", JSON.stringify(parsed, null, 2));
      }
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
        context.log("🔍 Jämför href:", href.trim(), "med targetPath:", targetPath);
        const match = href.trim().startsWith(targetPath.replace(/\/$/, ''));
        context.log("🔗 href:", href.trim(), "→ matchar?", match);
        return match;
      });

      const results = [];

      for (const item of filteredItems) {
        let calendarData = item?.['propstat']?.['prop']?.['calendar-data'] || item?.['D:propstat']?.['D:prop']?.['C:calendar-data'];

        if (!calendarData) {
          context.log("⚠️ Ingen calendar-data hittad i item:", JSON.stringify(item, null, 2));
        }

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
          context.log("📁 Fallback-URL:", fullUrl);
          context.log("📁 Fallback-response status:", fallbackRes.status);
          context.log("📁 Fallback calendarData (första 500 tecken):", calendarData.slice(0, 500));
          if (!calendarData.includes("VEVENT")) {
            context.log("⛔ Inget VEVENT i fallback-data – hoppar denna:", href);
            continue;
          }
        }

        context.log("📄 full calendarData för matchAll():", calendarData.slice(0, 2000));
        const vevents = Array.from(calendarData.matchAll(/BEGIN:VEVENT[\S\s]*?END:VEVENT/g));
        context.log(`🔍 VEVENT hittades: ${vevents.length} st`);
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
      context.log("📦 Slutresultat – upcoming events:", JSON.stringify(upcoming, null, 2));
      context.log("📊 Antal upcoming events:", upcoming.length);
      context.log("📤 Returnerar upcoming-events till getavailableslots – första 3:", upcoming.slice(0, 3));
      return upcoming;
    } catch (err) {
      context.log("❌ Fel i fetchEventsByDateRange try/catch:", err.stack || err.message);
      return [];
    }
  }

  return { getEvent, fetchEventsByDateRange };
}

module.exports = () => createAppleClient({ log: console.log });