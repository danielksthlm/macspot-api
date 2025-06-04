// Tracking-logik för insamling av event
const pool = require('../shared/db/pgPool');

const allowedEvents = ['page_view', 'click', 'scroll_50', 'form_submit', 'session_end', 'page_unload'];

// Detta är tracking-logik
module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      body: 'Only POST requests allowed',
    };
    return;
  }

  let body = req.body;
  context.log('[tracking] Rå inkommande body:', body);

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (err) {
      context.log.error('[tracking] Kunde inte parsa JSON:', err.message);
      context.res = {
        status: 400,
        body: 'Malformed JSON',
      };
      return;
    }
  }

  if (!body || !body.visitor_id || !body.event_type) {
    context.res = {
      status: 400,
      body: 'Missing required fields',
    };
    return;
  }

  const {
    visitor_id,
    event_type,
    url,
    timestamp,
    referrer,
    utm_source,
    utm_medium,
    utm_campaign,
    metadata,
  } = body;

  const eventTimestamp = timestamp || new Date().toISOString();
  const safeMetadata = (typeof metadata === 'object' && metadata !== null) ? metadata : {};

  // Tillåtna event_type
  if (!allowedEvents.includes(event_type)) {
    context.log.warn('[tracking] ⚠️ Okänt event_type:', event_type);
  }

  // Blockera vissa user_agents
  if (!safeMetadata.user_agent || safeMetadata.user_agent === '' || safeMetadata.user_agent.includes('curl') || safeMetadata.user_agent.includes('bot')) {
    context.log.warn('[tracking] 🔒 Blockerat pga user_agent:', safeMetadata.user_agent);
    context.res = { status: 204 };
    return;
  }

  // Slå ihop metadata + kontext till en sammanhängande JSONB
  const finalMetadata = {
    ...safeMetadata,
    url,
    referrer,
    utm: {
      source: utm_source,
      medium: utm_medium,
      campaign: utm_campaign,
    },
  };

  const ip = safeMetadata?.ip_address;

  if (ip) {
    try {
      const res = await fetch(`https://ipapi.co/${ip}/json/`);
      if (res.ok) {
        const geo = await res.json();
        finalMetadata.geo = {
          country: geo.country_name,
          country_code: geo.country_code,
          city: geo.city,
          region: geo.region,
          latitude: geo.latitude,
          longitude: geo.longitude
        };
      }
    } catch (err) {
      context.log.warn('[geoip] Kunde inte hämta plats för IP:', ip, err.message);
    }
  }

  try {
    context.log('[tracking] Sparar event:', {
      visitor_id,
      event_type,
      timestamp: eventTimestamp,
      metadata: finalMetadata,
    });

    await pool.query(
      `INSERT INTO tracking_event (
        visitor_id, event_type, timestamp, metadata
      ) VALUES ($1, $2, $3, $4)`,
      [
        visitor_id,
        event_type,
        eventTimestamp,
        finalMetadata,
      ]
    );

    const who = finalMetadata?.email || 'anonym';
    context.log(`[TRACK] ${event_type} från ${visitor_id} (${who})`);
    context.res = {
      status: 200,
      body: 'Event saved',
    };
  } catch (error) {
    context.log.error('Tracking DB error:', error);
    context.res = {
      status: 500,
      body: 'Error saving tracking data',
    };
  }
};