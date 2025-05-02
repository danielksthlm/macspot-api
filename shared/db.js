import { Pool } from '@neondatabase/serverless';

let pool = null;

export function getDb() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ DATABASE_URL saknas");
    return null;
  }

  console.log("🌐 Använder DATABASE_URL:", connectionString); // 🔍 loggar aktiv URL

  pool = new Pool({ connectionString });

  console.log("✅ Neon Serverless Pool initierad");
  return pool;
}