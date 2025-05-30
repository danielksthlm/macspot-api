const pool = require('../db/pgPool');
const { DateTime } = require("luxon");
const Holidays = require('date-holidays');
const { resolveOriginAddress } = require("../calendar/resolveOrigin");
const { resolveTravelTime } = require("../maps/resolveTravelTime");
const msGraph = require("../calendar/msGraph");
const appleCalendar = require("../calendar/appleCalendar");
const hd = new Holidays('SE'); // Svenska helgdagar
const isDebug = process.env.DEBUG === 'true';

async function generateSlotCandidates({ day, settings, contact, pool, context, graphClient, appleClient, meeting_length, meeting_type, eventCache }) {
  const timezone = settings.timezone || "Europe/Stockholm";
  const holidays = settings.block_holidays ? new Holidays('SE') : null;
  // Generera tidsintervall var 20:e minut i svensk tid mellan öppettid och stängningstid, exkl. lunch
  const open = DateTime.fromISO(`${day}T${settings.open_time}`, { zone: timezone });
  const close = DateTime.fromISO(`${day}T${settings.close_time}`, { zone: timezone });
  const lunchStart = DateTime.fromISO(`${day}T${settings.lunch_start}`, { zone: timezone });
  const lunchEnd = DateTime.fromISO(`${day}T${settings.lunch_end}`, { zone: timezone });

  const startTimes = [];
  let current = open;
  // Använd context.bookingsByDay som källa till befintliga bokningar per dag
  const bookingsByDay = (typeof context.bookingsByDay === "object" && context.bookingsByDay) ? context.bookingsByDay : {};
  // Vi behöver slotDateIso för denna dag
  // day är en ISO-sträng för dagen, t.ex. "2024-06-08"
  const slotDateIso = day;
  const existing = bookingsByDay[slotDateIso] || [];
  while (current < close) {
    const end = current.plus({ minutes: meeting_length });
    const overlapsLunch = current < lunchEnd && end > lunchStart;
    if (!overlapsLunch) {
      const isHoliday = settings.block_holidays && holidays?.isHoliday(new Date(current.toISO()));
      if (isHoliday) {
        // if (isDebug) context.log(`⛔ Helgdag – hoppar ${current.toISODate()}`);
        current = current.plus({ minutes: 20 });
        continue;
      }
      // --- NY KOD: Kontrollera om sloten krockar med event i bookingsByDay (inkl. heldagsevent) ---
      const slotStartMs = current.toMillis();
      const slotEndMs = end.toMillis();
      const bufferMsEarly = (settings.buffer_between_meetings || 0) * 60000;
      const slotConflictsWithEvent = existing.some(ev => {
        return (
          ev.start < slotEndMs + bufferMsEarly &&
          ev.end > slotStartMs - bufferMsEarly
        );
      });
      if (slotConflictsWithEvent) {
        // if (isDebug) context.log(`⛔ Slot krockar med event i bookingsByDay – hoppar ${current.toISO()}`);
        current = current.plus({ minutes: 20 });
        continue;
      }
      // --- SLUT NY KOD ---
      startTimes.push(current.toUTC());
    }
    current = current.plus({ minutes: 20 });
  }
  const slots = [];
  // Beräkna dagens start och slut
  const fullDayStart = DateTime.fromISO(`${slotDateIso}T${settings.open_time}`, { zone: timezone }).toMillis();
  const fullDayEnd = DateTime.fromISO(`${slotDateIso}T${settings.close_time}`, { zone: timezone }).toMillis();
  const dayEnd = DateTime.fromISO(`${slotDateIso}T${settings.close_time}`, { zone: timezone }).toJSDate();
  const fullDayBlock = existing.some(ev => {
    const evStart = Number(ev.start);
    const evEnd = Number(ev.end);
    return evStart <= fullDayStart && evEnd >= fullDayEnd;
  });
  if (fullDayBlock) {
    // context.log(`⛔ Hela dagen blockeras av ett heldagsevent – hoppar ${slotDateIso}`);
    return [];
  }

  for (const utcStart of startTimes) {
    const eventId = utcStart.toISO();
    const dateObj = utcStart.toJSDate();
    const weekday = dateObj.toLocaleDateString("en-US", { weekday: "long", timeZone: timezone }).toLowerCase();
    const slot_part = utcStart.hour < 12 ? "fm" : "em";
    const slotHourStr = utcStart.setZone(timezone).toFormat('HH:mm');
    if (slotHourStr >= settings.lunch_start && slotHourStr < settings.lunch_end) {
      // if (isDebug) context.log(`🍽️ Slot under lunch (${slotHourStr}) – hoppar ${eventId}`);
      continue;
    }
    const isWeekend = ["saturday", "sunday"].includes(weekday);
    if (settings.block_weekends && isWeekend) {
      // if (isDebug) context.log(`⛔ Helg blockerad (${weekday}) – hoppar ${eventId}`);
      continue;
    }
    if (meeting_type === 'atclient' && Array.isArray(settings.allowed_atclient_meeting_days)) {
      if (!settings.allowed_atclient_meeting_days.includes(weekday)) {
        // if (isDebug) context.log(`⛔ atclient tillåts ej på ${weekday} – hoppar ${eventId}`);
        continue;
      }
    }

    // Konvertera dateObj till rätt tidszon för helgdagskontroll
    const localDate = DateTime.fromJSDate(dateObj).setZone(timezone).toJSDate();
    const isHoliday = hd.isHoliday(localDate);
    if (settings.block_holidays && isHoliday) {
      if (isDebug) context.log(`🎌 Helgdag ${isHoliday[0]?.name} – hoppar ${eventId}`);
      continue;
    }


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
      // context.log(`⚠️ Kunde inte fastställa origin för ${eventId}`);
      continue;
    }

    const destination = settings.default_office_address;
    const travelTimeResult = await resolveTravelTime({
      origin: originInfo.origin,
      destination,
      hour: utcStart.hour,
      db: pool,
      accessToken: context.accessToken || null,
      context
    });
    const travelTimeMin = travelTimeResult?.travelTimeMin;
    const travelSource = travelTimeResult?.source || 'fallback';

    if (!travelTimeMin || typeof travelTimeMin !== "number") {
      // context.log.warn(`⚠️ Ogiltig restid, hoppar slot: ${eventId}`);
      continue;
    }

    const endTime = new Date(dateObj.getTime() + meeting_length * 60000);
    // dayStart och dayEnd redan definierade ovan
    if (endTime > dayEnd) {
      // context.log(`⛔ Slot ${eventId} går utanför öppettid (${settings.close_time}) – hoppar`);
      continue;
    }

    // Skip slots that are too soon to reach based on travel time and current time
    const now = Date.now();
    if (dateObj.getTime() - now < travelTimeMin * 60 * 1000) {
      // context.log(`⛔ Slot ${eventId} är för nära i tid – restid ${travelTimeMin} min, nu=${new Date(now).toISOString()} – hoppar`);
      continue;
    }

    // Build slot object
    const slot = {
      slot_iso: eventId,
      slot_local: DateTime.fromJSDate(dateObj).setZone(timezone).toISO(),
      travel_time_min: travelTimeMin,
      origin: originInfo.origin,
      originEndTime: originInfo.originEndTime,
      source: travelSource,
      require_approval: settings.require_approval,
      meeting_length,
      weekday,
      slot_part
    };


    // --- Score calculation logic ---
    const slotStart = dateObj.getTime();
    const slotEnd = slotStart + meeting_length * 60000;
    // existing redan definierad ovan
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
        b.start < slotEnd + bufferMs &&
        b.end > slotStart - bufferMs
      );
    });
    if (hasConflict) {
      // context.log(`⛔ Slot ${eventId} krockar med möte inom buffer (${settings.buffer_between_meetings || 0} min) – hoppar`);
      // existing.forEach(b => {
      //   const bStartStr = new Date(b.start).toISOString();
      //   const bEndStr = new Date(b.end).toISOString();
      //   if (
      //     b.start < slotEnd + bufferMs &&
      //     b.end > slotStart - bufferMs
      //   ) {
      //     context.log(`   ⚠️  Konflikt med: ${bStartStr} → ${bEndStr}`);
      //   }
      // });
      continue;
    }
    // Blockera även om sloten börjar exakt när ett event börjar, eller slutar exakt när ett event slutar
    const hardMatchConflict = existing.some(b => {
      return (
        b.start === slotStart || b.end === slotEnd
      );
    });
    if (hardMatchConflict) {
      // context.log(`⛔ Slot ${eventId} börjar eller slutar exakt när ett event börjar/slutar – hoppar`);
      continue;
    }


    // Standardpoäng är 10. Dra av poäng för stor lucka före eller efter.
    let fragmentationPenalty = 0;
    if ((gapBefore && gapBefore > 45 * 60000) || (gapAfter && gapAfter > 45 * 60000)) {
      fragmentationPenalty = 1;
    }

    slot.score = 10 - fragmentationPenalty;

    slots.push(slot);
    // if (isDebug && travelSource === 'fallback') {
    //   context.log(`⚠️ Slot ${eventId} använder fallback för restid (ingen accessToken)`);
    // }
  }

  // Separera förmiddag och eftermiddag
  const fmSlots = slots.filter(slot => slot.slot_part === 'fm');
  const emSlots = slots.filter(slot => slot.slot_part === 'em');

  // Sorteringsfunktion: högst poäng först, därefter kortast restid, därefter tidigast tid
  const sortSlots = (a, b) =>
    b.score - a.score ||
    a.travel_time_min - b.travel_time_min ||
    new Date(a.slot_iso) - new Date(b.slot_iso);

  // Sortera båda grupper
  fmSlots.sort(sortSlots);
  emSlots.sort(sortSlots);

  // Välj bästa fm och em (om de finns)
  const bestFm = fmSlots[0];
  const bestEm = emSlots.find(em => !bestFm || em.slot_iso !== bestFm.slot_iso);

  // Returnera endast de två bästa
  const topSlots = [bestFm, bestEm].filter(Boolean);
  const allSlots = [...fmSlots, ...emSlots];
  allSlots.forEach(s => {
    const icon = s.slot_part === 'fm' ? '☀️' : '🌙';
    context.log(`${icon} ${s.slot_part.toUpperCase()}: ${s.slot_iso} – score: ${s.score}`);
  });
  return topSlots;
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
  const chosen = [];

  if (days.length === 0) {
    const fallbackDate = new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      'SELECT slots FROM slot_cache WHERE slot_day = $1 LIMIT 1',
      [fallbackDate]
    );
    if (rows.length > 0) {
      context.log(`✅ Använder slot_cache som fallback (${fallbackDate})`);
      return {
        chosenSlots: rows[0].slots || [],
        slotMapResult: {},
        slotLogSummary: { 'fallback_used': 1 }
      };
    }
  }

  let startIso, endIso;
  try {
    startIso = days[0] instanceof Date ? days[0].toISOString() : new Date(days[0]).toISOString();
    endIso = new Date((days[days.length - 1] instanceof Date ? days[days.length - 1] : new Date(days[days.length - 1])).getTime() + 86400000).toISOString();
  } catch (err) {
    context.log("⛔ Fel vid toISOString på days[] – ersätter med dagens datum");
    const today = new Date();
    startIso = today.toISOString();
    endIso = new Date(today.getTime() + 7 * 86400000).toISOString(); // +7 dagar fallback
  }

  // === LÄGG TILL EXTERNA BOKNINGAR (MS + Apple) I bookingsByDay ===

  // Microsoft Graph
  try {
    const msEvents = await graphClient.listUpcomingEvents?.(days.length + 1) || [];
    let msAddedCount = 0;
    for (const ev of msEvents) {
      const start = new Date(ev.start).getTime();
      const end = new Date(ev.end).getTime();
      if (isNaN(start) || isNaN(end)) continue;
      const date = new Date(ev.start).toISOString().split("T")[0];
      if (!bookingsByDay[date]) bookingsByDay[date] = [];
      bookingsByDay[date].push({ start, end });
      msAddedCount++;
    }
    if (isDebug) {
      context.log(`📆 MS Graph: ${msEvents.length} händelser analyserades, ${msAddedCount} lades till bookingsByDay`);
    }
  } catch (err) {
    context.log(`⚠️ Kunde inte ladda MS-bokningar: ${err.message}`);
  }

  // Apple Calendar
  try {
    const startDate = days[0] instanceof Date ? days[0] : new Date(days[0]);
    const endDate = days[days.length - 1] instanceof Date
      ? new Date(days[days.length - 1].getTime() + 86400000)
      : new Date(new Date(days[days.length - 1]).getTime() + 86400000);
    if (isNaN(startDate) || isNaN(endDate)) {
      context.log("⛔ Ogiltiga datum skickas till Apple i slotEngine:", { startDate, endDate });
    }
    const appleEvents = await appleClient.fetchEventsByDateRange?.(startDate, endDate) || [];
    let appleAddedCount = 0;
    for (const ev of appleEvents) {
      try {
        // Ensure start and end are cast to numbers explicitly
        const start = Number(new Date(ev.dtstart));
        const end = Number(new Date(ev.dtend));
        if (isNaN(start) || isNaN(end)) continue;
        const date = new Date(ev.dtstart).toISOString().split("T")[0];
        if (!bookingsByDay[date]) bookingsByDay[date] = [];
        bookingsByDay[date].push({ start, end });
        appleAddedCount++;
      } catch (err) {
        context.log(`⚠️ Apple event parsing error: ${err.message}`);
      }
    }
    if (isDebug) {
      context.log(`🍏 Apple Calendar: ${appleEvents.length} händelser analyserades`);
    }
  } catch (err) {
    context.log(`⚠️ Kunde inte ladda Apple-bokningar: ${err.message}`);
  }

  context.bookingsByDay = bookingsByDay;

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
      eventCache: context.eventCache instanceof Map ? context.eventCache : new Map()
    });
  });

  const slotCandidatesPerDay = await Promise.all(slotCandidatePromises);

  const slotMap = {};
  days.forEach((day, index) => {
    const dayStr = day.toISOString().split("T")[0];
    const slotCandidates = slotCandidatesPerDay[index];
    for (const slot of slotCandidates) {
      const key = `${dayStr}_${slot.slot_part}`;
      if (!slotMap[key]) slotMap[key] = [];
      slotMap[key].push(slot);
    }
  });

  const bestPerGroup = {};
  for (const [key, slots] of Object.entries(slotMap)) {
    if (slots.length === 0) continue;
    const [datePart, part] = key.split('_');
    if (!bestPerGroup[datePart]) bestPerGroup[datePart] = {};
    if (!bestPerGroup[datePart][part]) {
      bestPerGroup[datePart][part] = slots
        .sort((a, b) => {
          if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
          return new Date(a.slot_iso) - new Date(b.slot_iso);
        })[0];
    }
  }

  for (const day in bestPerGroup) {
    for (const part in bestPerGroup[day]) {
      const slot = bestPerGroup[day][part];
      const weekKeyStr = day;
      const usedMinutes = (weeklyMinutesByType[meeting_type]?.[weekKeyStr] || 0);
      if (usedMinutes + slot.meeting_length <= settings.max_weekly_booking_minutes) {
        chosen.push(slot);
      } else {
        debugLog?.(`⛔ Överskrider veckokvot (${usedMinutes + slot.meeting_length} > ${settings.max_weekly_booking_minutes}) – hoppar ${day}_${part}`);
      }
    }
  }

  if (isDebug) {
    for (const day in bestPerGroup) {
      for (const part in bestPerGroup[day]) {
        const slot = bestPerGroup[day][part];
        context.log(`📆 Slot: ${slot.slot_iso} score=${slot.score}`);
      }
    }
  }

  const durationMs = Date.now() - context.startTime;
  context.log(`⏱️ Slotgenerering klar på ${durationMs} ms`);
  context.log(`📤 Response skickas med antal slots: ${chosen.length}`);
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