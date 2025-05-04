export default async function (context, req) {
  let pool;
  try {
    context.log.info('📥 Function triggered: meeting_types');

    // Kontrollera att alla nödvändiga miljövariabler är satta
    const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
    for (const key of requiredEnv) {
      if (!process.env[key]) {
        throw new Error(`Missing environment variable: ${key}`);
      }
    }

    context.log.info('🔐 Environment variables verified');

    const { Pool } = await import('pg');

    pool = new Pool({
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: { rejectUnauthorized: false }
    });

    context.log.info('✅ PostgreSQL pool created');

    const result = await pool.query(
      "SELECT value FROM booking_settings WHERE key = 'meeting_types'"
    );

    context.log.info('📊 Query executed');

    if (!result.rows || result.rows.length === 0) {
      context.log.warn('⚠️ No meeting_types found in booking_settings');
      context.res = {
        status: 404,
        body: { error: "Inga mötestyper hittades." }
      };
      return;
    }

    // ⓘ Durations for each type are defined in separate keys like:
    // default_meeting_length_atClient, default_meeting_length_digital, etc.
    const meetingTypes = result.rows[0].value;
    context.log.info('📋 Available meeting types:', meetingTypes);
    context.res = {
      status: 200,
      body: meetingTypes
    };
    context.log.info('✅ meeting_types returned successfully');
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
      context.log.info('🧹 PostgreSQL pool closed');
    }
  }
}