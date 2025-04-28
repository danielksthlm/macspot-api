import db from '../../src/lib/db/db.js';

export default async function (context, req) {
  try {
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
      body: { error: error.message }
    };
  }
}