import app from 'apprun';
import db from '../lib/db/db.js';

app.http('getMeetingLengths', {
  route: 'meetingLengths',
  methods: ['GET'],
  handler: async (_req, context) => {
    try {
      const res = await db.query(`
        SELECT key, value
        FROM booking_settings
        WHERE key LIKE 'default_meeting_length_%'
      `);

      const lengths = res.rows.map(({ key, value }) => {
        let parsedValue;
        try {
          parsedValue = JSON.parse(value);
        } catch (e) {
          parsedValue = { default: Number(value) };
        }

        return {
          type: key.replace('default_meeting_length_', ''),
          durations: parsedValue
        };
      });

      return new Response(JSON.stringify(lengths), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      context.error("❌ Fel vid hämtning av mötestidslängder:", err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
});