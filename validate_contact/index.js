const { Pool } = require('pg');

module.exports = async function (context, req) {
  let pool;
  try {

    const email = req.body?.email || req.query?.email;
    const meeting_type = req.body?.meeting_type || req.query?.meeting_type;
    context.log.info('📥 validate_contact triggered with:', { email, meeting_type });

    if (!email || !meeting_type) {
      context.res = {
        status: 400,
        body: { error: "email and meeting_type are required" }
      };
      context.log.info('📤 Validation status:', context.res.body);
      return;
    }

    const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
    for (const key of requiredEnv) {
      if (!process.env[key]) {
        throw new Error(`Missing environment variable: ${key}`);
      }
    }
    context.log.info('🔐 Environment variables verified');

    pool = new Pool({
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: { rejectUnauthorized: false }
    });

    const res = await pool.query('SELECT * FROM contact WHERE booking_email = $1', [email]);
    context.log.info('🔎 Contact lookup result:', res.rows[0]);

    if (res.rows.length === 0) {
      const missingFields = ['first_name', 'last_name', 'phone', 'company'];
      const settingsRes = await pool.query('SELECT value FROM booking_settings WHERE key = $1', ['meeting_digital']);
      const raw = settingsRes.rows[0]?.value;
      const meetingDigital = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
      const isDigital = meetingDigital.map(t => t.toLowerCase()).includes(meeting_type.toLowerCase()) || meeting_type === 'atOffice';
      if (!isDigital) {
        missingFields.push('address', 'postal_code', 'city', 'country');
      }
      context.res = {
        status: 200,
        body: {
          status: "new_customer",
          missing_fields: missingFields
        }
      };
      context.log.info('📤 Validation status (new):', context.res.body);
      return;
    }

    const contact = res.rows[0];
    let metadata = contact.metadata || {};
    // Om metadata är null, sätt en tomt objekt
    if (typeof metadata !== 'object' || metadata === null) {
      metadata = {};
    }
    context.log.info('🧾 Parsed metadata:', metadata);
    const missingFields = [];

    const settingsRes = await pool.query('SELECT value FROM booking_settings WHERE key = $1', ['meeting_digital']);
    const raw = settingsRes.rows[0]?.value;
    const meetingDigital = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    context.log.info('📁 meeting_digital types:', meetingDigital);

    const alwaysRequired = ['first_name', 'last_name', 'phone', 'company'];
    const addressRequired = ['address', 'postal_code', 'city', 'country'];

    alwaysRequired.forEach(field => {
      if (!metadata[field] || metadata[field].trim() === '') {
        missingFields.push(field);
      }
    });

    const isDigital = meetingDigital.map(t => t.toLowerCase()).includes(meeting_type.toLowerCase()) || meeting_type === 'atOffice';
    if (!isDigital) {
      addressRequired.forEach(field => {
        if (!metadata[field] || metadata[field].trim() === '') {
          missingFields.push(field);
        }
      });
    }

    if (missingFields.length > 0) {
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
    context.log.info('📤 Validation status:', context.res.body);

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
    if (pool) {
      await pool.end();
    }
  }
}