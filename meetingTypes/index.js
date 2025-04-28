import db from '../../src/lib/db/db.js';

export default async function (context, req) {
  try {
    const result = await db.query('SELECT * FROM meeting_types');
    context.res = {
      status: 200,
      body: result.rows
    };
  } catch (error) {
    context.log.error("❌ meetingTypes error:", error);
    context.res = {
      status: 500,
      body: { error: error.message }
    };
  }
}