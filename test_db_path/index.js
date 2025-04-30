import { readFile } from 'fs/promises';
import path from 'path';

export default async function (req, context) {
  try {
    const fullPath = path.resolve('./db.js');
    context.log('🔍 Försöker läsa:', fullPath);
    const content = await readFile(fullPath, 'utf-8');
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