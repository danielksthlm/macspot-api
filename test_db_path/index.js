import getDb from './db.js';
const db = getDb();

export async function handler(req, context) {
  try {
    await db.query('SELECT 1');
    return new Response(JSON.stringify({ message: '✅ db.js import and query worked' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    context.error('❌ Error executing db.js query:', err);
    return new Response(JSON.stringify({ error: 'Failed to query database', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}