import fs from 'fs';

export async function handler(req, context) {
  const path = './src/lib/db/db.js';
  const exists = fs.existsSync(path);
  context.log("🔍 db.js finns?", exists);
  return new Response(JSON.stringify({ exists }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}