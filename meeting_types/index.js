import { getDb } from '../../src/lib/db/db.js';

export default async function (context, req) {
  try {
    const db = getDb();
    context.log.info('✅ DB client ready');

    const result = await db.query(
      "SELECT value FROM booking_settings WHERE key = 'meeting_types'"
    );

    const values = result?.rows?.[0]?.value;
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: Array.isArray(values) ? values : []
    };
  } catch (error) {
    context.log.error('❌ Error during function execution:', {
      message: error.message,
      stack: error.stack
    });
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: error.message,
        stack: error.stack
      }
    };
  }
}