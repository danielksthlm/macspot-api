export default async function (context, req) {
  let pool;
  try {
    const { Pool } = await import('pg');

    const { email, meeting_type } = req.body || {};
    if (!email || !meeting_type) {
      context.res = {
        status: 400,
        body: { error: "email and meeting_type are required" }
      };
      return;
    }

    pool = new Pool({
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: parseInt(process.env.PGPORT || '5432', 10),
      ssl: { rejectUnauthorized: false }
    });

    const res = await pool.query('SELECT * FROM contact WHERE booking_email = $1', [email]);

    if (res.rows.length === 0) {
      context.res = {
        status: 200,
        body: { status: "new_customer" }
      };
      return;
    }

    const contact = res.rows[0];
    let metadata = contact.metadata || {};
    // Om metadata är null, sätt en tomt objekt
    if (typeof metadata !== 'object' || metadata === null) {
      metadata = {};
    }
    const missingFields = [];

    const settingsRes = await pool.query('SELECT value FROM booking_settings WHERE key = $1', ['meeting_digital']);
    const meetingDigital = settingsRes.rows[0]?.value || [];

    const alwaysRequired = ['first_name', 'last_name', 'phone', 'company'];
    const addressRequired = ['address', 'postal_code', 'city', 'country'];

    alwaysRequired.forEach(field => {
      if (!metadata[field] || metadata[field].trim() === '') {
        missingFields.push(field);
      }
    });

    const isDigital = meetingDigital.includes(meeting_type) || meeting_type === 'atOffice';
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