import fs from 'fs';
import path from 'path';
import { getDb } from '../src/lib/db/db.js';

context.log("📂 Nuvarande katalog:", __dirname);

export default async function (context, req) {
  let result;
  try {
    const db = getDb();
    const fileExists = fs.existsSync(path.resolve('src/lib/db/db.js'));
    context.log('🔍 Finns db.js i molnet?', fileExists);
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