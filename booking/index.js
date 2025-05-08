const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

module.exports = async function (context, req) {
  const requiredFields = ['email', 'meeting_type', 'meeting_length', 'slot_iso'];
  const missing = requiredFields.filter(k => !req.body?.[k]);

  if (missing.length > 0) {
    context.res = { status: 400, body: { error: `Missing fields: ${missing.join(', ')}` } };
    return;
  }

  const { email, meeting_type, meeting_length, slot_iso, metadata = {} } = req.body;

  const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      context.res = { status: 500, body: { error: `Missing environment variable: ${key}` } };
      return;
    }
  }

  const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '5432', 10),
    ssl: { rejectUnauthorized: false }
  });

  const db = await pool.connect();
  try {
    // Läs in booking_settings
    const settingsRes = await db.query('SELECT key, value, value_type FROM booking_settings');
    const settings = {};
    for (const row of settingsRes.rows) {
      let val = row.value;
      if (row.value_type === 'int') {
        val = parseInt(val);
      } else if (row.value_type === 'bool') {
        val = val === 'true' || val === true;
      } else if (row.value_type === 'json' || row.value_type === 'array') {
        try {
          val = JSON.parse(typeof val === 'string' ? val : JSON.stringify(val));
        } catch (_) {}
      } else if (typeof val === 'string') {
        val = val.replace(/^"(.*)"$/, '$1'); // trimma citattecken
      }
      settings[row.key] = val;
    }

    const id = uuidv4();
    const startTime = new Date(slot_iso);
    const endTime = new Date(startTime.getTime() + meeting_length * 60000);
    const created_at = new Date();
    const updated_at = created_at;

    const fields = {
      id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      meeting_type,
      location_type: 'onsite', // default, can be overwritten below
      address: metadata.address || null,
      postal_code: metadata.postal_code || null,
      city: metadata.city || null,
      country: metadata.country || settings.country || 'SE',
      participant_count: 1,
      meeting_link: null,
      status: 'confirmed',
      require_approval: metadata.require_approval === true,
      language: settings.language || 'sv',
      synced_to_calendar: false,
      notes: metadata.notes || null,
      metadata: JSON.stringify(metadata),
      created_at,
      updated_at,
      contact_id: metadata.contact_id || null,
      event_id: null,
      room_email: null
    };

    // Mötets plats
    const digitalTypes = ['zoom', 'facetime', 'teams'];
    if (digitalTypes.includes(meeting_type.toLowerCase())) {
      fields.location_type = 'online';
    } else if (meeting_type === 'atOffice') {
      fields.location_type = 'onsite';
      fields.metadata = JSON.stringify({ ...metadata, room_status: 'unhandled' });
    }

    const query = `
      INSERT INTO bookings (
        id, start_time, end_time, meeting_type, location_type,
        address, postal_code, city, country, participant_count,
        meeting_link, status, require_approval, language,
        synced_to_calendar, notes, metadata, created_at, updated_at,
        contact_id, event_id, room_email
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18, $19,
        $20, $21, $22
      )
    `;

    const values = Object.values(fields);
    await db.query(query, values);

    context.res = {
      status: 200,
      body: {
        status: 'booked',
        booking_id: id,
        calendar_invite_sent: false // kan uppdateras om Graph-mail läggs in här
      }
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  } finally {
    db.release();
  }
};