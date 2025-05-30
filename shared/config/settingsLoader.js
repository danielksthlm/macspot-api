const pool = require("../db/pgPool");

async function getSettings(context) {
  try {
    const settings = {};
    const isDebug = process.env.DEBUG === 'true';
    const debugLog = (msg) => {
      if (isDebug && context && context.log) {
        context.log(msg);
      }
    };
    const settingsRes = await pool.query('SELECT key, value, value_type FROM booking_settings');
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
    settings.field_labels = {
      first_name: 'Förnamn',
      last_name: 'Efternamn',
      phone: 'Telefonnummer',
      company: 'Företag',
      address: 'Gatuadress',
      postal_code: 'Postnummer',
      city: 'Stad',
      country: 'Land'
    };
    return settings;
  } catch (err) {
    if (context && context.log) {
      context.log(`⚠️ Fel vid laddning av booking_settings: ${err.message}`);
    } else {
      console.warn(`⚠️ Fel vid laddning av booking_settings: ${err.message}`);
    }
    throw err;
  }
}

function getCloudSecretsOnly() {
  const secrets = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('MS365_')) {
      secrets[key] = value;
    }
  }
  return secrets;
}

module.exports = { getSettings, getCloudSecretsOnly };