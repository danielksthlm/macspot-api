const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

module.exports = async function (context, req) {
  const requiredFields = ['meeting_type', 'meeting_length', 'slot_iso'];
  const missing = requiredFields.filter(k => !req.body?.[k]);

  if (missing.length > 0) {
    context.res = { status: 400, body: { error: `Missing fields: ${missing.join(', ')}` } };
    return;
  }

  const { email, meeting_type, meeting_length, slot_iso, metadata = {} } = req.body;

  const parsedLength = parseInt(meeting_length, 10);
  if (isNaN(parsedLength) || parsedLength <= 0) {
    context.res = { status: 400, body: { error: "Invalid meeting_length" } };
    return;
  }

  const parsedStart = new Date(slot_iso);
  if (isNaN(parsedStart.getTime())) {
    context.res = { status: 400, body: { error: "Invalid slot_iso datetime" } };
    return;
  }

  const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      context.res = { status: 500, body: { error: `Missing environment variable: ${key}` } };
      return;
    }
  }

  const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '5432', 10),
    ssl: { rejectUnauthorized: false }
  });

  const db = await pool.connect();
  try {
    // Läs in booking_settings
    const settingsRes = await db.query('SELECT key, value, value_type FROM booking_settings');
    const settings = {};
    for (const row of settingsRes.rows) {
      let val = row.value;
      if (row.value_type === 'int') {
        val = parseInt(val);
      } else if (row.value_type === 'bool') {
        val = val === 'true' || val === true;
      } else if (row.value_type === 'json' || row.value_type === 'array') {
        try {
          val = JSON.parse(typeof val === 'string' ? val : JSON.stringify(val));
        } catch (_) {}
      } else if (typeof val === 'string') {
        val = val.replace(/^"(.*)"$/, '$1'); // trimma citattecken
      }
      settings[row.key] = val;
    }

    const id = uuidv4();
    // Kontrollera om en bokning redan finns
    const existing = await db.query(
      'SELECT id FROM bookings WHERE contact_id = $1 AND start_time = $2',
      [metadata.contact_id || null, parsedStart.toISOString()]
    );
    if (existing.rowCount > 0) {
      context.res = {
        status: 409,
        body: { error: 'Booking already exists for this time.' }
      };
      return;
    }
    const startTime = parsedStart;
    const endTime = new Date(startTime.getTime() + parsedLength * 60000);
    const created_at = new Date();
    const updated_at = created_at;

    // Bygg meeting_link dynamiskt
    let meeting_link = null;
    if (meeting_type.toLowerCase() === 'teams') {
      meeting_link = 'https://teams.microsoft.com/l/meetup-join/...'; // placeholder
    } else if (meeting_type.toLowerCase() === 'zoom') {
      meeting_link = 'https://zoom.us/j/1234567890'; // placeholder
    } else if (meeting_type.toLowerCase() === 'facetime' && metadata.phone) {
      meeting_link = `facetime:${metadata.phone}`;
    }

    const fields = {
      id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      meeting_type,
      metadata: JSON.stringify(metadata),
      created_at,
      updated_at,
      contact_id: metadata.contact_id || null,
      booking_email: email || null
    };

    const query = `
      INSERT INTO bookings (
        id, start_time, end_time, meeting_type,
        metadata, created_at, updated_at,
        contact_id, booking_email
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9
      )
    `;

    const values = Object.values(fields);
    await db.query(query, values);
    // Logga pending change för denna bokning
    await db.query(
      `INSERT INTO pending_changes (id, table_name, record_id, change_type, direction, processed, created_at, booking_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        uuidv4(),
        'bookings',
        id,
        'INSERT',
        'cloud_to_local',
        false,
        new Date(),
        id
      ]
    );
    // Simulera att kalendern synkades för denna demo
    fields.synced_to_calendar = true;
    await db.query(
      'INSERT INTO event_log (event_type, booking_id, created_at) VALUES ($1, $2, NOW())',
      ['booking_created', id]
    );

    context.res = {
      status: 200,
      body: {
        status: 'booked',
        booking_id: id,
        calendar_invite_sent: false // kan uppdateras om Graph-mail läggs in här
      }
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  } finally {
    db.release();
  }
};

// --- Send confirmation email via Microsoft Graph ---
const fetch = require('node-fetch');

async function sendConfirmationEmail({ to, startTime, endTime, meeting_type, meeting_link, first_name, sender_email }) {
  const token = await getGraphAccessToken();

  const subject = `Din bokning är bekräftad – ${meeting_type}`;
  const content = `
    <p>Hej ${first_name || ''},</p>
    <p>Din bokning den ${startTime.toLocaleDateString()} kl ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} är nu bekräftad.</p>
    <p><strong>Mötestyp:</strong> ${meeting_type}</p>
    <p><strong>Länk:</strong> <a href="${meeting_link}">${meeting_link}</a></p>
    <p>Vi ser fram emot att ses!</p>
    <p>Vänligen,<br/>Daniel</p>
  `;

  const body = {
    message: {
      subject,
      body: {
        contentType: 'HTML',
        content
      },
      toRecipients: [
        {
          emailAddress: {
            address: to
          }
        }
      ]
    },
    saveToSentItems: true
  };

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender_email)}/sendMail`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`E-postmisslyckande: ${err}`);
  }
}

async function getGraphAccessToken() {
  const params = new URLSearchParams();
  params.append('client_id', process.env.GRAPH_CLIENT_ID);
  params.append('client_secret', process.env.GRAPH_CLIENT_SECRET);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('grant_type', 'client_credentials');
  const response = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Misslyckad tokenhämtning: ${err}`);
  }

  const data = await response.json();
  return data.access_token;
}