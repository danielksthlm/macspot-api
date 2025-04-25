console.log("✅ status.js är laddad!");

import { app } from '@azure/functions';
import pool from '../lib/db/db.js';

const requiredEnv = [
  'PGHOST', 'PGUSER', 'PGDATABASE', 'PGPORT', 'PGPASSWORD',
  'MS365_CLIENT_ID', 'MS365_CLIENT_SECRET', 'MS365_TENANT_ID', 'MS365_USER_EMAIL',
  'APPLE_MAPS_TEAM_ID', 'APPLE_MAPS_KEY_ID', 'APPLE_MAPS_PRIVATE_KEY',
  'CALDAV_USER', 'CALDAV_PASSWORD', 'CALDAV_CALENDAR_URL'
];

app.http('status', {
  route: 'status',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async () => {
    let dbStatus = 'ok';
    try {
      await pool.query('SELECT 1');
    } catch (e) {
      dbStatus = 'error';
    }

    const missing = requiredEnv.filter((key) => !process.env[key]);
    const envStatus = missing.length === 0 ? 'ok' : `missing ${missing.length}`;

    return {
      status: 200,
      jsonBody: {
        message: "🎉 Det fungerar!",
        time: new Date().toISOString(),
        db: dbStatus,
        env: envStatus
      }
    };
  }
});