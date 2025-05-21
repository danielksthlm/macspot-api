async function listIcsWithFirstStartDate() {
  const xmlBody = `
  <C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop>
      <D:getetag/>
      <C:calendar-data/>
    </D:prop>
    <C:filter>
      <C:comp-filter name="VCALENDAR">
        <C:comp-filter name="VEVENT"/>
      </C:comp-filter>
    </C:filter>
  </C:calendar-query>`.trim();

  try {
    const res = await fetch(caldavUrl, {
      method: 'REPORT',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': '1'
      },
      body: xmlBody
    });

    const text = await res.text();
    const parsed = await xml2js.parseStringPromise(text, { explicitArray: false });
    const responses = parsed['D:multistatus']?.['D:response'] || parsed['multistatus']?.['response'];
    const items = Array.isArray(responses) ? responses : [responses];

    // Parallel fetches for all items using Promise.all
    const fetches = items.map(async (item) => {
      const href = item['D:href'] || item['href'];
      const fullUrl = `${caldavHost}${href}`;
      const icsRes = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        }
      });
      const icsText = await icsRes.text();

      if (!icsText.includes('BEGIN:VEVENT')) return null;
      const dtstart = icsText.match(/DTSTART(?:;[^:]*)?:(\d{8}(T\d{6})?)/)?.[1]?.trim();
      const uid = icsText.match(/UID:(.*)/)?.[1]?.trim() || '(ingen UID)';
      if (!dtstart) return { invalid: true, href, uid };

      const startDateTime = new Date(dtstart.replace(/^(\d{8})$/, '$1T000000'));
      if (isNaN(startDateTime.getTime())) return null;
      return { href, dtstart, uid, timestamp: startDateTime.getTime() };
    });

    const resolved = await Promise.all(fetches);
    const result = [];
    const invalid = [];

    for (const item of resolved) {
      if (!item) continue;
      if (item.invalid) invalid.push(item);
      else result.push(item);
    }

    // Sortera resultatet på timestamp i stigande ordning
    result.sort((a, b) => a.timestamp - b.timestamp);
    return result;
  } catch (err) {
    // Suppress error logging as per instructions
  }
}
const xml2js = require('xml2js');
const { stripPrefix } = require('xml2js').processors;
require('dotenv').config();
const fetch = require('node-fetch');
const { performance } = require('perf_hooks');

const caldavUrl = process.env.CALDAV_CALENDAR_URL;
const username = process.env.CALDAV_USER;
const password = process.env.CALDAV_PASSWORD;

const caldavHost = new URL(caldavUrl).origin;

async function processCalendarItem(item) {
  try {
    let calendarData = item?.['D:propstat']?.['D:prop']?.['C:calendar-data'] || item?.['D:propstat']?.['D:prop']?.['calendar-data'];
    const href = item['D:href'] || item['href'] || '(okänd)';
    if (calendarData && typeof calendarData === 'object' && '_' in calendarData) {
      calendarData = calendarData._;
    }
    // Fallback: hämta via GET om calendar-data saknas eller är tomt
    if (!calendarData || !calendarData.includes('VEVENT')) {
      // Only try fallback if calendarData is missing or doesn't contain VEVENT
      if (!calendarData) {
        const fullUrl = `${caldavHost}${href}`;
        const icsRes = await fetch(fullUrl, {
          method: 'GET',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
          }
        });
        calendarData = await icsRes.text();
        if (!calendarData.includes('VEVENT')) return [];
      } else {
        return [];
      }
    }
    const matchArray = Array.from(calendarData.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g));
    if (!matchArray || matchArray.length === 0) {
      return [];
    }
    const vevents = matchArray.length > 0
      ? matchArray.map(m => m[0]).filter(text => /DTSTART/.test(text))
      : [];
    if (vevents.length === 0) {
      return [];
    }
    const result = [];
    for (const vevent of vevents) {
      const summaryMatch = vevent.match(/SUMMARY:(.*)/);
      const summary = summaryMatch ? summaryMatch[1].trim() : '–';
      const dtstartMatch = vevent.match(/DTSTART(?:;[^:]*)?:(\d{8}(T\d{6})?)/);
      const dtstart = dtstartMatch ? dtstartMatch[1].trim() : '–';
      const dtendMatch = vevent.match(/DTEND(?:;[^:]*)?:(\d{8}(T\d{6})?)/);
      const dtend = dtendMatch ? dtendMatch[1].trim() : '–';
      const locationMatch = vevent.match(/LOCATION:(.*)/);
      const location = locationMatch ? locationMatch[1].trim() : '–';
      const uidMatch = vevent.match(/UID:(.*)/);
      const uid = uidMatch ? uidMatch[1].trim() : '–';
      result.push({ summary, dtstart, dtend, location, uid });
    }
    return result;
  } catch (err) {
    return [];
  }
}

async function getEventsFromCalDAV(startDate, endDate) {
  const xmlBody = `
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data content-type="text/calendar"/>
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
      method: 'REPORT',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': '1'
      },
      body: xmlBody
    });

    const text = await res.text();

    const parsed = await xml2js.parseStringPromise(text, {
      explicitArray: false,
      tagNameProcessors: [xml2js.processors.stripPrefix]
    });
    if (!parsed || (!parsed['D:multistatus'] && !parsed['multistatus'])) {
      return [];
    }
    const responses = parsed['D:multistatus']?.['D:response'] || parsed['multistatus']?.['response'];

    if (!responses) {
      return [];
    }

    const items = Array.isArray(responses) ? responses : [responses];
    if (items.length === 0) {
      return [];
    }

    const parsedItems = await Promise.all(items.map(processCalendarItem));
    const result = parsedItems.flat().filter(Boolean);

    result.sort((a, b) => {
      const aTime = new Date(a.dtstart.replace(/^(\d{8})$/, '$1T000000')).getTime();
      const bTime = new Date(b.dtstart.replace(/^(\d{8})$/, '$1T000000')).getTime();
      return aTime - bTime;
    });
    return result;
  } catch (err) {
    return [];
  }
}

module.exports = { getEventsFromCalDAV };

async function testReport() {
  const now = new Date();
  const startDate = now.toISOString().substring(0, 10).replace(/-/g, '') + 'T000000Z';
  const endDate = new Date(now.getTime() + 3 * 86400000).toISOString().substring(0, 10).replace(/-/g, '') + 'T235959Z';

  const xmlBody = `
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
      method: 'REPORT',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': '1'
      },
      body: xmlBody
    });
    const text = await res.text();
    await xml2js.parseStringPromise(text, { explicitArray: false });
  } catch (err) {
    console.error(`❌ REPORT-fel: ${err.message}`);
  }
}

testReport();

async function getFirstIcsWithVevent() {
  const xmlBody = `
  <C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop>
      <D:getetag/>
      <C:calendar-data/>
    </D:prop>
    <C:filter>
      <C:comp-filter name="VCALENDAR">
        <C:comp-filter name="VEVENT"/>
      </C:comp-filter>
    </C:filter>
  </C:calendar-query>`.trim();

  try {
    const res = await fetch(caldavUrl, {
      method: 'REPORT',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': '1'
      },
      body: xmlBody
    });

    const text = await res.text();
    const parsed = await xml2js.parseStringPromise(text, { explicitArray: false });
    const responses = parsed['D:multistatus']?.['D:response'] || parsed['multistatus']?.['response'];
    const items = Array.isArray(responses) ? responses : [responses];

    for (const item of items) {
      const href = item['D:href'] || item['href'];
      const fullUrl = `${caldavHost}${href}`;
      const icsRes = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        }
      });
      const icsText = await icsRes.text();
      if (icsText.includes('VEVENT')) {
        return;
      }
    }
  } catch (err) {
  }
}

async function main() {
  const startTime = performance.now();
  const today = new Date().toISOString().substring(0, 10).replace(/-/g, '');
  const ninetyDays = new Date(Date.now() + 90 * 86400000).toISOString().substring(0, 10).replace(/-/g, '');
  try {
    const eventsInRange = await getEventsFromCalDAV(today + 'T000000Z', ninetyDays + 'T235959Z');
    if (Array.isArray(eventsInRange)) {
      console.log(`🔢 Totalt antal VEVENT: ${eventsInRange.length}`);
      for (const ev of eventsInRange) {
        const { summary, dtstart, location, uid } = ev;
        if (!summary || !dtstart) continue;
        console.log(`• ${summary} – ${dtstart} 📍 ${location} 🆔 ${uid}`);
      }
    }
  } catch (err) {
  }
  const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
  console.log(`⏱️ Total tid: ${totalTime}s`);
}

if (require.main === module) {
  main();
}