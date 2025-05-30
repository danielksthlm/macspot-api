/**
 * resolveOriginAddress
 * --------------------
 * Hämtar origin-adress för ett kalender-event från:
 * 1. Memory-cache
 * 2. PostgreSQL-cache (om SKIP_DB inte är satt)
 * 3. MS Graph
 * 4. Apple Calendar
 * Fallback används vid miss.
 *
 * Miljövariabler:
 * - SKIP_DB=true  → hoppar över all databaslogik (läs/skriv)
 */
const memoryCache = {};

function cleanAddress(address) {
  return address.replace(/\n/g, ', ').replace(/\\,/g, ',').replace(/\+/g, ' ').trim();
}

async function resolveOriginAddress({ eventId, calendarId, pool, context, graphClient, appleClient, fallbackOrigin, settings, eventCache }) {
  const cacheKey = `${calendarId}:${eventId}`;
  const debugLog = (msg) => {
    if (process.env.DEBUG === 'true' && context?.log) context.log(msg);
  };
  debugLog(`🔍 resolveOriginAddress → calendarId: ${calendarId}, eventId: ${eventId}`);
  const eventDateOnly = eventId.split('T')[0];

  const useCacheEvents = eventCache?.has(eventDateOnly);
  const cachedEvents = useCacheEvents ? eventCache.get(eventDateOnly) : null;

  if (memoryCache[cacheKey]) {
    // Provide originEndTime as well
    let originEndTime = null;
    if (memoryCache[cacheKey].originSource === 'fallback') {
      originEndTime = new Date(`${eventDateOnly}T${settings.travel_time_window_start || '06:00'}:00`);
    } else {
      originEndTime = memoryCache[cacheKey].originEndTime || null;
    }
    debugLog(`✅ Hittade origin från cache: ${memoryCache[cacheKey].origin}`);
    return {
      origin: cleanAddress(memoryCache[cacheKey].origin),
      originSource: memoryCache[cacheKey].originSource,
      originEndTime
    };
  }


  // Try database cache first
  let dbRes;
  if (!process.env.SKIP_DB) {
    try {
      dbRes = await pool.query(
        'SELECT address, source, end_time FROM calendar_origin_cache WHERE event_date = $1',
        [eventDateOnly]
      );
      debugLog(`📂 DB-kontroll: Hittade ${dbRes?.rows?.length || 0} rader för ${eventDateOnly}`);
    } catch (err) {
      context.log(`⚠️ DB error in resolveOriginAddress: ${err.message}`);
    }
  }
  if (dbRes && dbRes.rows && dbRes.rows.length > 0) {
    // Special case: if source is fallback, return immediately
    if (dbRes.rows[0].source === 'fallback') {
      const originEndTime = new Date(`${eventDateOnly}T${settings.travel_time_window_start || '06:00'}:00`);
      memoryCache[cacheKey] = {
        origin: dbRes.rows[0].address,
        originSource: dbRes.rows[0].source,
        originEndTime
      };
      debugLog(`🛑 DB-träff var fallback – hoppar övriga försök`);
      return {
        origin: cleanAddress(dbRes.rows[0].address),
        originSource: dbRes.rows[0].source,
        originEndTime
      };
    }
    let originEndTime = null;
    if (dbRes.rows[0].source === 'fallback') {
      originEndTime = new Date(`${eventDateOnly}T${settings.travel_time_window_start || '06:00'}:00`);
    } else {
      originEndTime = dbRes.rows[0].end_time || null;
    }
    memoryCache[cacheKey] = {
      origin: dbRes.rows[0].address,
      originSource: dbRes.rows[0].source,
      originEndTime: originEndTime
    };
    debugLog(`✅ Hittade origin från DB: ${dbRes.rows[0].address}`);
    return {
      origin: cleanAddress(dbRes.rows[0].address),
      originSource: dbRes.rows[0].source,
      originEndTime
    };
  }
  debugLog(`🕳️ Inget cacheträff i DB för ${eventDateOnly}`);

  let latestOrigin;
  let originEndTime = null;
  let originSource = 'unknown';

  if (!latestOrigin && memoryCache[`${calendarId}:${eventDateOnly}`]) {
    const { origin, originSource, originEndTime } = memoryCache[`${calendarId}:${eventDateOnly}`];
    debugLog(`🔁 Återanvänder memoryCache för dag: ${eventDateOnly}`);
    return { origin: cleanAddress(origin), originSource, originEndTime };
  }
  if (graphClient && typeof graphClient.getEvent === 'function') {
    if (!latestOrigin && !memoryCache[`${calendarId}:${eventDateOnly}`]) {
      try {
        const graphCalendarId = settings.ms_sender_email;
        const appleCalendarId = process.env.CALDAV_USER;
        const msEvent = await graphClient.getEvent(graphCalendarId, eventId);
        if (msEvent && msEvent.location) {
          latestOrigin = msEvent.location;
          originSource = 'Microsoft 365';
          debugLog(`✅ Hittade origin från MS Graph: ${latestOrigin}`);
        }
      } catch (err) {
        context.log(`⚠️ MS Graph error in resolveOriginAddress: ${err.message}`);
      }
    }
  } else if (graphClient) {
    context.log(`⚠️ graphClient saknar getEvent-metod eller är null`);
  }

  // Try fetching from Apple calendar if not found
  if (!latestOrigin && appleClient && typeof appleClient.fetchEventsByDateRange === 'function') {
    try {
      const startRange = `${eventDateOnly}T00:00:00Z`;
      const endRange = `${eventDateOnly}T23:59:59Z`;
      const appleCalendarId = process.env.CALDAV_USER;
      const events = cachedEvents || await appleClient.fetchEventsByDateRange(startRange, endRange, appleCalendarId);
      if (!cachedEvents && eventCache) eventCache.set(eventDateOnly, events);
      let mostRecent = null;
      const eventStartTime = new Date(eventId);
      for (const e of events) {
        const dtend = new Date(e.dtend || '');
        if (dtend && dtend <= eventStartTime) {
          if (!mostRecent || dtend > new Date(mostRecent.dtend || 0)) {
            mostRecent = e;
          }
        }
      }

      // Om ingen med location hittades, ta det senaste med dtend
      if (!mostRecent) {
        for (const e of events) {
          const dtend = new Date(e.dtend || '');
          if (dtend && dtend <= eventStartTime) {
            if (!mostRecent || dtend > new Date(mostRecent.dtend || 0)) {
              mostRecent = e;
            }
          }
        }
      }

      if (mostRecent) {
        latestOrigin = mostRecent.location || fallbackOrigin || '';
        originSource = mostRecent.location ? 'Apple Calendar' : 'fallback';
        debugLog(`✅ Hittade origin från Apple (eller fallback): ${latestOrigin}`);

        if (mostRecent.dtend && typeof mostRecent.dtend === 'string') {
          const dt = mostRecent.dtend.replace(/[^0-9T]/g, '');
          const parsed = new Date(dt.length === 8 ? `${dt}T00:00:00Z` : dt);
          originEndTime = !isNaN(parsed.getTime())
            ? parsed
            : new Date(`${eventDateOnly}T${settings.travel_time_window_start || '06:00'}:00`);
        } else {
          originEndTime = new Date(`${eventDateOnly}T${settings.travel_time_window_start || '06:00'}:00`);
        }
      }
    } catch (err) {
      context.log(`⚠️ Apple error in resolveOriginAddress: ${err.message}`);
    }
  } else if (!latestOrigin && appleClient) {
    context.log(`⚠️ appleClient saknar fetchEventsByDateRange-metod eller är null`);
  }

  // Fallback if not found
  if (!latestOrigin) {
    if (originEndTime) {
      debugLog(`⚠️ LOCATION saknas men endTime finns – använder fallback som origin`);
      latestOrigin = fallbackOrigin || '';
      originSource = 'fallback';
    } else {
      debugLog(`🚨 Ingen träff i varken cache, DB, Graph eller Apple – använder fallback`);
      latestOrigin = fallbackOrigin || '';
      originSource = 'fallback';
    }
    debugLog(`⚠️ Fallback används som origin: ${latestOrigin}`);
  }

  memoryCache[`${calendarId}:${eventDateOnly}`] = {
    origin: latestOrigin,
    originSource,
    originEndTime
  };

  // Write to DB cache unless fallback
  originEndTime = originEndTime || null;
  if (originSource === 'fallback') {
    originEndTime = new Date(`${eventDateOnly}T${settings.travel_time_window_start || '06:00'}:00`);
  }
  // Ensure originEndTime fallback value before DB insert (unless fallback)
  if (!originEndTime && originSource !== 'fallback') {
    originEndTime = new Date(`${eventDateOnly}T${settings.travel_time_window_start || '06:00'}:00`);
  }
  if (!process.env.SKIP_DB && originSource !== 'fallback') {
    try {
      await pool.query(
        `INSERT INTO calendar_origin_cache (event_date, source, address, end_time)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [eventDateOnly, originSource, latestOrigin, originEndTime]
      );
    } catch (err) {
      context.log(`⚠️ DB write error in resolveOriginAddress: ${err.message}`);
    }
  }

  memoryCache[cacheKey] = {
    origin: latestOrigin,
    originSource,
    originEndTime
  };
  debugLog(`🧠 resolveOriginAddress resultat: ${latestOrigin} (källa: ${originSource})`);
  if (process.env.DEBUG === 'true' && context?.log) {
    context.log(`📤 resolveOriginAddress return: ${latestOrigin} (källa: ${originSource}, endTime: ${originEndTime?.toISOString?.() || 'null'})`);
  }
  return { origin: cleanAddress(latestOrigin), originSource, originEndTime };
}

module.exports = { resolveOriginAddress };

if (process.env.NODE_ENV === 'test') {
  module.exports._test = { memoryCache };
}