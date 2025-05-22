const pool = require('../shared/db/pgPool');
const { getSettings } = require('../shared/config/settingsLoader');

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
    const settings = await getSettings(context);

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