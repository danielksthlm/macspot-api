import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

function createDbPool() {
  try {
    const user = "macapp";
    const host = "macspotpg.postgres.database.azure.com";
    const database = "postgres";
    const password = "0DsgJwXbVkJ6TnZ";
    const port = 5432;

    console.log("✅ (Test) Creating PostgreSQL connection pool with hardcoded credentials...");
    return new Pool({
      user,
      host,
      database,
      password,
      port,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });
  } catch (err) {
    console.error("❌ (Test) Error while creating PostgreSQL pool:", err.message);
    return {
      query: async () => { throw new Error("Database connection failed: " + err.message); }
    };
  }
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