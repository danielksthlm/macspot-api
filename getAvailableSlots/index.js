import getDb from './db.js';
import { getBookingSettings, getWeeklyBookingMinutes } from './bookingService.js';
import { hasAppleCalendarConflict } from './appleCalendar.js';
import { getTravelTime } from './appleMaps.js';
import msGraph from './msGraph.js';
const { getAvailableRoomFromGraph } = msGraph;
import { getMicrosoftSchedule } from './ms365Calendar.js';
import { DateTime, Interval } from 'luxon';

async function hasMicrosoftCalendarConflict(start, end, email, settings) {
  const msEvents = await getMicrosoftSchedule(start, end, email, settings);
  return msEvents?.length > 0;
}

export async function handler(req, context) {
  let db;
  try {
    db = await getDb().connect();
    const settings = await getBookingSettings(db);
    const lengths = settings["default_meeting_lengths"] || {};

    const url = new URL(req.url);
    const meeting_type = url.searchParams.get("meeting_type");
    const date = url.searchParams.get("date");

    // 1. Efter att ha hämtat meeting_type och date
    context.log("📥 Parametrar:", { meeting_type, date });

    if (!meeting_type || !date) {
      return new Response(JSON.stringify({ success: false, message: "Mötestyp och datum krävs" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Efter att ha hämtat inställningar
    context.log("⚙️ Inställningar laddade:", settings);

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
      // 3. Vid start av varje range
      context.log("🕒 Bearbetar intervall:", { from: range.start.toISO(), to: range.end.toISO() });
      let bestSlot = null;

      for (let dt = range.start; dt < range.end; dt = dt.plus({ minutes: intervalMinutes })) {
        const start = dt.toISO();
        const end = dt.plus({ minutes: lengths[meeting_type]?.[0] || 30 }).toISO();

        // 4. Vid varje försök till slot
        context.log("🔍 Testar slot:", { start, end });

        const room = getAvailableRoomFromGraph(meeting_type, settings);
        if (meeting_type !== "atClient" && !room) {
          // 5. Om inget rum
          context.log("⛔️ Inget ledigt rum hittades – hoppar över slot.");
          continue;
        }

        const [appleConflict, msConflict] = await Promise.all([
          hasAppleCalendarConflict(start, end, settings.notification_email, settings),
          hasMicrosoftCalendarConflict(start, end, settings.notification_email, settings)
        ]);
        if (appleConflict || msConflict) {
          // 5. Om kalenderkrock
          context.log("❌ Krock i kalender – hoppar över slot.");
          continue;
        }

        const travelTime = meeting_type === 'atClient'
          ? await getTravelTime(settings.default_home_address, settings.default_office_address, start)
          : 0;
        if (travelTime > settings.fallback_travel_time_minutes) {
          // 5. Om restid för lång
          context.log("🚗 Restid för lång – hoppar över slot.");
          continue;
        }

        const withinTravelWindow = dt.hour >= DateTime.fromISO(settings.travel_time_window.start).hour &&
                                   dt.hour <= DateTime.fromISO(settings.travel_time_window.end).hour;
        if (!withinTravelWindow) {
          // 5. Om utanför tidsfönster
          context.log("🕳️ Utanför tillåtet restidsfönster – hoppar över slot.");
          continue;
        }

        const totalMinutes = await getWeeklyBookingMinutes(db, meeting_type, date);
        if (totalMinutes >= settings.max_weekly_booking_minutes) {
          // 5. Om veckokvot överskrids
          context.log("📉 Veckokvot överskriden – hoppar över slot.");
          continue;
        }

        const minLength = lengths[meeting_type]?.[0] || 0;
        const slotLength = DateTime.fromISO(end).diff(DateTime.fromISO(start), 'minutes').minutes;
        if (slotLength < minLength) {
          // 5. Om sloten är för kort
          context.log("⏱️ Sloten är för kort – hoppar över.");
          continue;
        }

        bestSlot = { start, end, room };
        // 6. När en slot godkänns
        context.log("✅ Slot funkar:", bestSlot);
        break;
      }

      if (bestSlot) slots.push(bestSlot);
    }

    // 7. När alla slots är färdiga
    context.log("📦 Samlade tillgängliga slots:", slots);

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
  } finally {
    if (db) db.release?.(); // Säkerställ att databasanslutningen släpps
  }
}