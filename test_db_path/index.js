import { readFile } from 'fs/promises';

export default async function (req, context) {
  try {
    context.log('🔍 Försöker läsa ./src/lib/db/db.js...');
    const content = await readFile('./src/lib/db/db.js', 'utf-8');
    context.log('✅ db.js hittades och kunde läsas!');
    return new Response(JSON.stringify({ exists: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    context.log('❌ Kunde inte läsa db.js:', err.message);
    return new Response(JSON.stringify({ exists: false, error: err.message }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}