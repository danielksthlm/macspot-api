const { Pool } = require('pg');
require('dotenv').config();

const useSSL = process.env.PG_USE_SSL === 'true';
const sslConfig = useSSL ? { rejectUnauthorized: false } : false;


const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: parseInt(process.env.PGPORT || '5432', 10),
  ssl: sslConfig
});

module.exports = pool;