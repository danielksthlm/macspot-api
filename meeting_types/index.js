const { Pool } = require('pg');

module.exports = async function (context, req) {
  const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      context.log.error(`Missing environment variable: ${key}`);
      context.res = {
        status: 500,
        body: { error: `Missing environment variable: ${key}` }
      };
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

  try {
    const settingsRes = await pool.query(
      "SELECT key, value FROM booking_settings WHERE key IN ('meeting_types', 'default_meeting_length_atClient', 'default_meeting_length_atOffice', 'default_meeting_length_digital')"
    );

    const settings = {};
    for (const row of settingsRes.rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    const meetingTypes = settings['meeting_types'];
    const lengths = {
      zoom: settings['default_meeting_length_digital'],
      facetime: settings['default_meeting_length_digital'],
      teams: settings['default_meeting_length_digital'],
      atclient: settings['default_meeting_length_atClient'],
      atoffice: settings['default_meeting_length_atOffice']
    };

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        types: meetingTypes,
        lengths
      })
    };
  } catch (error) {
    context.log.error('Database query failed:', error);
    context.res = {
      status: 500,
      body: { error: error.message }
    };
  } finally {
    await pool.end();
  }
};