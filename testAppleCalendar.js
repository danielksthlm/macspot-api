const { DateTime } = require('luxon');
const dav = require('dav');
require('dotenv').config();
console.log("🔍 CALDAV_CALENDAR_URL:", process.env.CALDAV_CALENDAR_URL);

async function getLatestAppleEvent(dateTime) {
  const fullUrl = process.env.CALDAV_CALENDAR_URL?.trim();
  const url = 'https://caldav.icloud.com'; // Base server
  const username = process.env.CALDAV_USER;
  const password = process.env.CALDAV_PASSWORD;

  try {
    const xhr = new dav.transport.Basic(
      new dav.Credentials({ username, password })
    );

    const account = await dav.createAccount({
      server: url,
      xhr,
      loadObjects: true,
      loadCollections: true,
      accountType: 'caldav',
      rootUrl: fullUrl
    });

    const calendars = account.calendars || [];
    console.log(`📅 Hittade ${calendars.length} kalendrar`);

    // 1. Filtrera fram den kalender som matchar fullUrl.
    const target = calendars.find(cal => cal.url === fullUrl);
    if (!target) {
      console.warn("⚠️ Ingen kalender matchade CALDAV_CALENDAR_URL");
      return null;
    }

    console.log(`📓 Namn: ${target.displayName}`);
    console.log(`🧭 URL: ${target.url}\n`);

    // 2. Anropa dav.syncCalendar() på den.
    await dav.syncCalendar(target, { xhr });
    console.log("🔄 Synkronisering av kalender klar.");

    // Debug: Logga antal objekt och visa endast max 10 objekt
    console.log(`🧮 Antal objekt i kalendern: ${target.objects?.length || 0}`);
    const rawObjects = target.objects || [];
    console.log(`🔍 Visar max 10 av totalt ${rawObjects.length} objekt\n`);

    console.log("📤 Skriver ut rådata för de första 10 objekten:");
    rawObjects.slice(0, 10).forEach((obj, index) => {
      console.log("──────────────────────────────");
      console.log(typeof obj.data === 'string' ? obj.data : obj);
    });

    const now = new Date();

    const upcoming = [];

    for (const obj of rawObjects) {
      if (typeof obj.data !== 'string' && typeof obj.calendarData !== 'string') continue;
      const dataStr = typeof obj.data === 'string' ? obj.data : (typeof obj.calendarData === 'string' ? obj.calendarData : '');

      const summary = dataStr.match(/SUMMARY:(.+)/)?.[1]?.trim() || '(ingen titel)';
      const dtStartMatch = dataStr.match(/DTSTART(;TZID=[^:]+)?:([0-9T]+)/);
      const dtEndMatch = dataStr.match(/DTEND(;TZID=[^:]+)?:([0-9T]+)/);

      const dtStartRaw = dtStartMatch?.[2];
      const dtEndRaw = dtEndMatch?.[2];
      let eventTime = null;
      let dateInfo = '';

      if (dtStartRaw) {
        if (dtStartRaw.length === 8) {
          // Heldag
          eventTime = DateTime.fromFormat(dtStartRaw, 'yyyyMMdd').startOf('day').toJSDate();
          dateInfo = `📅 Heldag: ${dtStartRaw}`;
        } else if (dtStartRaw.endsWith('Z')) {
          eventTime = DateTime.fromISO(dtStartRaw).toJSDate();
          dateInfo = `🌍 UTC: ${dtStartRaw}`;
        } else {
          eventTime = DateTime.fromFormat(dtStartRaw, "yyyyMMdd'T'HHmmss").toJSDate();
          dateInfo = `🕒 Lokal: ${dtStartRaw}`;
        }
      }

      if (eventTime && eventTime >= new Date()) {
        upcoming.push({
          summary,
          dtStartRaw,
          dtEndRaw,
          dateInfo,
          eventTime
        });
      }
    }

    console.log("🗓️ Kommande händelser (max 10):");
    upcoming
      .sort((a, b) => a.eventTime - b.eventTime)
      .slice(0, 10)
      .forEach((event, index) => {
        console.log("──────────────────────────────");
        console.log(`📌 Titel: ${event.summary}`);
        console.log(`📍 Start: ${event.dtStartRaw}`);
        console.log(`📍 Slut: ${event.dtEndRaw}`);
        console.log(`📅 Datumformat: ${event.dateInfo}`);
        console.log(`📆 JS-tid: ${event.eventTime}`);
      });

    return null;
  } catch (err) {
    console.error('⚠️ Fel i getLatestAppleEvent:', err.message);
    return null;
  }
}

(async () => {
  const testDate = new Date();
  const result = await getLatestAppleEvent(testDate);
  console.log('📦 Resultat:', result);
})();