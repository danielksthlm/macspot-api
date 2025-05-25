const { getSettings } = require('../shared/config/settingsLoader');
const pool = require('../shared/db/pgPool');
const { v4: uuidv4 } = require('uuid');
const { createDebugLogger } = require('../shared/utils/debugLogger');
const { createEvent } = require('../shared/calendar/msGraph')();

module.exports = async function (context, req) {
  context.log('📥 bookings/index.js startar');
  const requiredFields = ['meeting_type', 'meeting_length', 'slot_iso'];
  context.log('🔍 req.body:', req.body);
  const missing = requiredFields.filter(k => !req.body?.[k]);
  context.log('🔍 Saknade fält:', missing);

  if (missing.length > 0) {
    context.log('❌ Avbryter pga saknade fält');
    context.res = { status: 400, body: { error: `Missing fields: ${missing.join(', ')}` } };
    return;
  }

  const { email, meeting_type, meeting_length, slot_iso, contact_id, metadata = {} } = req.body;

  const parsedLength = parseInt(meeting_length, 10);
  if (isNaN(parsedLength) || parsedLength <= 0) {
    context.log('❌ Ogiltig möteslängd:', meeting_length);
    context.res = { status: 400, body: { error: "Invalid meeting_length" } };
    return;
  }

  const parsedStart = new Date(slot_iso);
  if (isNaN(parsedStart.getTime())) {
    context.log('❌ Ogiltigt slot_iso:', slot_iso);
    context.res = { status: 400, body: { error: "Invalid slot_iso datetime" } };
    return;
  }

  const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      context.log('❌ Saknar env:', key);
      context.res = { status: 500, body: { error: `Missing environment variable: ${key}` } };
      return;
    }
  }

  const db = await pool.connect();
  const debugHelper = createDebugLogger(context);
  const debugLog = debugHelper.debugLog;
  debugLog("🧠 debugLogger aktiv – DEBUG=" + process.env.DEBUG);
  try {
    // Läs in booking_settings
    const settings = await getSettings(context);

    const id = uuidv4();
    // Kontrollera om en bokning redan finns
    const existing = await db.query(
      'SELECT id FROM bookings WHERE contact_id = $1 AND start_time = $2',
      [contact_id || null, parsedStart.toISOString()]
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

    metadata.meeting_length = meeting_length;

    let online_link = null;
    if (meeting_type.toLowerCase() === 'teams' && contact_id && email) {
      const subject = metadata.subject || settings.default_meeting_subject || 'Möte';
      const location = metadata.location || 'Online';
      try {
        const eventResult = await createEvent({
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          subject,
          location,
          attendees: [email]
        });
        if (!eventResult) {
          context.log("⚠️ createEvent returnerade null");
        } else {
          context.log("📬 createEvent FULLT RESULTAT:", JSON.stringify(eventResult, null, 2));
          debugLog("📨 createEvent respons från Graph:", JSON.stringify(eventResult, null, 2));
        }
        if (eventResult?.onlineMeetingUrl) {
          online_link = eventResult.onlineMeetingUrl;
          metadata.online_link = online_link;
          metadata.subject = eventResult.subject || subject || settings.default_meeting_subject || 'Möte';
          metadata.location = eventResult.location || location || 'Online';
        }
      } catch (err) {
        debugLog('⚠️ createEvent misslyckades: ' + err.message);
        debugLog("❌ Detaljerat fel från createEvent:", err);
      }
    }

    const fields = {
      id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      meeting_type,
      metadata: metadata,
      created_at,
      updated_at,
      contact_id: contact_id || null,
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
      'INSERT INTO event_log (event_type, booking_id) VALUES ($1, $2)',
      ['booking_created', id]
    );
    debugLog(`✅ Bokning skapad: ${id}, typ: ${meeting_type}, längd: ${meeting_length}`);

    context.res = {
      status: 200,
      body: {
        status: 'booked',
        booking_id: id,
        calendar_invite_sent: !!online_link
      }
    };
  } catch (err) {
    context.log.error("❌ Booking error:", err.message);
    context.log.error("❌ Fullt felobjekt:", err);
    context.res = {
      status: 500,
      body: {
        error: err.message,
        stack: err.stack,
        full: JSON.stringify(err, Object.getOwnPropertyNames(err))
      }
    };
  } finally {
    db.release();
  }
};