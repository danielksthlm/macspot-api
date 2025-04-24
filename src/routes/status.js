console.log("✅ status.js är laddad!");

import { app } from '@azure/functions';
import pool from '../lib/db/db.js';

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

    return {
      status: 200,
      jsonBody: {
        message: "🎉 Det fungerar!",
        time: new Date().toISOString(),
        db: dbStatus
      }
    };
  }
});