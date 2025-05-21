const { Pool } = require('pg');
require('dotenv').config();

console.log("🧪 shared/db/pgPool.js laddades");

const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: parseInt(process.env.PGPORT || '5432', 10),
  ssl: process.env.PG_USE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

module.exports = pool;