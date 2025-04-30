import { getDb } from '../../src/lib/db/db.js';
import { getBookingSettings, getWeeklyBookingMinutes } from '../../src/lib/bookingService.js';
import { hasAppleCalendarConflict } from '../../src/lib/calendar/appleCalendar.js';
import { getTravelTime } from '../../src/lib/maps/appleMaps.js';
import msGraph from '../../src/lib/calendar/msGraph.js';
const { getAvailableRoomFromGraph } = msGraph;
import { getMicrosoftSchedule } from '../../src/lib/calendar/ms365Calendar.js';
import { DateTime, Interval } from 'luxon';

async function hasMicrosoftCalendarConflict(start, end, email, settings) {
  const msEvents = await getMicrosoftSchedule(start, end, email, settings);
  return msEvents?.length > 0;
}

export async function handler(req, context) {
  try {
    const db = getDb();
    const settings = await getBookingSettings(db);
    const lengths = settings["default_meeting_lengths"] || {};

    const url = new URL(req.url);
    const meeting_type = url.searchParams.get("meeting_type");
    const date = url.searchParams.get("date");

    if (!meeting_type || !date) {
      return new Response(JSON.stringify({ success: false, message: "Mötestyp och datum krävs" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const lunchStart = DateTime.fromISO(date + "T" + settings.lunch_start, { zone: settings.timezone });
    const lunchEnd = DateTime.fromISO(date + "T" + settings.lunch_end, { zone: settings.timezone });
    const openTime = DateTime.fromISO(date + "T" + settings.open_time, { zone: settings.timezone });
    const closeTime = DateTime.fromISO(date + "T" + settings.close_time, { zone: settings.timezone });

    const morningRange = Interval.fromDateTimes(openTime, lunchStart);
    const afternoonRange = Interval.fromDateTimes(lunchEnd, closeTime);
    const ranges = [morningRange, afternoonRange];

    const intervalMinutes = 15;
    const slots = [];

    for (const range of ranges) {
      let bestSlot = null;

      for (let dt = range.start; dt < range.end; dt = dt.plus({ minutes: intervalMinutes })) {
        const start = dt.toISO();
        const end = dt.plus({ minutes: lengths[meeting_type]?.[0] || 30 }).toISO();

        const room = getAvailableRoomFromGraph(meeting_type, settings);
        if (meeting_type !== "atClient" && !room) continue;

        const [appleConflict, msConflict] = await Promise.all([
          hasAppleCalendarConflict(start, end, settings.notification_email, settings),
          hasMicrosoftCalendarConflict(start, end, settings.notification_email, settings)
        ]);
        if (appleConflict || msConflict) continue;

        const travelTime = await getTravelTime(settings.default_home_address, settings.default_office_address, start);
        if (travelTime > settings.fallback_travel_time_minutes) continue;

        const withinTravelWindow = dt.hour >= DateTime.fromISO(settings.travel_time_window.start).hour &&
                                   dt.hour <= DateTime.fromISO(settings.travel_time_window.end).hour;
        if (!withinTravelWindow) continue;

        const totalMinutes = await getWeeklyBookingMinutes(getDb(), meeting_type, date);
        if (totalMinutes >= settings.max_weekly_booking_minutes) continue;

        const minLength = lengths[meeting_type]?.[0] || 0;
        const slotLength = DateTime.fromISO(end).diff(DateTime.fromISO(start), 'minutes').minutes;
        if (slotLength < minLength) continue;

        bestSlot = { start, end, room };
        break;
      }

      if (bestSlot) slots.push(bestSlot);
    }

    return new Response(JSON.stringify({ success: true, slots }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    context.error("❌ Slot lookup error", err);
    return new Response(JSON.stringify({ success: false, message: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}