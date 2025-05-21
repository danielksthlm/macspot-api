const pool = require('../shared/db/pgPool');

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

  try {
    const settingsRes = await pool.query(
      "select key, value from booking_settings where key in ('meeting_types', 'default_meeting_length_atclient', 'default_meeting_length_atoffice', 'default_meeting_length_digital')"
    );

    const settings = {};
    for (const row of settingsRes.rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    const rawTypes = settings['meeting_types'];
    const meetingTypes = Array.isArray(rawTypes) ? rawTypes.map(t => t.toLowerCase()) : [];
    const lengths = {
      zoom: settings['default_meeting_length_digital'],
      facetime: settings['default_meeting_length_digital'],
      teams: settings['default_meeting_length_digital'],
      atclient: settings['default_meeting_length_atclient'],
      atoffice: settings['default_meeting_length_atoffice']
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
    // pool.end() tas bort – vi återanvänder en delad pool mellan anrop
  }
};