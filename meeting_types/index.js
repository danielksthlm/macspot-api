import db from './db.js';

export default async function (context, req) {
  try {
    // Testa databasanslutning först
    await db.query('SELECT 1');
    context.log.info('✅ Database connection test succeeded');

    const result = await db.query(
      "SELECT value FROM booking_settings WHERE key = 'meeting_types'"
    );

    if (result.rows.length === 0) {
      context.res = {
        status: 404,
        body: { error: "meeting_types not found" }
      };
      return;
    }

    context.res = {
      status: 200,
      body: result.rows[0].value
    };
  } catch (error) {
    context.log.error("❌ meetingTypes error:", {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    context.res = {
      status: 500,
      body: {
        error: error.message,
        code: error.code,
        stack: error.stack
      }
    };
  }
}