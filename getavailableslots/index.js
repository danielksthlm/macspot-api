import { v4 as uuidv4 } from 'uuid';

function generateMeetingLink(type, email) {
  if (type === "Zoom") return `https://zoom.us/j/${uuidv4()}`;
  if (type === "Teams") return `https://teams.microsoft.com/l/meetup-join/${uuidv4()}`;
  if (type === "FaceTime") return `facetime://${email}`;
  return null;
}
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

    // 1. Efter att ha hämtat meeting_type
    context.log("📥 Parametrar:", { meeting_type });

    if (!meeting_type) {
      return new Response(JSON.stringify({ success: false, message: "Mötestyp krävs" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Efter att ha hämtat inställningar
    context.log("⚙️ Inställningar laddade:", settings);

    const slotsByDate = {};
    const today = DateTime.now().setZone(settings.timezone).startOf('day');
    const intervalMinutes = 15;

    for (let offset = 0; offset <= settings.max_days_in_advance; offset++) {
      const date = today.plus({ days: offset });
      const dateStr = date.toISODate();
      context.log(`📅 Bearbetar datum: ${dateStr}`);

      if (settings.block_weekends && [6, 7].includes(date.weekday)) {
        context.log("🛑 Helg – datumet blockerat:", dateStr);
        continue;
      }
      const lunchStart = DateTime.fromISO(dateStr + "T" + settings.lunch_start, { zone: settings.timezone });
      const lunchEnd = DateTime.fromISO(dateStr + "T" + settings.lunch_end, { zone: settings.timezone });
      const openTime = DateTime.fromISO(dateStr + "T" + settings.open_time, { zone: settings.timezone });
      const closeTime = DateTime.fromISO(dateStr + "T" + settings.close_time, { zone: settings.timezone });

      const morningRange = Interval.fromDateTimes(openTime, lunchStart);
      const afternoonRange = Interval.fromDateTimes(lunchEnd, closeTime);
      const ranges = [morningRange, afternoonRange];

      const slots = [];

      for (const range of ranges) {
        context.log("🕒 Bearbetar intervall:", { from: range.start.toISO(), to: range.end.toISO() });
        let bestSlot = null;

        for (let dt = range.start; dt < range.end; dt = dt.plus({ minutes: intervalMinutes })) {
          const start = dt.toISO();
          const end = dt.plus({ minutes: lengths[meeting_type]?.[0] || 30 }).toISO();

          context.log("🔍 Testar slot:", { start, end });

          const room = await getAvailableRoomFromGraph(settings, start, end);
          if (meeting_type !== "atClient" && !room) {
            context.log("⛔️ Inget ledigt rum hittades – hoppar över slot.");
            continue;
          }

          const [appleConflict, msConflict] = await Promise.all([
            hasAppleCalendarConflict(start, end, settings.notification_email, settings),
            hasMicrosoftCalendarConflict(start, end, settings.notification_email, settings)
          ]);
          if (appleConflict || msConflict) {
            context.log("❌ Krock i kalender – hoppar över slot.");
            continue;
          }

          const travelTime = meeting_type === 'atClient'
            ? await getTravelTime(settings.default_home_address, settings.default_office_address, start)
            : 0;
          if (travelTime > settings.fallback_travel_time_minutes) {
            context.log("🚗 Restid för lång – hoppar över slot.");
            continue;
          }

          const withinTravelWindow = dt.hour >= DateTime.fromISO(settings.travel_time_window.start).hour &&
                                     dt.hour <= DateTime.fromISO(settings.travel_time_window.end).hour;
          if (!withinTravelWindow) {
            context.log("🕳️ Utanför tillåtet restidsfönster – hoppar över slot.");
            continue;
          }

          const totalMinutes = await getWeeklyBookingMinutes(db, meeting_type, dateStr);
          if (totalMinutes >= settings.max_weekly_booking_minutes) {
            context.log("📉 Veckokvot överskriden – hoppar över slot.");
            continue;
          }

          const minLength = lengths[meeting_type]?.[0] || 0;
          const slotLength = DateTime.fromISO(end).diff(DateTime.fromISO(start), 'minutes').minutes;
          if (slotLength < minLength) {
            context.log("⏱️ Sloten är för kort – hoppar över.");
            continue;
          }

          bestSlot = { start, end, room, meetingLink: generateMeetingLink(meeting_type, settings.notification_email) };
          context.log("✅ Slot funkar:", bestSlot);
          break;
        }

        if (bestSlot) slots.push(bestSlot);
      }

      if (slots.length > 0) {
        slotsByDate[dateStr] = slots;
      }
    }

    context.log("📦 Samlade tillgängliga slots:", slotsByDate);

    return new Response(JSON.stringify({ success: true, slots: slotsByDate }), {
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