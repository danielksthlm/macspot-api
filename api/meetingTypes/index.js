const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

module.exports = async function (context, req) {
  try {
    const result = await pool.query(`
      SELECT key, value
      FROM booking_settings
      WHERE key LIKE 'meeting_types.%'
    `);

    const types = result.rows.map(({ key, value }) => ({
      value: key.replace('meeting_types.', ''),
      label: value
    }));

    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: types
    };
  } catch (err) {
    context.log.error("❌ Fel vid hämtning av mötestyper:", err);
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  }
};