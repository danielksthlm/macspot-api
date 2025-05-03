import postgres from 'postgres';

let sql = null;

export function getDb() {
  if (sql) return sql;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ DATABASE_URL saknas");
    return null;
  }

  console.log("🌐 postgres.js använder:", connectionString);

  sql = postgres(connectionString, { ssl: 'require' }); // krävs för Azure
  return sql;
}