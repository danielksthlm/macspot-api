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
    const appleClient = require('../shared/calendar/appleCalendar')();
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 dagar
    const events = await appleClient.fetchEventsByDateRange(now.toISOString(), end.toISOString());

    context.res = {
      status: 200,
      body: {
        status: "✅ Success via shared module",
        count: events.length,
        events
      }
    };
  }

  return { getEvent, fetchEventsByDateRange };
}

const client = createAppleClient({ log: console.log });

if (process.env.NODE_ENV === 'test') {
  console.log("🧪 TEST appleClient:", typeof client.getEvent === 'function' ? '✅ getEvent finns' : '❌ getEvent saknas');
  console.log("🧪 TEST appleClient:", typeof client.fetchEventsByDateRange === 'function' ? '✅ fetchEventsByDateRange finns' : '❌ fetchEventsByDateRange saknas');
}

module.exports = () => client;