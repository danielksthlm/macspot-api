let pool = null;

export async function getDb() {
  if (pool) return pool;

  const pg = await import('pg');
  const { Pool } = pg;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ DATABASE_URL saknas");
    return null;
  }

  console.log("🌐 Använder DATABASE_URL:", connectionString);

  pool = new Pool({ connectionString });
  return pool;
}