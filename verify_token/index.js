// 📄 Fil: request_verification/index.js
const pool = require('../shared/db/pgPool');
const { v4: uuidv4 } = require('uuid');
const { sendMail } = require('../shared/notification/sendMail');

module.exports = async function (context, req) {
  const email = req.body?.email;
  const action = req.body?.action; // "newsletter" eller "download_pdf"

  if (!email || !action) {
    context.res = { status: 400, body: { error: 'email och action krävs' } };
    return;
  }

  const token = uuidv4();
  const id = uuidv4();

  try {
    await pool.query(
      `INSERT INTO pending_verification (id, email, action, token, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [id, email, action, token]
    );

    const verifyLink = `https://klrab.se/verify?token=${token}`;
    const subject = action === 'newsletter'
      ? 'Bekräfta din prenumeration'
      : 'Ladda ned din fil – bekräfta e-post';

    const body = `
      <p>Hej!</p>
      <p>Klicka på länken nedan för att bekräfta din e-postadress:</p>
      <p><a href="${verifyLink}">${verifyLink}</a></p>
      <p>Om du inte begärt detta kan du ignorera meddelandet.</p>
    `;

    await sendMail({ to: email, subject, body });

    context.res = {
      status: 200,
      body: { status: 'ok', message: 'Verifieringsmejl skickat' }
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  }
};
