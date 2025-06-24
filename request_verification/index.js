const pool = require('../shared/db/pgPool');
const { sendMail } = require('../shared/notification/sendMail');
const { v4: uuidv4 } = require('uuid');

module.exports = async function (context, req) {
  const token = req.body?.token || req.query?.token;

  if (!token) {
    context.res = { status: 400, body: { error: 'token krävs' } };
    return;
  }

  try {
    // Rensa gamla tokens som aldrig använts (äldre än 2 dagar)
    await pool.query(`
      DELETE FROM pending_verification
      WHERE used_at IS NULL AND created_at < NOW() - INTERVAL '2 days'
    `);
    const res = await pool.query(
      `SELECT email, metadata, created_at FROM pending_verification WHERE token = $1 AND used_at IS NULL LIMIT 1`,
      [token]
    );
    const row = res.rows[0];

    if (!row) {
      context.res = { status: 404, body: { error: 'Ogiltig eller redan använd token' } };
      return;
    }

    const createdAt = new Date(row.metadata?.created_at || row.created_at);
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24h
    if (Date.now() - createdAt.getTime() > maxAgeMs) {
      context.res = { status: 410, body: { error: 'Token har gått ut' } };
      return;
    }

    const { email, metadata } = row;
    const action = metadata?.action;

    if (action === 'newsletter') {
      // Kontrollera om kontakt redan finns
      const contactRes = await pool.query(
        `SELECT c.id AS contact_id, ccr.id AS ccrelation_id, ccr.metadata
         FROM contact c
         JOIN ccrelation ccr ON c.id = ccr.contact_id
         WHERE ccr.metadata->>'email' = $1
         LIMIT 1`,
        [email]
      );
      if (contactRes.rows.length > 0) {
        const ccrelation_id = contactRes.rows[0].ccrelation_id;
        await pool.query(
          `UPDATE ccrelation
           SET metadata = jsonb_set(metadata, '{subscribed_to_newsletter}', 'true'::jsonb, true),
               updated_at = NOW()
           WHERE id = $1`,
          [ccrelation_id]
        );
      } else {
        const newContactId = uuidv4();
        await pool.query(
          `INSERT INTO contact (id, created_at) VALUES ($1, NOW())`,
          [newContactId]
        );

        const newRelationId = uuidv4();
        await pool.query(
          `INSERT INTO ccrelation (id, contact_id, metadata, role, created_at)
           VALUES ($1, $2, $3, 'newsletter', NOW())`,
          [newRelationId, newContactId, { email, subscribed_to_newsletter: true }]
        );
      }

      await pool.query(
        `UPDATE pending_verification SET used_at = NOW() WHERE token = $1`,
        [token]
      );

      context.res = {
        status: 200,
        body: { status: 'confirmed', message: 'Prenumerationen är nu bekräftad.' }
      };
      return;
    }

    if (action === 'download_pdf') {
      await pool.query(
        `UPDATE pending_verification SET used_at = NOW() WHERE token = $1`,
        [token]
      );
      context.res = {
        status: 200,
        body: {
          status: 'confirmed',
          download_url: 'https://klrab.se/files/whitepaper.pdf'
        }
      };
      return;
    }

    context.res = {
      status: 400,
      body: { error: 'Okänd åtgärd kopplad till token.' }
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  }
};