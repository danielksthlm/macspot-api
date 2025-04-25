import { app } from '@azure/functions';
import { getDb } from '../lib/db/db.js';
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

    const requiredEnv = [
      'PGHOST', 'PGUSER', 'PGDATABASE', 'PGPORT', 'PGPASSWORD',
      'MS365_CLIENT_ID', 'MS365_CLIENT_SECRET', 'MS365_TENANT_ID', 'MS365_USER_EMAIL',
      'APPLE_MAPS_TEAM_ID', 'APPLE_MAPS_KEY_ID', 'APPLE_MAPS_PRIVATE_KEY',
      'CALDAV_USER', 'CALDAV_PASSWORD', 'CALDAV_CALENDAR_URL'
    ];

    result.env = {};
    for (const key of requiredEnv) {
      result.env[key] = process.env[key] ? 'ok' : 'missing';
    }

    const missingKeys = Object.entries(result.env)
      .filter(([_, v]) => v === 'missing')
      .map(([k]) => k);

    if (missingKeys.length > 0) {
      result.status = 'degraded';
      context.log("❗ Saknade miljövariabler:", missingKeys);
      result.warning = `Saknade miljövariabler: ${missingKeys.join(', ')}`;
    }

    context.log('📊 Healthcheck-resultat:', result);
    context.telemetry.trackEvent({
      name: "HealthCheckRun",
      properties: {
        timestamp: result.timestamp,
        db: result.db,
        ...Object.fromEntries(
          Object.entries(result.env).map(([key, value]) => [`env_${key}`, value])
        )
      }
    });

    result.appVersion = process.env.VERSION || 'dev';
    result.environment = process.env.NODE_ENV || 'development';

    if (result.db_error) {
      context.error("🛑 Databasfel:", result.db_error);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
