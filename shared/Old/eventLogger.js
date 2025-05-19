async function logEvent(db, source, event_type, payload = {}) {
  try {
    await db.query(
      `INSERT INTO event_log (source, event_type, payload)
       VALUES ($1, $2, $3)`,
      [source, event_type, payload]
    );
  } catch (err) {
    console.error("❌ Misslyckades att logga händelse:", err);
  }
}

function logError(context, error) {
  console.error(`❌ [${context}]`, error);
}

function logWarning(context, key, error) {
  console.warn(`⚠️  [${context}] ${key}:`, error.message || error);
}

export { logEvent, logError, logWarning };