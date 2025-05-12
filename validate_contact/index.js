const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: parseInt(process.env.PGPORT || '5432', 10),
  ssl: { rejectUnauthorized: false }
});

module.exports = async function (context, req) {
  try {
    const email = req.body?.email || req.query?.email;
    const meeting_type = req.body?.meeting_type || req.query?.meeting_type;
    context.log.info('📥 validate_contact triggered with:', { email, meeting_type });

    if (!email || !meeting_type) {
      context.res = { status: 400, body: { error: "email and meeting_type are required" } };
      return;
    }

    const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
    for (const key of requiredEnv) {
      if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
    }

    const contactRes = await pool.query('SELECT * FROM contact WHERE booking_email = $1', [email]);
    const contact = contactRes.rows[0];
    let metadata = contact?.metadata || {};

    if (typeof metadata !== 'object' || metadata === null) metadata = {};

    const settingsRes = await pool.query('SELECT value FROM booking_settings WHERE key = $1', ['meeting_digital']);
    const raw = settingsRes.rows[0]?.value;
    const digitalTypes = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    const isDigital = digitalTypes.map(t => t.toLowerCase()).includes(meeting_type.toLowerCase()) || meeting_type === 'atOffice';

    const alwaysRequired = ['first_name', 'last_name', 'phone', 'company'];
    const addressRequired = ['address', 'postal_code', 'city', 'country'];

    const missingFields = [...alwaysRequired, ...(isDigital ? [] : addressRequired)].filter(
      field => !metadata[field] || typeof metadata[field] !== 'string' || metadata[field].trim() === ''
    );

    if ((req.body?.write_if_valid || req.query?.write_if_valid) && missingFields.length > 0) {
      const metadataFromClient = req.body?.metadata;
      if (typeof metadataFromClient === 'object' && metadataFromClient !== null) {
        if (!contact) {
          await pool.query(
            `INSERT INTO contact (booking_email, metadata, created_at) VALUES ($1, $2, NOW())`,
            [email, metadataFromClient]
          );
          context.log.info('✅ Ny kontakt skapad via validate_contact');
        } else {
          await pool.query(
            `UPDATE contact SET metadata = $1, updated_at = NOW() WHERE booking_email = $2`,
            [metadataFromClient, email]
          );
          context.log.info('✏️ Befintlig kontakt uppdaterad via validate_contact');
        }
      }
    }

    if (!contact) {
      context.res = {
        status: 200,
        body: {
          status: "new_customer",
          missing_fields: missingFields
        }
      };
    } else if (missingFields.length > 0) {
      context.res = {
        status: 200,
        body: {
          status: "incomplete",
          missing_fields: missingFields
        }
      };
    } else {
      context.res = {
        status: 200,
        body: { status: "ok" }
      };
    }

  } catch (error) {
    context.log.error('❌ Error during validate_contact:', {
      message: error.message,
      stack: error.stack
    });
    context.res = {
      status: 500,
      body: { error: error.message, stack: error.stack }
    };
  } finally {
    // Poolen är delad och återanvänds – vi stänger den inte här
  }
};