console.log("🧪 slotEngine.js laddades");

const pool = require('../db/pgPool');

const { DateTime } = require("luxon");
const { resolveOriginAddress } = require("../calendar/resolveOrigin");
const { resolveTravelTime } = require("../maps/resolveTravelTime");
const msGraph = require("../calendar/msGraph");
const appleCalendar = require("../calendar/appleCalendar");

async function generateSlotCandidates({ day, settings, contact, pool, context, graphClient, appleClient, meeting_length }) {
  const timezone = settings.timezone || "Europe/Stockholm";
  const hoursToTry = [10, 14];
  const slots = [];

  for (const hour of hoursToTry) {
    const eventId = `${day}T${hour.toString().padStart(2, "0")}:00:00.000Z`;
    const dateObj = new Date(eventId);
    const weekday = dateObj.toLocaleDateString("en-US", { weekday: "long", timeZone: timezone }).toLowerCase();
    const slot_part = hour < 12 ? "fm" : "em";
    const isWeekend = ["saturday", "sunday"].includes(weekday);
    if (settings.block_weekends && isWeekend) {
      context.log(`⛔ Helg blockerad (${weekday}) – hoppar ${eventId}`);
      continue;
    }

    context.log(`📧 calendarId som används: ${contact.email || contact.booking_email}`);
    const originInfo = await resolveOriginAddress({
      eventId,
      calendarId: contact.email || contact.booking_email,
      pool,
      context,
      graphClient,
      appleClient,
      fallbackOrigin: settings.default_home_address,
      settings
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

    slots.push({
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
    });
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

  for (const day of days) {
    const dayStr = day.toISOString().split("T")[0];
    const slotCandidates = await generateSlotCandidates({
      day: dayStr,
      settings,
      contact,
      pool: context.client || pool,
      context,
      graphClient,
      appleClient,
      meeting_length
    });

    for (const slot of slotCandidates) {
      const key = `${dayStr}_${slot.slot_part}`;
      if (!slotMap[key]) slotMap[key] = [];
      slotMap[key].push(slot);
    }
  }

  for (const [key, candidates] of Object.entries(slotMap)) {
    if (candidates.length === 0) continue;

    const alreadyPicked = slotGroupPicked[key];
    if (alreadyPicked) {
      debugLog?.(`🟡 Slotgrupp '${key}' redan vald tidigare – hoppar`);
      continue;
    }

    const best = candidates.sort((a, b) => (b.score || 0) - (a.score || 0))[0] || candidates[0];
    slotGroupPicked[key] = true;
    chosen.push(best);
  }

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