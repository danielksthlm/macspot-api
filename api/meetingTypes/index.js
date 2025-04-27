import db from '../lib/db/db.js';

export const getMeetingTypes = {
  route: 'meetingTypes',
  methods: ['GET'],
  handler: async (_req, context) => {
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

      return new Response(JSON.stringify(types), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      context.error("❌ Error inside meetingTypes handler:", err);
      return new Response(JSON.stringify({
        error: err.message,
        stack: err.stack
      }), { status: 500 });
    }
  }
};
