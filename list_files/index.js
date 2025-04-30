import { readdir } from 'fs/promises';

export default async function (req, context) {
  try {
    const files = await readdir('./', { withFileTypes: true });
    const fileList = files.map(f => ({
      name: f.name,
      type: f.isDirectory() ? 'dir' : 'file'
    }));
    return new Response(JSON.stringify(fileList, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}