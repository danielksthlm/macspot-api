import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({
  user: process.env.PGUSER || "danielkallberg",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "macspot",
  password: process.env.PGPASSWORD ?? (() => { throw new Error("PGPASSWORD is not set"); })(),
  port: parseInt(process.env.PGPORT || "5433", 10),
  ssl: process.env.PGHOST?.includes('azure.com')
    ? { rejectUnauthorized: false }
    : false,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('❌ PG Pool error:', err);
});

export default pool;

export const getDb = () => pool;