import getDb from '../shared/db.js';

export default async function (context, req) {
  context.log("🧪 Startar test av db.js i Azure");

  try {
    const client = await getDb.connect();
    context.log("✅ Ansluten till databasen");

    const result = await client.query("SELECT NOW()");
    client.release();

    context.log("🕒 Tid från databasen:", result.rows[0]);

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result.rows[0]
    };
  } catch (err) {
    context.log("❌ DB-fel:", err.message);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: err.message,
        stack: err.stack
      }
    };
  }
}