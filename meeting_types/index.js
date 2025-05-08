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
    const { rows } = await pool.query(
      "SELECT value FROM booking_settings WHERE key = 'meeting_types'"
    );

    if (!rows || rows.length === 0) {
      context.res = {
        status: 404,
        body: { error: 'Inga mötestyper hittades.' }
      };
      return;
    }

    context.res = {
      status: 200,
      body: rows[0].value
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