


export default async function (context, req) {
  let pool;
  try {
    const { Pool } = await import('pg');

    const { email, meeting_type, first_name, last_name, phone, company, address, postal_code, city, country } = req.body || {};

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

    // Kontrollera om kontakt finns
    const res = await pool.query('SELECT id, metadata FROM contact WHERE booking_email = $1', [email]);

    let metadata = {
      first_name,
      last_name,
      phone,
      company,
      address,
      postal_code,
      city,
      country
    };

    if (res.rows.length > 0) {
      // Uppdatera befintlig kontakt
      const existingMetadata = res.rows[0].metadata || {};
      const updatedMetadata = { ...existingMetadata, ...metadata };

      await pool.query('UPDATE contact SET metadata = $1 WHERE id = $2', [updatedMetadata, res.rows[0].id]);
      context.res = {
        status: 200,
        body: { status: "updated" }
      };
    } else {
      // Skapa ny kontakt
      const id = crypto.randomUUID();
      await pool.query(
        'INSERT INTO contact (id, booking_email, metadata, created_at) VALUES ($1, $2, $3, NOW())',
        [id, email, metadata]
      );
      context.res = {
        status: 201,
        body: { status: "created" }
      };
    }
  } catch (error) {
    context.log.error('❌ Error during update_contact:', {
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