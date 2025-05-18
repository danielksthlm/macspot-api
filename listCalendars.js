const dav = require("dav");

async function listCalendars() {
  const url = process.env.CALDAV_CALENDAR_URL;
  const username = process.env.CALDAV_USER;
  const password = process.env.CALDAV_PASSWORD;

  const xhr = new dav.transport.Basic(
    new dav.Credentials({
      username,
      password
    })
  );

  try {
    const account = await dav.createAccount({
      server: url,
      xhr,
      loadCollections: true,
      loadObjects: false
    });

    if (!account.calendars || account.calendars.length === 0) {
      console.log("⚠️ Inga kalendrar hittades.");
      return;
    }

    account.calendars.forEach((cal) => {
      console.log(`🗂️ Kalender: ${cal.displayName || "(namnlös)"} → ${cal.url}`);
    });
  } catch (err) {
    console.error("❌ Fel vid hämtning av kalendrar:", err.message);
  }
}

listCalendars();