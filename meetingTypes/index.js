import db from '../../src/lib/db/db.js';

export async function getMeetingTypes() {
  const result = await db.query('SELECT * FROM meeting_types');
  return result.rows;
}
