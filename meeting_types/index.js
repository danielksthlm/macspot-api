import { getDb } from '../shared/db.js';

export default async function (context, req) {
  const db = getDb();
  if (!db) throw new Error("Kunde inte initiera DB");

  const result = await db`SELECT NOW()`;
  context.log("🕒 Tid från databasen:", result);

  context.res = {
    status: 200,
    body: result
  };
}