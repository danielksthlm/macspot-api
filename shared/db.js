import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

let pool = null;

export function getDb() {
  if (pool) return pool;

  const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];

  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error("❌ Saknade miljövariabler:", missing);
    return null;
  }

  console.log("✅ Miljövariabler laddade:", {
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT
  });

  pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '5432', 10),
    ssl: { rejectUnauthorized: false }
  });

  console.log("✅ PG Pool initierad");

  pool.on('error', (err) => {
    console.error('❌ PG Pool error:', err.message, err.stack);
  });

  return pool;
}