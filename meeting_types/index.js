export default async function (context, req) {
  let pool;
  try {
    const { Pool } = await import('pg');

    pool = new Pool({
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: { rejectUnauthorized: false }
    });

    context.log.info('✅ Pool created');

    const result = await pool.query(
      "SELECT value FROM booking_settings WHERE key = 'meeting_types'"
    );

    context.res = {
      status: 200,
      body: result.rows[0].value
    };
  } catch (error) {
    context.log.error('❌ Error during function execution:', {
      message: error.message,
      stack: error.stack
    });
    context.res = {
      status: 500,
      body: {
        error: error.message,
        stack: error.stack
      }
    };
  } finally {
    if (pool) {
      await pool.end();
      context.log.info('✅ Pool closed');
    }
  }
}