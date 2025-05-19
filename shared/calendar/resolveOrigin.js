const memoryCache = {};

async function resolveOriginAddress({ eventId, calendarId, pool, context, graphClient, appleClient, fallbackOrigin, settings }) {
  const cacheKey = `${calendarId}:${eventId}`;
  const debugLog = (msg) => {
    if (process.env.DEBUG === 'true' && context?.log) context.log(msg);
  };
  debugLog(`🔍 resolveOriginAddress → calendarId: ${calendarId}, eventId: ${eventId}`);
  const eventDateOnly = eventId.split('T')[0];
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
    debugLog(`📂 DB-kontroll: Hittade ${dbRes?.rows?.length || 0} rader för ${eventDateOnly}`);
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
    debugLog(`✅ Hittade origin från DB: ${dbRes.rows[0].address}`);
    return {
      origin: dbRes.rows[0].address,
      originSource: dbRes.rows[0].source,
      originEndTime
    };
  }
  debugLog(`🕳️ Inget cacheträff i DB för ${eventDateOnly}`);

  // Try fetching from MS Graph
  let latestOrigin;
  let originSource = 'unknown';
  if (graphClient && typeof graphClient.getEvent === 'function') {
    try {
      const msEvent = await graphClient.getEvent(calendarId, eventId);
      if (msEvent && msEvent.location) {
        latestOrigin = msEvent.location;
        originSource = 'msgraph';
        debugLog(`✅ Hittade origin från MS Graph: ${latestOrigin}`);
      }
    } catch (err) {
      context.log(`⚠️ MS Graph error in resolveOriginAddress: ${err.message}`);
    }
  } else if (graphClient) {
    context.log(`⚠️ graphClient saknar getEvent-metod eller är null`);
  }

  // Try fetching from Apple calendar if not found
  if (!latestOrigin && appleClient && typeof appleClient.getEvent === 'function') {
    try {
      const appleEvent = await appleClient.getEvent(calendarId, eventId);
      if (appleEvent && appleEvent.location) {
        latestOrigin = appleEvent.location;
        originSource = 'apple';
        debugLog(`✅ Hittade origin från Apple: ${latestOrigin}`);
      }
    } catch (err) {
      context.log(`⚠️ Apple error in resolveOriginAddress: ${err.message}`);
    }
  } else if (!latestOrigin && appleClient) {
    context.log(`⚠️ appleClient saknar getEvent-metod eller är null`);
  }

  // Fallback if not found
  if (!latestOrigin) {
    debugLog(`🚨 Ingen träff i varken cache, DB, Graph eller Apple – använder fallback`);
    latestOrigin = fallbackOrigin || '';
    originSource = 'fallback';
    debugLog(`⚠️ Fallback används som origin: ${latestOrigin}`);
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
  debugLog(`🧠 resolveOriginAddress resultat: ${latestOrigin} (källa: ${originSource})`);
  context.log(`📤 resolveOriginAddress return: ${latestOrigin} (källa: ${originSource}, endTime: ${originEndTime?.toISOString?.() || 'null'})`);
  return { origin: latestOrigin, originSource, originEndTime };
}

module.exports = { resolveOriginAddress };