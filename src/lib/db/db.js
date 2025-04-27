import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

function createDbPool() {
  try {
    const user = process.env.PGUSER || "danielkallberg";
    const host = process.env.PGHOST || "localhost";
    const database = process.env.PGDATABASE || "macspot";
    const password = process.env.PGPASSWORD ?? (() => { throw new Error("PGPASSWORD is not set"); })();
    const port = parseInt(process.env.PGPORT || "5432", 10);

    console.log("✅ Creating PostgreSQL connection pool...");
    const pool = new Pool({
      user,
      host,
      database,
      password,
      port,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });

    pool.connect()
      .then(() => console.log('✅ PostgreSQL connection successful!'))
      .catch(err => console.error('❌ PostgreSQL connection error:', err));

    pool.on && pool.on('error', (err) => {
      console.error('❌ PG Pool error:', err);
    });

    return pool;
  } catch (err) {
    console.error("❌ Error while creating PostgreSQL pool:", err.message);
    return {
      query: async () => { throw new Error("Database connection failed: " + err.message); }
    };
  }
}

const pool = createDbPool();

export default pool;

export const getDb = () => pool;