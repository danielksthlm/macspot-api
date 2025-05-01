//import dotenv from 'dotenv';
//dotenv.config();
console.log("📦 .env-konfiguration laddad");

import pkg from 'pg';
const { Pool } = pkg;

const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error("❌ Saknade miljövariabler:", missing);
}

console.log("✅ Miljövariabler laddade:", {
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT
});

function getDb() {
  if (missing.length > 0) {
    return null;
  }
  const pool = new Pool({
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

export { getDb };