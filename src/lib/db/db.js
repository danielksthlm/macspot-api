import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

let pool;

try {
  pool = new Pool({
    user: process.env.PGUSER || "danielkallberg",
    host: process.env.PGHOST || "localhost",
    database: process.env.PGDATABASE || "macspot",
    password: process.env.PGPASSWORD ?? (() => { throw new Error("PGPASSWORD is not set"); })(),
    port: parseInt(process.env.PGPORT || "5432", 10),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });
  console.log("✅ PostgreSQL pool created successfully.");
} catch (err) {
  console.error("❌ Error while creating PostgreSQL pool:", err);
}

const pool = createDbPool();

pool.connect()
  .then(() => console.log('✅ PostgreSQL connection successful!'))
  .catch(err => console.error('❌ PostgreSQL connection error:', err));

pool.on && pool.on('error', (err) => {
  console.error('❌ PG Pool error:', err);
});

export default pool;

export const getDb = () => pool;