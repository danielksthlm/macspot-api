import { app } from '@azure/functions';
import getDb from '../lib/db/db.js';
const db = getDb();

app.http('healthcheck', {
  route: 'health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (_req, context) => {
    const result = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: 'unknown'
    };

    try {
      const res = await db.query('SELECT NOW()');
      result.db = res.rows?.length > 0 ? 'connected' : 'no response';
    } catch (err) {
      result.db = 'error';
      result.db_error = err.message;
    }

    context.log('📊 Healthcheck-resultat:', result);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
