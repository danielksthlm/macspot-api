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
    const port = parseInt(process.env.PGPORT, 10);

    if (!user || !host || !database || !password || !port) {
      console.error('❌ Missing required PG connection environment variables.');
      throw new Error('Database configuration incomplete');
    }

    console.log("✅ Creating PostgreSQL connection pool...");
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
    console.error("❌ Error while creating PostgreSQL pool:", err.message);
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