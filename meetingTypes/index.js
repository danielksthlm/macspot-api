import db from './db.js';

export default async function (context, req) {
  try {
    context.log("🚀 Handler started. Preparing to query database...");
    context.log(`🧩 PGUSER: ${process.env.PGUSER}`);
    context.log(`🧩 PGHOST: ${process.env.PGHOST}`);
    context.log(`🧩 PGPORT: ${process.env.PGPORT}`);
    context.log(`🧩 PGDATABASE: ${process.env.PGDATABASE}`);

    const res = await db.query(`
      SELECT key, value
      FROM booking_settings
      WHERE key LIKE 'meeting_types.%'
    `);

    context.log("✅ Database query successful. Preparing response...");

    const types = res.rows.map(({ key, value }) => ({
      value: key.replace('meeting_types.', ''),
      label: value
    }));

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: types
    };

  } catch (err) {
    context.log.error("❌ Error inside meetingTypes handler:", err);
    context.log.error(`🧩 PGUSER: ${process.env.PGUSER}`);
    context.log.error(`🧩 PGHOST: ${process.env.PGHOST}`);
    context.log.error(`🧩 PGPORT: ${process.env.PGPORT}`);
    context.log.error(`🧩 PGDATABASE: ${process.env.PGDATABASE}`);
    context.res = {
      status: 500,
      body: {
        error: err.message,
        stack: err.stack
      }
    };
  }
}
