const DEBUG = process.env.DEBUG === 'true';
const { URL } = require('url');

async function verifyReturnTravelFeasibility({
  previousBooking,
  contact,
  slotTime,
  settings,
  accessToken,
  db,
  context,
  travelCache
}) {
  const from = previousBooking.address || settings.default_office_address;
  const to = `${contact.metadata.address} ${contact.metadata.postal_code} ${contact.metadata.city}`;
  const prevEnd = new Date(previousBooking.end);

  if (from === to) {
    if (DEBUG) context.log(`💾 Returrestid är 0 min (${from} → ${to}) – ingen cache behövs`);
    return { isFeasible: true };
  }

  try {
    const url = new URL('https://maps-api.apple.com/v1/directions');
    url.searchParams.append('origin', from);
    url.searchParams.append('destination', to);
    url.searchParams.append('transportType', 'automobile');
    url.searchParams.append('departureTime', prevEnd.toISOString());

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const data = await res.json();
    const returnMinutes = Math.round((data.routes?.[0]?.durationSeconds || 0) / 60);
    const arrivalTime = new Date(prevEnd.getTime() + returnMinutes * 60000);

    // Cache return time in memory and DB
    const hour = prevEnd.getUTCHours();
    const returnCacheKey = `${from}|${to}|${hour}`;
    travelCache.set(returnCacheKey, returnMinutes);
    if (from && to) {
      await db.query(`
        INSERT INTO travel_time_cache (from_address, to_address, hour, travel_minutes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (from_address, to_address, hour)
        DO UPDATE SET travel_minutes = EXCLUDED.travel_minutes
      `, [from, to, hour, returnMinutes]);
      if (DEBUG) context.log(`💾 Returrestid sparad: ${returnMinutes} min (${from} → ${to} @ ${hour}:00)`);
    } else {
      if (DEBUG) context.log(`⚠️ Hoppar caching av retur – saknar from_address (${from}) eller to_address (${to})`);
    }

    if (arrivalTime > slotTime) {
      if (DEBUG) context.log(`⛔ Slot ${slotTime.toISOString()} avvisad – retur från tidigare möte hinner inte fram i tid (ankomst ${arrivalTime.toISOString()})`);
      return { isFeasible: false, reason: 'retur hinner inte fram', arrivalTime };
    }

    return { isFeasible: true };
  } catch (err) {
    if (DEBUG) context.log(`⚠️ Kunde inte verifiera returrestid från tidigare möte: ${err.message}`);
    return { isFeasible: true }; // fail open
  }
}

module.exports = { verifyReturnTravelFeasibility };