


// This function resolves the origin address for a calendar event, using cache and fallback logic.
// It checks the calendar_origin_cache, fetches latest MS Graph and Apple events, and writes to DB unless using fallback.
const memoryCache = {};

async function resolveOriginAddress({ eventId, calendarId, pool, context, graphClient, appleClient, fallbackOrigin }) {
  const cacheKey = `${calendarId}:${eventId}`;
  if (memoryCache[cacheKey]) {
    return { origin: memoryCache[cacheKey].origin, originSource: memoryCache[cacheKey].originSource };
  }

  // Try database cache first
  let dbRes;
  try {
    dbRes = await pool.query(
      'SELECT origin, origin_source FROM calendar_origin_cache WHERE calendar_id = $1 AND event_id = $2',
      [calendarId, eventId]
    );
  } catch (err) {
    context.log(`⚠️ DB error in resolveOriginAddress: ${err.message}`);
  }
  if (dbRes && dbRes.rows && dbRes.rows.length > 0) {
    memoryCache[cacheKey] = {
      origin: dbRes.rows[0].origin,
      originSource: dbRes.rows[0].origin_source
    };
    return { origin: dbRes.rows[0].origin, originSource: dbRes.rows[0].origin_source };
  }

  // Try fetching from MS Graph
  let latestOrigin;
  let originSource = 'unknown';
  if (graphClient) {
    try {
      const msEvent = await graphClient.getEvent(calendarId, eventId);
      if (msEvent && msEvent.location && msEvent.location.displayName) {
        latestOrigin = msEvent.location.displayName;
        originSource = 'msgraph';
      }
    } catch (err) {
      context.log(`⚠️ MS Graph error in resolveOriginAddress: ${err.message}`);
    }
  }

  // Try fetching from Apple calendar if not found
  if (!latestOrigin && appleClient) {
    try {
      const appleEvent = await appleClient.getEvent(calendarId, eventId);
      if (appleEvent && appleEvent.location) {
        latestOrigin = appleEvent.location;
        originSource = 'apple';
      }
    } catch (err) {
      context.log(`⚠️ Apple error in resolveOriginAddress: ${err.message}`);
    }
  }

  // Fallback if not found
  if (!latestOrigin) {
    latestOrigin = fallbackOrigin || '';
    originSource = 'fallback';
  }

  // Write to DB cache unless fallback
  if (originSource !== 'fallback') {
    try {
      await pool.query(
        `INSERT INTO calendar_origin_cache (calendar_id, event_id, origin, origin_source)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (calendar_id, event_id) DO UPDATE SET origin = EXCLUDED.origin, origin_source = EXCLUDED.origin_source`,
        [calendarId, eventId, latestOrigin, originSource]
      );
    } catch (err) {
      context.log(`⚠️ DB write error in resolveOriginAddress: ${err.message}`);
    }
  }

  memoryCache[cacheKey] = { origin: latestOrigin, originSource };
  return { origin: latestOrigin, originSource };
}

module.exports = { resolveOriginAddress };