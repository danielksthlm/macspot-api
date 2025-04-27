import db from '../lib/db/db.js';

export const getMeetingTypes = {
  route: 'meetingTypes',
  methods: ['GET'],
  handler: async (_req, context) => {
    try {
      const res = await db.query(`
        SELECT key, value
        FROM booking_settings
        WHERE key LIKE 'meeting_types.%'
      `);

      const types = res.rows.map(({ key, value }) => ({
        value: key.replace('meeting_types.', ''),
        label: value
      }));

      return new Response(JSON.stringify(types), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      context.error("❌ Fel vid hämtning av mötestyper:", err);
      return new Response(JSON.stringify({
        error: err.message,
        stack: err.stack
      }), { status: 500 });
    }
  }
};
