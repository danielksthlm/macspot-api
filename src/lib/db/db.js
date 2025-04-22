

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: "danielkallberg",
  host: "localhost",
  database: "macspot",
  password: "HittaFitta69", // Lägg till om du har ett lösenord
  port: 5433
});

export default pool;