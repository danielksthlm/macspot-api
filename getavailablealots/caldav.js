// File: lib/calendar/caldav.js
/**
 * Mock: Returnerar kalenderhändelser mellan två tider.
 * I framtiden: Hämta riktiga iCal-events via CalDAV (PROPFIND + REPORT).
 */
import { debug } from "../utils/debug.js";
import fetch from "node-fetch";
import ical from "node-ical";
const { CALDAV_USER, CALDAV_PASSWORD, CALDAV_CALENDAR_URL } = process.env;

export { getCalDAVEvents };
async function getCalDAVEvents(_, startTime, endTime) {
  try {
    const auth = Buffer.from(`${CALDAV_USER}:${CALDAV_PASSWORD}`).toString("base64");

    const headers = {
      "Content-Type": "application/xml; charset=utf-8",
      Authorization: `Basic ${auth}`,
      Depth: "1"
    };

    const body = `<?xml version="1.0" encoding="UTF-8"?>
    <c:calendar-query xmlns:c="urn:ietf:params:xml:ns:caldav"
                      xmlns:d="DAV:"
                      xmlns:cs="http://calendarserver.org/ns/">
      <d:prop>
        <d:getetag/>
        <c:calendar-data/>
      </d:prop>
      <c:filter>
        <c:comp-filter name="VCALENDAR">
          <c:comp-filter name="VEVENT">
            <c:time-range start="${startTime.replace(/[-:]/g, "").slice(0, 15)}Z"
                          end="${endTime.replace(/[-:]/g, "").slice(0, 15)}Z"/>
          </c:comp-filter>
        </c:comp-filter>
      </c:filter>
    </c:calendar-query>`;

    debug("caldav", "Skickar CalDAV REPORT", { url: CALDAV_CALENDAR_URL });

    const res = await fetch(CALDAV_CALENDAR_URL, {
      method: "REPORT",
      headers,
      body
    });

    if (!res.ok) {
      const err = await res.text();
      debug("caldav", "Fel vid CalDAV-anrop", { status: res.status, body: err });
      throw new Error("CalDAV-fel: " + res.status);
    }

    const text = await res.text();
    const matches = [...text.matchAll(/<c:calendar-data[^>]*>([\s\S]*?)<\/c:calendar-data>/g)];

    const events = [];
    for (const match of matches) {
      const icsData = match[1];
      const parsed = ical.parseICS(icsData);
      for (const key in parsed) {
        const entry = parsed[key];
        if (entry.type === "VEVENT") {
          events.push({
            start: entry.start.toISOString(),
            end: entry.end.toISOString(),
            location: entry.location
          });
        }
      }
    }

    debug("caldav", "Antal händelser", { count: events.length });
    return events;
  } catch (error) {
    debug("caldav", "Fel i getCalDAVEvents", { error });
    throw error;
  }
}

 