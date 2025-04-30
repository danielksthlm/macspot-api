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

export default async function (context, req) {
  let result;
  try {
    context.log("📍 Funktion 'meeting_types' startad");
    context.log("🧪 DB-konfig:", {
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE
    });

    context.log("🔗 Försöker ansluta till databasen...");
    const client = await db.connect();
    context.log("✅ Ansluten till databasen");

    result = await client.query(
      "SELECT value FROM booking_settings WHERE key = 'meeting_types'"
    );

    context.log("📦 Query-resultat:", result?.rows);

    client.release();

    const values = result?.rows?.[0]?.value;
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: Array.isArray(values) ? values : []
    };
  } catch (error) {
    context.log.error('❌ Fel under körning:', {
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