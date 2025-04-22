// File: lib/calendar/appleCalendar.js
import { getCalDAVEvents } from './caldav.js';
import { getTravelTime } from '../maps/appleMaps.js';

/**
 * Kontroll: Krockar bokningen med CalDAV-händelser eller restider till/från dem?
 */
async function hasAppleCalendarConflict(startTime, endTime, email, settings = {}) {
  const caldavUrl = settings.caldav_url || "https://example.com/caldav"; // TODO: dynamisk
  const fallbackMinutes = settings.fallback_travel_time_minutes || 90;
  const homeAddress = settings.default_home_address || "Taxgatan 4, Stockholm";

  const events = await getCalDAVEvents(caldavUrl, startTime, endTime);

  const newStart = new Date(startTime);
  const newEnd = new Date(endTime);

  for (const event of events) {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    const eventLocation = event.location || homeAddress;

    const travelBefore = await getTravelTime(eventLocation, homeAddress, eventEnd);
    const travelAfter = await getTravelTime(homeAddress, eventLocation, eventStart);

    const tooCloseBefore = (newStart - eventEnd) / 60000 < travelBefore;
    const tooCloseAfter = (eventStart - newEnd) / 60000 < travelAfter;

    const overlaps = newStart < eventEnd && newEnd > eventStart;

    if (overlaps || tooCloseBefore || tooCloseAfter) {
      console.warn("❌ Krock med CalDAV-händelse:", event);
      return true;
    }
  }

  return false;
}

export { hasAppleCalendarConflict };
