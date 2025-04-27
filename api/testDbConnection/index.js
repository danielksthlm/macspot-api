import db from '../../src/lib/db/db.js';

export const getTestDbConnection = {
  route: 'testDbConnection',
  methods: ['GET'],
  handler: async (_req, context) => {
    context.log("🚀 Starting DB connection test...");

    try {
      const res = await db.query('SELECT 1 as test;');
      context.log("✅ DB query successful:", res.rows[0]);
      
      return new Response(JSON.stringify({
        message: '✅ Database connection succeeded!',
        result: res.rows[0]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      context.error("❌ DB connection failed:", err);

      return new Response(JSON.stringify({
        message: '❌ Database connection failed',
        error: err.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};