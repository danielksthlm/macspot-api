console.log("🧪 slotEngine.js laddades");

const pool = require('../db/pgPool');

const { DateTime } = require("luxon");
const { resolveOriginAddress } = require("../calendar/resolveOrigin");
const { resolveTravelTime } = require("../maps/resolveTravelTime");
const msGraph = require("../calendar/msGraph");
const appleCalendar = require("../calendar/appleCalendar");

async function generateSlotCandidates({ day, settings, contact, pool, context, graphClient, appleClient, meeting_length, meeting_type, eventCache }) {
  const timezone = settings.timezone || "Europe/Stockholm";
  const hoursToTry = [8, 12]; // UTC → 10:00 och 14:00 svensk tid
  const slots = [];

  for (const hour of hoursToTry) {
    const eventId = `${day}T${hour.toString().padStart(2, "0")}:00:00.000Z`;
    const dateObj = new Date(eventId);
    const weekday = dateObj.toLocaleDateString("en-US", { weekday: "long", timeZone: timezone }).toLowerCase();
    const slot_part = hour < 12 ? "fm" : "em";
    const slotHourStr = `${hour.toString().padStart(2, '0')}:00`;
    if (slotHourStr >= settings.lunch_start && slotHourStr < settings.lunch_end) {
      context.log(`🍽️ Slot under lunch (${slotHourStr}) – hoppar ${eventId}`);
      continue;
    }
    const isWeekend = ["saturday", "sunday"].includes(weekday);
    if (settings.block_weekends && isWeekend) {
      context.log(`⛔ Helg blockerad (${weekday}) – hoppar ${eventId}`);
      continue;
    }
    if (meeting_type === 'atclient' && Array.isArray(settings.allowed_atclient_meeting_days)) {
      if (!settings.allowed_atclient_meeting_days.includes(weekday)) {
        context.log(`⛔ atclient tillåts ej på ${weekday} – hoppar ${eventId}`);
        continue;
      }
    }

    context.log(`📧 resolveOriginAddress använder settings.ms_sender_email (MS) och CALDAV_USER (Apple) – calendarId sätts till 'system' som placeholder`);
    const originInfo = await resolveOriginAddress({
      eventId,
      calendarId: 'system',
      pool,
      context,
      graphClient,
      appleClient,
      fallbackOrigin: settings.default_home_address,
      settings,
      eventCache
    });

    if (!originInfo?.origin) {
      context.log(`⚠️ Kunde inte fastställa origin för ${eventId}`);
      continue;
    }

    const destination = settings.default_office_address;
    const { travelTimeMin } = await resolveTravelTime({
      origin: originInfo.origin,
      destination,
      hour,
      db: pool,
      accessToken: context.accessToken || null,
      context
    });

    if (!travelTimeMin || typeof travelTimeMin !== "number") {
      context.log.warn(`⚠️ Ogiltig restid, hoppar slot: ${eventId}`);
      continue;
    }

    const endTime = new Date(dateObj.getTime() + meeting_length * 60000);
    const dayStart = new Date(dateObj);
    const dayEnd = new Date(dateObj);
    dayStart.setHours(parseInt(settings.open_time.split(':')[0], 10), parseInt(settings.open_time.split(':')[1], 10));
    dayEnd.setHours(parseInt(settings.close_time.split(':')[0], 10), parseInt(settings.close_time.split(':')[1], 10));

    if (endTime > dayEnd) {
      context.log(`⛔ Slot ${eventId} går utanför öppettid (${settings.close_time}) – hoppar`);
      continue;
    }

    // Skip slots that are too soon to reach based on travel time and current time
    const now = Date.now();
    if (dateObj.getTime() - now < travelTimeMin * 60 * 1000) {
      context.log(`⛔ Slot ${eventId} är för nära i tid – restid ${travelTimeMin} min, nu=${new Date(now).toISOString()} – hoppar`);
      continue;
    }

    // Build slot object
    const slot = {
      slot_iso: eventId,
      slot_local: DateTime.fromJSDate(dateObj).setZone(timezone).toISO(),
      travel_time_min: travelTimeMin,
      origin: originInfo.origin,
      originEndTime: originInfo.originEndTime,
      source: originInfo.originSource,
      require_approval: settings.require_approval,
      meeting_length,
      weekday,
      slot_part
    };

    // --- Score calculation logic ---
    // Använd context.bookingsByDay som källa till befintliga bokningar per dag
    const bookingsByDay = (typeof context.bookingsByDay === "object" && context.bookingsByDay) ? context.bookingsByDay : {};
    const slotDateIso = dateObj.toISOString().split("T")[0];
    const slotStart = dateObj.getTime();
    const slotEnd = slotStart + meeting_length * 60000;

    const existing = bookingsByDay[slotDateIso] || [];
    let gapBefore = null;
    let gapAfter = null;

    for (const b of existing) {
      const bStart = b.start;
      const bEnd = b.end;

      if (bEnd <= slotStart) {
        gapBefore = slotStart - bEnd;
      } else if (bStart >= slotEnd && gapAfter === null) {
        gapAfter = bStart - slotEnd;
      }
    }

    const bufferMs = (settings.buffer_between_meetings || 0) * 60000;
    const hasConflict = existing.some(b => {
      return (
        (b.end + bufferMs > slotStart && b.end <= slotStart) ||
        (b.start - bufferMs < slotEnd && b.start >= slotEnd)
      );
    });
    if (hasConflict) {
      context.log(`⛔ Slot ${eventId} krockar med möte inom buffer – hoppar`);
      continue;
    }

    // Standardpoäng är 10. Dra av poäng för stor lucka före eller efter.
    let fragmentationPenalty = 0;
    if ((gapBefore && gapBefore > 45 * 60000) || (gapAfter && gapAfter > 45 * 60000)) {
      fragmentationPenalty = 1;
    }

    slot.score = 10 - fragmentationPenalty;

    slots.push(slot);
  }

  return slots;
}


async function generateSlotChunks({
  days,
  context,
  contact,
  contact_id,
  meeting_type,
  meeting_length,
  bookingsByDay,
  weeklyMinutesByType,
  settings,
  graphClient,
  appleClient,
  travelCache,
  accessToken,
  timezone,
  debugHelper
}) {
  const { debugLog, skipReasons } = debugHelper || {};
  const slotGroupPicked = {};
  const slotMap = {};
  const chosen = [];

  if (days.length === 0) {
    const fallbackDate = new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      'SELECT slots FROM slot_cache WHERE slot_day = $1 LIMIT 1',
      [fallbackDate]
    );
    if (rows.length > 0) {
      context.log(`🟡 Använder slot_cache som fallback (${fallbackDate})`);
      return {
        chosenSlots: rows[0].slots || [],
        slotMapResult: {},
        slotLogSummary: { 'fallback_used': 1 }
      };
    }
  }

  const eventCache = new Map();

  const slotCandidatePromises = days.map(day => {
    const dayStr = day.toISOString().split("T")[0];
    return generateSlotCandidates({
      day: dayStr,
      settings,
      contact,
      pool: context.client || pool,
      context,
      graphClient,
      appleClient,
      meeting_length,
      meeting_type,
      eventCache
    });
  });

  const slotCandidatesPerDay = await Promise.all(slotCandidatePromises);

  days.forEach((day, index) => {
    const dayStr = day.toISOString().split("T")[0];
    const slotCandidates = slotCandidatesPerDay[index];
    for (const slot of slotCandidates) {
      const key = `${dayStr}_${slot.slot_part}`;
      if (!slotMap[key]) slotMap[key] = [];
      slotMap[key].push(slot);
    }
  });

  for (const [key, candidates] of Object.entries(slotMap)) {
    if (candidates.length === 0) continue;

    const alreadyPicked = slotGroupPicked[key];
    if (alreadyPicked) {
      debugLog?.(`🟡 Slotgrupp '${key}' redan vald tidigare – hoppar`);
      continue;
    }

    const preferredHours = [10, 14];
    const best = candidates.sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) {
        return (b.score || 0) - (a.score || 0);
      }
      const aHour = new Date(a.slot_iso).getUTCHours();
      const bHour = new Date(b.slot_iso).getUTCHours();
      const aPriority = preferredHours.includes(aHour) ? 0 : 1;
      const bPriority = preferredHours.includes(bHour) ? 0 : 1;
      return aPriority - bPriority;
    })[0] || candidates[0];

    const weekKeyStr = key.split('_')[0];
    const usedMinutes = (weeklyMinutesByType[meeting_type]?.[weekKeyStr] || 0);
    if (usedMinutes + best.meeting_length > settings.max_weekly_booking_minutes) {
      debugLog?.(`⛔ Överskrider veckokvot (${usedMinutes + best.meeting_length} > ${settings.max_weekly_booking_minutes}) – hoppar ${key}`);
      continue;
    }

    slotGroupPicked[key] = true;
    chosen.push(best);
  }

  const durationMs = Date.now() - context.startTime;
  context.log(`⏱️ Slotgenerering klar på ${durationMs} ms`);
  return {
    chosenSlots: chosen.sort((a, b) => new Date(a.slot_iso) - new Date(b.slot_iso)),
    slotMapResult: slotMap,
    slotLogSummary: skipReasons
  };
}

module.exports = {
  generateSlotCandidates,
  generateSlotChunks
};