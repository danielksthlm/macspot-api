const pool = new Pool({
  user: process.env.PGUSER || "danielkallberg",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "macspot",
  password: process.env.PGPASSWORD || "HittaFitta69",
  port: parseInt(process.env.PGPORT || "5433", 10),
  ssl: process.env.PGHOST ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000
});

export default pool;