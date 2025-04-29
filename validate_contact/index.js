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

    const res = await pool.query('SELECT * FROM contact WHERE email = $1', [email]);

    if (res.rows.length === 0) {
      context.res = {
        status: 200,
        body: { status: "new_customer" }
      };
      return;
    }

    const contact = res.rows[0];
    const metadata = contact.metadata || {};
    const missingFields = [];

    if (!metadata.first_name) missingFields.push('first_name');
    if (!metadata.last_name) missingFields.push('last_name');
    if (!metadata.phone) missingFields.push('phone');
    if (!metadata.company) missingFields.push('company');

    if (meeting_type === 'atClient') {
      if (!metadata.address) missingFields.push('address');
      if (!metadata.postal_code) missingFields.push('postal_code');
      if (!metadata.city) missingFields.push('city');
      if (!metadata.country) missingFields.push('country');
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