require('dotenv').config();
const { resolveOriginAddress } = require('./shared/calendar/resolveOrigin');
const createAppleClient = require('./shared/calendar/appleCalendar');
const createMsGraphClient = require('./shared/calendar/msGraph');
const pool = require('./shared/db/pgPool');

(async () => {
  const context = { log: console.log };
  const appleClient = createAppleClient(context);
  const graphClient = createMsGraphClient();

  const result = await resolveOriginAddress({
    eventId: "2025-05-23T08:00:00.000Z", // Testdatum
    calendarId: "daniel@anynode.se",     // Ditt testkonto
    pool,
    context,
    graphClient,
    appleClient,
    fallbackOrigin: "Taxgatan 4, 115 45 Stockholm",
    settings: {
      travel_time_window_start: "06:00"
    },
    eventCache: new Map()
  });

  console.log("\n📤 RESULTAT:\n", result);
})();