// File: lib/calendar/appleCalendar.js
import { getCalDAVEvents } from './caldav.js';
import { getTravelTime } from '../maps/appleMaps.js';
import { logEvent, logError, logWarning } from '../log/eventLogger.js';
import { getSetting } from '../utils/translation.js';

async function hasAppleCalendarConflict(startTime, endTime, email, settings = {}) {
  const caldavUrl = getSetting('caldav_url');
  const homeAddress = getSetting('default_home_address');
  const fallbackMinutes = parseInt(getSetting('fallback_travel_time_minutes') || '90', 10);

  let events = [];
  try {
    if (settings.mockEvents) {
      events = settings.mockEvents;
    } else {
      events = await getCalDAVEvents(caldavUrl, startTime, endTime);
    }
  } catch (err) {
    logEvent(null, 'apple_calendar_fetch_error', {
      error: err.message,
      stack: err.stack
    });
    return false;
  }

  const newStart = new Date(startTime).getTime();
  const newEnd = new Date(endTime).getTime();

  for (const event of events) {
    const eventStart = new Date(event.start).getTime();
    const eventEnd = new Date(event.end).getTime();
    const eventLocation = event.location || homeAddress;

    const travelBefore = await getTravelTime(eventLocation, homeAddress, eventEnd);
    const travelAfter = await getTravelTime(homeAddress, eventLocation, eventStart);

    const tooCloseBefore = (newStart - eventEnd) / 60000 < travelBefore;
    const tooCloseAfter = (eventStart - newEnd) / 60000 < travelAfter;

    const overlaps = newStart < eventEnd && newEnd > eventStart;

    if (overlaps || tooCloseBefore || tooCloseAfter) {
      logEvent(null, 'apple_calendar_conflict', {
        conflictWith: event,
        attemptedTime: { start: startTime, end: endTime }
      });
      return true;
    }
  }

  return false;
}

export { hasAppleCalendarConflict };
