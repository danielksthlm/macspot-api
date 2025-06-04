// Tracking-logik för insamling av event
const { pool } = require('../shared/db/pgPool');

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

  // Slå ihop metadata + kontext till en sammanhängande JSONB
  const finalMetadata = {
    ...metadata,
    url,
    referrer,
    utm: {
      source: utm_source,
      medium: utm_medium,
      campaign: utm_campaign,
    },
  };

  try {
    context.log('[tracking] Sparar event:', {
      visitor_id,
      event_type,
      timestamp: timestamp || new Date().toISOString(),
      metadata: finalMetadata,
    });

    await pool.query(
      `INSERT INTO tracking_event (
        visitor_id, event_type, timestamp, metadata
      ) VALUES ($1, $2, $3, $4)`,
      [
        visitor_id,
        event_type,
        timestamp || new Date().toISOString(),
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