const { pool } = require('../shared/db/pgPool');

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      body: 'Only POST requests allowed',
    };
    return;
  }

  const body = req.body;

  if (!body || !body.visitor_id || !body.event) {
    context.res = {
      status: 400,
      body: 'Missing required fields',
    };
    return;
  }

  const {
    visitor_id,
    event: event_type,
    url,
    timestamp,
    referrer,
    utm_source,
    utm_medium,
    utm_campaign,
    metadata,
  } = body;

  try {
    await pool.query(
      `INSERT INTO tracking_event (
        visitor_id, event_type, url, timestamp, referrer,
        utm_source, utm_medium, utm_campaign, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        visitor_id,
        event_type,
        url,
        timestamp || new Date().toISOString(),
        referrer,
        utm_source,
        utm_medium,
        utm_campaign,
        metadata || {},
      ]
    );

    context.log(`[TRACK] ${event_type} från ${visitor_id} på ${url}`);
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