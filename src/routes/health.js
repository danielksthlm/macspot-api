import db from './db.js';

export async function runHealthcheck() {
  const result = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: 'unknown'
  };

  try {
    const [{ now }] = await db.raw('SELECT NOW()');
    result.db = now ? 'connected' : 'no response';
  } catch (err) {
    result.db = 'error';
    result.db_error = err.message;
  }

  console.log('📊 Healthcheck-resultat:', result);
  console.log('✅ Healthcheck kördes korrekt och returnerar svar.');
  return result;
}
