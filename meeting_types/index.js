import { Pool } from 'pg';

let pool;

export default async function (context, req) {
  if (!pool) {
    context.log("🧪 Initierar pool med följande konfiguration:");
    context.log({
      PGUSER: process.env.PGUSER || '⛔ tom',
      PGPASSWORD: process.env.PGPASSWORD ? '✓' : '⛔ tom',
      PGHOST: process.env.PGHOST || '⛔ tom',
      PGDATABASE: process.env.PGDATABASE || '⛔ tom',
      PGPORT: process.env.PGPORT || '⛔ tom'
    });
    pool = new Pool({
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: { rejectUnauthorized: false }
    });
  }

  context.log("🧪 meeting_types körs");
  context.log("🔍 PGHOST:", process.env.PGHOST);
  context.log("🔍 PGUSER:", process.env.PGUSER);
  context.log("🔍 PGDATABASE:", process.env.PGDATABASE);
  context.log("🔍 PGPORT:", process.env.PGPORT);

  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT value FROM booking_settings WHERE key = 'meeting_types'"
    );
    client.release();

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