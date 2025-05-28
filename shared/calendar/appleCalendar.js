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
      context.log("📤 CalDAV fetch response headers:", JSON.stringify(Object.fromEntries(res.headers.entries())));

      const xml = await res.text();
      context.log("📤 Fick raw XML (1000 tecken):", xml.slice(0, 1000));
      context.log("🧾 FULL XML-RÅDATA:", xml.slice(0, 10000));
      context.log("📤 Är texten tom?", xml.trim().length === 0);
      context.log("📤 Innehåller VCALENDAR?", xml.includes("VCALENDAR"));
      context.log("📤 Innehåller VEVENT?", xml.includes("VEVENT"));
      context.log("📤 Rå XML-längd:", xml.length);
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
      context.log("🧪 DEBUG – Nycklar på toppnivå i parsed:", Object.keys(parsed));
      context.log("🧪 DEBUG – Är parsed.multistatus.response en array?", Array.isArray(parsed?.multistatus?.response));
      context.log("🧪 DEBUG – Antal responses:", parsed?.multistatus?.response?.length);
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
      context.log("📤 Antal responses efter parsing:", responses ? responses.length || 1 : 0);
  if (!responses) {
    context.log("⛔ Inga responses hittades i CalDAV-XML – parsed var:", JSON.stringify(parsed, null, 2));
    return [];
  }

      const items = Array.isArray(responses) ? responses : [responses];
      const targetPath = new URL(process.env.CALDAV_CALENDAR_URL.trim()).pathname;
      context.log("📎 Alla href som jämförs:", items.map(i => i.href || i['D:href']));
      context.log("🎯 CALDAV path som jämförs mot:", targetPath);
      context.log(`🔍 Antal CalDAV-responses totalt: ${items.length}`);
      const filteredItems = items; // TEMP: inaktiverat filter för test
      context.log("📎 Alla href som jämförs:", items.map(i => i.href || i['D:href']));
      context.log("🎯 CALDAV path som jämförs mot:", targetPath);
      for (const item of items) {
        const href = item['href'] || item['D:href'] || '';
        const match = href.trim().startsWith(targetPath.replace(/\/$/, ''));
        context.log("🔗 href:", href.trim(), "→ matchar targetPath?", match);
      }

      const results = [];

      for (const item of filteredItems) {
        context.log("📥 Rå item-data innan calendar-data-extraktion:", JSON.stringify(item, null, 2));
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
        context.log("📄 preview calendarData (500 tecken):", typeof calendarData === "string" ? calendarData.slice(0, 500) : "(ej sträng)");

        const href = item['href'] || item['D:href'];
        if (!calendarData || !calendarData.includes('VEVENT')) {
          context.log("❔ Ingen VEVENT hittad i calendar-data, försöker fallback:", href);
          context.log("📥 calendarData saknar VEVENT, startar fallback om möjligt.");
          const fullUrl = `${caldavUrl.replace(/\/$/, '')}${href}`;
          const fallbackRes = await fetch(fullUrl, {
            method: "GET",
            headers: {
              "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64")
            }
          });
          calendarData = await fallbackRes.text();
          context.log("📄 Fallback calendarData (500 tecken):", calendarData.slice(0, 500));
          context.log("📁 Fallback-URL:", fullUrl);
          context.log("📁 Fallback-response status:", fallbackRes.status);
          if (!calendarData.includes("VEVENT")) {
            context.log("⛔ Inget VEVENT i fallback-data – hoppar denna:", href);
            continue;
          }
        }

        context.log("📄 full calendarData för matchAll():", calendarData.slice(0, 2000));
        context.log("📄 full calendarData (preview 500 tecken):", calendarData.slice(0, 500));
        const vevents = Array.from(calendarData.matchAll(/BEGIN:VEVENT[\S\s]*?END:VEVENT/g));
        context.log("🔍 Antal VEVENT hittade i calendarData:", vevents.length);
        if (vevents.length === 0) {
          const uid = calendarData.match(/UID:(.*)/)?.[1]?.trim();
          context.log("⚠️ Ingen VEVENT hittades i denna calendarData – UID?:", uid);
        }
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

      // 🧪 DEBUG-logg före filter
      context.log("🧪 DEBUG – Apple-events före filter:", JSON.stringify(results, null, 2));
      for (const ev of results) {
        const dt = ev.dtstart.replace(/^(\d{8})$/, '$1T000000');
        context.log("⏱️ Kontroll: dtstart =", dt, ">", new Date().toISOString(), "→", new Date(dt) > new Date());
      }

      const now = DateTime.local().setZone("Europe/Stockholm");
      const upcoming = results.filter(ev => {
        const dtRaw = ev.dtstart.replace(/^(\d{8})$/, '$1T000000');
        const dt = DateTime.fromFormat(dtRaw, "yyyyLLdd'T'HHmmss", { zone: "UTC" }).setZone("Europe/Stockholm");
        const isFuture = dt > now;
        context.log("🕓 Filter upcoming –", { dtRaw, dt: dt.toISO(), now: now.toISO(), isFuture });
        return isFuture;
      });
      context.log(`✅ Hittade ${results.length} events totalt`);
      context.log(`📊 upcoming.length: ${upcoming.length}`);
      for (const u of upcoming) {
        context.log("📆 Upcoming:", u);
      }
      context.log("📦 Slutresultat – upcoming events:", JSON.stringify(upcoming, null, 2));
      context.log("📊 Antal upcoming events:", upcoming.length);
      context.log("📤 Returnerar upcoming-events till getavailableslots – första 3:", upcoming.slice(0, 3));
      context.log("✅ fetchEventsByDateRange avslutas – returnerar:", JSON.stringify(upcoming, null, 2));
      return upcoming;
    } catch (err) {
      context.log("❌ Fel i fetchEventsByDateRange try/catch:", err.stack || err.message);
      return [];
    }
  }

  return { getEvent, fetchEventsByDateRange };
}

module.exports = () => createAppleClient({ log: console.log });