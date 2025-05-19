

const { DateTime } = require('luxon');
const pool = require('../shared/db/pgPool');
const { resolveOriginAddress } = require('../shared/calendar/resolveOrigin');
const settingsLoader = require('../shared/config/settingsLoader');

module.exports = async function (context, myTimer) {
  const today = new Date();
  const settings = await settingsLoader(pool, context);
  const maxDays = settings.max_days_in_advance || 14;
  const days = Array.from({ length: maxDays }, (_, i) => {
    const date = new Date();
    date.setDate(today.getDate() + i);
    return date;
  });

  context.log(`🔁 Kör refreshCalendarOrigins för ${days.length} dagar`);

  for (const date of days) {
    const slotTime = DateTime.fromJSDate(date).set({ hour: 10, minute: 0 }).toJSDate();
    const travelStart = new Date(slotTime.getTime() - (settings.fallback_travel_time_minutes || 20) * 60000);

    await resolveOriginAddress({
      eventId: slotTime.toISOString(),
      calendarId: 'system-refresh',
      pool,
      context,
      fallbackOrigin: settings.default_home_address,
      settings
    });
  }

  context.log('✅ refreshCalendarOrigins färdig');
};