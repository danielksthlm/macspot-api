// File: routes/getAvailableSlots.js
// Removed app import as it's not needed for v4 isolated model.
import db from '../lib/utils/db.js';
import { getBookingSettings } from '../lib/bookingService.js';
import { hasAppleCalendarConflict } from '../lib/calendar/appleCalendar.js';
import { getTravelTime } from '../lib/maps/appleMaps.js';
import { getWeeklyBookingMinutes } from '../lib/bookingService.js';
import { getAvailableRoomFromGraph } from '../lib/calendar/roomBooking.js';
import { getMicrosoftSchedule } from '../lib/calendar/ms365Calendar.js';
import { DateTime, Interval } from 'luxon';

async function hasMicrosoftCalendarConflict(start, end, email, settings) {
  const msEvents = await getMicrosoftSchedule(start, end, email, settings);
  return msEvents?.length > 0;
}

export async function handler(req, context) {
    try {
      const settings = await getBookingSettings(db);
      console.log("🧪 Alla inställningar:", settings);
      console.log("🧪 Mötestidstyper:", settings["default_meeting_lengths"]);
      const lengths = settings["default_meeting_lengths"] || {};
      // Hämta och parsa queryparametrar
      const url = new URL(req.url);
      const meeting_type = url.searchParams.get("meeting_type");
      const date = url.searchParams.get("date"); // ISO-format: 2025-04-23

      console.log("📅 Förfrågan om tillgängliga tider", {
        meeting_type,
        date,
        inställdLängd: lengths[meeting_type]
      });

      if (!meeting_type || !date) {
        return new Response(JSON.stringify({
          success: false,
          message: "Mötestyp och datum krävs"
        }), {
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

      const startOfDay = DateTime.fromISO(date, { zone: settings.timezone }).startOf("day").plus({ hours: 8 });
      const endOfDay = DateTime.fromISO(date, { zone: settings.timezone }).startOf("day").plus({ hours: 17 });

      const intervalMinutes = 15;
      const slots = [];

      for (const range of ranges) {
        let bestSlot = null;

        for (let dt = range.start; dt < range.end; dt = dt.plus({ minutes: intervalMinutes })) {
          const start = dt.toISO();
          const end = dt.plus({ minutes: lengths[meeting_type]?.[0] || 30 }).toISO();

          const room = getAvailableRoomFromGraph(meeting_type, settings);
          if (meeting_type !== "atClient" && !room) {
            console.log("⛔ Inget mötesrum tillgängligt");
            continue;
          }

          const [appleConflict, msConflict] = await Promise.all([
            hasAppleCalendarConflict(start, end, settings.notification_email, settings),
            hasMicrosoftCalendarConflict(start, end, settings.notification_email, settings)
          ]);

          if (appleConflict || msConflict) {
            console.log("⛔ Krock i kalender (Apple/MS):", start, end);
            continue;
          }

          const travelTime = await getTravelTime(settings.default_home_address, settings.default_office_address, start);
          if (travelTime > settings.fallback_travel_time_minutes) {
            console.log("⛔ Restid för lång:", travelTime, "minuter");
            continue;
          }

          const withinTravelWindow = dt.hour >= DateTime.fromISO(settings.travel_time_window.start).hour &&
                                     dt.hour <= DateTime.fromISO(settings.travel_time_window.end).hour;
          if (!withinTravelWindow) {
            console.log("⛔ Utanför restidsfönster:", dt.toFormat("HH:mm"));
            continue;
          }

          const totalMinutes = await getWeeklyBookingMinutes(db, meeting_type, date);
          if (totalMinutes >= settings.max_weekly_booking_minutes) {
            console.log("⛔ Veckokvot överskriden:", totalMinutes, ">= max", settings.max_weekly_booking_minutes);
            continue;
          }

          const minLength = lengths[meeting_type]?.[0] || 0;
          const slotLength = DateTime.fromISO(end).diff(DateTime.fromISO(start), 'minutes').minutes;
          if (slotLength < minLength) {
            console.log("⛔ För kort tid:", slotLength, "<", minLength);
            continue;
          }

          bestSlot = { start, end, room };
          break; // första lediga slot räcker
        }

        if (bestSlot) slots.push(bestSlot);
      }

      return new Response(JSON.stringify({
        success: true,
        slots
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      context.error("❌ Slot lookup error", err);
      return new Response(JSON.stringify({
        success: false,
        message: "Internal server error"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }