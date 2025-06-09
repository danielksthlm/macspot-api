const pool = require('../shared/db/pgPool');

module.exports = async function (context, req) {
  const token = req.query.token || (req.body && req.body.token);

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
    const result = await pool.query(
      `SELECT email, metadata, created_at FROM pending_verification WHERE token = $1 AND used_at IS NULL LIMIT 1`,
      [token]
    );

    if (result.rowCount === 0) {
      context.res = { status: 404, body: { error: 'Ogiltig eller använd token' } };
      return;
    }

    const row = result.rows[0];
    const createdAt = new Date(row.metadata?.created_at || row.created_at);
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24h
    if (Date.now() - createdAt.getTime() > maxAgeMs) {
      context.res = { status: 410, body: { error: 'Token har gått ut' } };
      return;
    }

    const { email, metadata } = row;
    const action = metadata?.action;

    await pool.query(
      `UPDATE pending_verification SET used_at = NOW() WHERE token = $1`,
      [token]
    );

    // Logga event efter att token är bekräftad som giltig
    if (action === 'newsletter') {
      await pool.query(
        `INSERT INTO event_log (event_type, payload, created_at)
         VALUES ($1, $2, NOW())`,
        ['newsletter_verified', { email }]
      );
    } else if (action === 'download_pdf') {
      await pool.query(
        `INSERT INTO event_log (event_type, payload, created_at)
         VALUES ($1, $2, NOW())`,
        ['pdf_verified', { email, action }]
      );
    }

    context.res = {
      status: 200,
      body: { email, action }
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  }
};
