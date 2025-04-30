import fs from 'fs';
import path from 'path';
// import { getDb } from '../src/lib/db/db.js';
import pkg from 'pg';
const { Pool } = pkg;

const db = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false }
});

console.log("🛠️ index.js laddad!");
console.log("✅ getDb importerad!");

console.log("🔁 DB-konfig:", {
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE
});

context.log("📂 Nuvarande katalog:", __dirname);

export default async function (context, req) {
  let result;
  try {
    // const db = getDb();
    console.log("✅ getDb anropad, db =", db);
    // const fullPath = path.resolve('src/lib/db/db.js');
    // const fileExists = fs.existsSync(fullPath);
    // context.log(`🔍 Kontroll av db.js på ${fullPath} → ${fileExists}`);
    context.log.info('✅ DB client ready');

    result = await db.query(
      "SELECT value FROM booking_settings WHERE key = 'meeting_types'"
    );

    const values = result?.rows?.[0]?.value;
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: Array.isArray(values) ? values : []
    };
  } catch (error) {
    context.log.error('❌ Error during function execution:', {
      message: error.message,
      stack: error.stack,
      rawResult: result
    });
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: error.message,
        stack: error.stack,
        rawResult: result
      }
    };
  }
}