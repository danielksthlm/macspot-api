import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`❌ Miljövariabel ${key} saknas.`);
  }
});

console.log("✅ Miljövariabler laddade:", {
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT
});

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

export default pool;