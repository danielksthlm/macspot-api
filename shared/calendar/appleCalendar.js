  async function fetchEventsByDateRange(startDate, endDate) {
    const caldavUrl = process.env.CALDAV_CALENDAR_URL;
    const username = process.env.CALDAV_USER;
    const password = process.env.CALDAV_PASSWORD;
    if (!caldavUrl || !username || !password) {
      context.log("⚠️ Missing CalDAV credentials");
      return [];
    }

    const reportXml = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT"/>
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

      const parsed = await xml2js.parseStringPromise(xml, {
        explicitArray: false,
        ignoreAttrs: false,
        tagNameProcessors: [xml2js.processors.stripPrefix],
        explicitRoot: false
      });

      context.log("🧩 parsed objekt:", JSON.stringify(parsed, null, 2));

      const responses = [].concat(parsed?.response || []);
      const events = [];

      for (const resp of responses) {
        const propstats = [].concat(resp?.propstat || []);
        for (const p of propstats) {
          const calendarData = typeof p?.prop?.['calendar-data'] === 'string'
            ? p.prop['calendar-data']
            : p?.prop?.['calendar-data']?._;

          if (typeof calendarData !== 'string') {
            context.log("⚠️ Ogiltig eller saknad calendar-data:", JSON.stringify(p?.prop, null, 2));
            continue;
          }

          context.log("🧪 Hittad calendar-data:", calendarData.slice(0, 300));

          const dtstartMatch = calendarData.match(/DTSTART(?:;[^:]*)?:(.*)/);
          const dtendMatch = calendarData.match(/DTEND(?:;[^:]*)?:(.*)/);
          const uidMatch = calendarData.match(/UID:(.*)/);
          const summaryMatch = calendarData.match(/SUMMARY:(.*)/);
          const locationMatch = calendarData.match(/LOCATION:(.*)/);

          const event = {
            summary: summaryMatch?.[1]?.trim() || null,
            uid: uidMatch?.[1]?.trim() || null,
            dtstart: dtstartMatch?.[1]?.trim() || null,
            dtend: dtendMatch?.[1]?.trim() || null,
            location: locationMatch?.[1]?.trim() || null,
          };

          if (event.uid && event.dtstart) {
            context.log("✅ Sparar event:", event);
            events.push(event);
          } else {
            context.log("⚠️ Event saknar uid eller dtstart – ignoreras:", event);
          }
        }
      }

      context.log("📊 Totalt antal event som extraherades:", events.length);
      return events;
    } catch (err) {
      context.log("❌ Fel i fetchEventsByDateRange:", err.message);
      return [];
    }
  }