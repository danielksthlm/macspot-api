const memoryCache = {};

async function resolveOriginAddress({ eventId, calendarId, pool, context, graphClient, appleClient, fallbackOrigin, settings }) {
  const cacheKey = `${calendarId}:${eventId}`;
  const eventDateOnly = eventId.split('T')[0];
  if (memoryCache[cacheKey]) {
    // Provide originEndTime as well
    let originEndTime = null;
    if (memoryCache[cacheKey].originSource === 'fallback') {
      originEndTime = new Date(`${eventDateOnly}T${settings.travel_time_window_start || '06:00'}:00`);
    } else {
      originEndTime = memoryCache[cacheKey].originEndTime || null;
    }
    return {
      origin: memoryCache[cacheKey].origin,
      originSource: memoryCache[cacheKey].originSource,
      originEndTime
    };
  }


  // Try database cache first
  let dbRes;
  try {
    dbRes = await pool.query(
      'SELECT address, source, end_time FROM calendar_origin_cache WHERE event_date = $1',
      [eventDateOnly]
    );
  } catch (err) {
    context.log(`⚠️ DB error in resolveOriginAddress: ${err.message}`);
  }
  if (dbRes && dbRes.rows && dbRes.rows.length > 0) {
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
    return {
      origin: dbRes.rows[0].address,
      originSource: dbRes.rows[0].source,
      originEndTime
    };
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
  let originEndTime = null;
  if (originSource === 'fallback') {
    originEndTime = new Date(`${eventDateOnly}T${settings.travel_time_window_start || '06:00'}:00`);
  }
  if (originSource !== 'fallback') {
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
  return { origin: latestOrigin, originSource, originEndTime };
}

module.exports = { resolveOriginAddress };