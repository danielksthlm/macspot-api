let pool;

export default async function (context, req) {
  context.log("🧪 meeting_types körs");

  try {
    if (!pool) {
      const pg = await import('pg');
      const { Pool } = pg;
      pool = new Pool({
        user: process.env.PGUSER,
        host: process.env.PGHOST,
        database: process.env.PGDATABASE,
        password: process.env.PGPASSWORD,
        port: parseInt(process.env.PGPORT || '5432', 10),
        ssl: { rejectUnauthorized: false }
      });
      context.log("✅ Pool initierad");
    }

    const client = await pool.connect();
    const result = await client.query(
      "SELECT value FROM booking_settings WHERE key = 'meeting_types'"
    );
    client.release();

    context.log("📦 Resultat från query:", result.rows);

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result.rows?.[0]?.value
    };
  } catch (err) {
    context.log("❌ Fel i meeting_types:", err.message, err.stack);
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  }
}