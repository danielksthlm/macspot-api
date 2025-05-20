console.log("🧪 travelTimeResolver.js laddades");
async function resolveTravelTime({ origin, destination, hour, db, accessToken, context }) {
  let travelTimeMin = 20;
  const cacheKey = `${origin}|${destination}|${hour}`;
  let cacheHit = false;
  let isFallback = false;

  if (!origin || !destination) {
    context.log(`⚠️ Kan inte beräkna restid – origin eller destination saknas`);
    return { travelTimeMin, cacheHit: false, isFallback };
  }

  if (!db || typeof db.query !== 'function') {
    context.log(`❌ db saknas eller saknar query-metod i resolveTravelTime`);
    return { travelTimeMin, cacheHit: false, isFallback: true };
  }

  try {
    const cacheRes = await db.query(
      `SELECT travel_minutes, is_fallback FROM travel_time_cache WHERE from_address = $1 AND to_address = $2 AND hour = $3 LIMIT 1`,
      [origin, destination, hour]
    );
    if (cacheRes.rows.length > 0) {
      travelTimeMin = cacheRes.rows[0].travel_minutes;
      isFallback = cacheRes.rows[0].is_fallback === true;
      cacheHit = true;
      context.log(`⚡ Cache hit (db): ${origin} → ${destination} @ ${hour}:00 = ${travelTimeMin} min`);
    }
  } catch (err) {
    context.log(`⚠️ Kunde inte läsa från travel_time_cache: ${err.message}`);
  }

  if (!accessToken) {
    context.log(`⚠️ accessToken saknas – använder fallback`);
    return { travelTimeMin, cacheHit: false, isFallback: true };
  }

  if (!cacheHit && accessToken) {
    try {
      const url = new URL('https://maps-api.apple.com/v1/directions');
      url.searchParams.append('origin', origin);
      url.searchParams.append('destination', destination);
      url.searchParams.append('transportType', 'automobile');
      url.searchParams.append('departureTime', new Date().toISOString());

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const travelSeconds = data.routes?.[0]?.durationSeconds;
      if (travelSeconds) {
        travelTimeMin = Math.round(travelSeconds / 60);
        await db.query(
          `INSERT INTO travel_time_cache (from_address, to_address, hour, travel_minutes, is_fallback)
           VALUES ($1, $2, $3, $4, false)
           ON CONFLICT (from_address, to_address, hour)
           DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes, is_fallback = false`,
          [origin, destination, hour, travelTimeMin]
        );
        context.log(`💾 Sparade Apple Maps-restid i cache: ${origin} → ${destination} @ ${hour}:00 = ${travelTimeMin} min`);
      } else {
        context.log(`⚠️ Apple Maps-data saknas – använder fallback`);
      }
    } catch (err) {
      context.log(`⚠️ Fel vid Apple Maps-anrop: ${err.message}`);
    }
  }

  return { travelTimeMin, cacheHit, isFallback };
}

module.exports = { resolveTravelTime };