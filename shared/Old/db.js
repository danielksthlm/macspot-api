import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function (context, req) {
  context.log("🧪 Funktion startade");

  try {
    const client = await pool.connect();
    context.log("✅ Ansluten till databasen");

    const result = await client.query("SELECT value FROM booking_settings WHERE key = 'meeting_types'");
    client.release();

    context.log("📦 Query-resultat:", result?.rows);

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result?.rows?.[0]?.value
    };
  } catch (err) {
    context.log("❌ DB-fel:", err.message);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: err.message }
    };
  }
}