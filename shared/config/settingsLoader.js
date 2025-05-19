module.exports = async function loadSettings(pool, context) {
  try {
    const settingsRes = await pool.query('SELECT key, value, value_type FROM booking_settings');
    const settings = {};
    for (const row of settingsRes.rows) {
      if (
        row.value_type === 'json' ||
        row.value_type === 'array' ||
        (typeof row.value_type === 'string' && /\[\]$/.test(row.value_type))
      ) {
        try {
          settings[row.key] = JSON.parse(typeof row.value === 'string' ? row.value : JSON.stringify(row.value));
        } catch (_) {}
      } else if (row.value_type === 'int') {
        settings[row.key] = parseInt(row.value);
      } else if (row.value_type === 'bool') {
        settings[row.key] = row.value === 'true' || row.value === true;
      } else if (row.value_type === 'string') {
        settings[row.key] = String(row.value).replace(/^"(.*)"$/, '$1');
      } else {
        settings[row.key] = row.value;
      }
    }
    return settings;
  } catch (err) {
    context.log(`⚠️ Fel vid laddning av booking_settings: ${err.message}`);
    throw err;
  }
};