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
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000
});

console.log('✅ PostgreSQL pool created. Attempting to connect...');
pool.connect()
  .then(() => console.log('✅ PostgreSQL connection successful!'))
  .catch(err => console.error('❌ PostgreSQL connection error:', err));

pool.on('error', (err) => {
  console.error('❌ PG Pool error:', err);
});

export default pool;

export const getDb = () => pool;