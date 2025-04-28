import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

function createDbPool() {
  try {
    const user = process.env.PGUSER;
    const host = process.env.PGHOST;
    const database = process.env.PGDATABASE;
    const password = process.env.PGPASSWORD;
    const port = parseInt(process.env.PGPORT || "5432", 10);

    if (!user || !host || !database || !password) {
      throw new Error("One or more required PostgreSQL environment variables are missing");
    }

    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

    console.log(`✅ Creating PostgreSQL connection pool to host: ${host}`);

    const pool = new Pool({
      user,
      host,
      database,
      password,
      port,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      console.error('❌ PG Pool error:', err.message, err.stack);
    });

    return pool;
  } catch (err) {
    console.error("❌ Error while creating PostgreSQL pool:", err.message, err.stack);
    return {
      query: async () => { throw new Error("Database connection failed: " + err.message); }
    };
  }
}

const db = createDbPool();