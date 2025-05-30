const { getSettings } = require('../shared/config/settingsLoader');
const pool = require('../shared/db/pgPool');
const { v4: uuidv4 } = require('uuid');
const { createDebugLogger } = require('../shared/utils/debugLogger');
const graphClient = require('../shared/calendar/msGraph')();
const createZoomClient = require('../shared/calendar/zoomClient');
const zoomClient = createZoomClient();
const { sendMail } = require('../shared/notification/sendMail');

module.exports = async function (context, req) {
  context.log('📥 bookings/index.js startar');
  const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'unknown';
  context.log(`🌐 IP: ${ipAddress}`);
  context.log(`🧭 User-Agent: ${userAgent}`);
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

  let db;
  try {
    db = await pool.connect();

    const contactRes = await db.query('SELECT metadata FROM contact WHERE id = $1', [contact_id]);
    const dbMetadata = (contactRes.rows[0] && contactRes.rows[0].metadata) || {};
    const combinedMetadata = { ...dbMetadata, ...metadata };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      context.log('❌ Ogiltig eller saknad e-postadress:', email);
      context.res = {
        status: 400,
        body: { error: 'Ogiltig eller saknad e-postadress' }
      };
      db.release();
      return;
    }

    const parsedLength = parseInt(meeting_length, 10);
    if (isNaN(parsedLength) || parsedLength <= 0) {
      context.log('❌ Ogiltig möteslängd:', meeting_length);
      context.res = { status: 400, body: { error: "Invalid meeting_length" } };
      db.release();
      return;
    }

    const parsedStart = new Date(slot_iso);
    if (isNaN(parsedStart.getTime())) {
      context.log('❌ Ogiltigt slot_iso:', slot_iso);
      context.res = { status: 400, body: { error: "Invalid slot_iso datetime" } };
      db.release();
      return;
    }

    const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
    for (const key of requiredEnv) {
      if (!process.env[key]) {
        context.log('❌ Saknar env:', key);
        context.res = { status: 500, body: { error: `Missing environment variable: ${key}` } };
        db.release();
        return;
      }
    }

    const debugHelper = createDebugLogger(context);
    const debugLog = debugHelper.debugLog || ((...args) => context.log('[⚠️ fallback log]', ...args));
    debugLog("🧠 debugLogger aktiv – DEBUG=" + process.env.DEBUG);
    // Läs in booking_settings
    const settings = await getSettings(context);
    const emailBodyTemplates = settings.email_body_templates || {};

    // Kontrollera att alla required_fields finns i metadata eller req.body
    const requiredFieldsConfig = settings.required_fields || {};
    const baseFields = Array.isArray(requiredFieldsConfig.base) ? requiredFieldsConfig.base : [];
    const specificFields = Array.isArray(requiredFieldsConfig[meeting_type.toLowerCase()])
      ? requiredFieldsConfig[meeting_type.toLowerCase()]
      : [];
    const requiredFieldsFromSettings = [...new Set([...baseFields, ...specificFields])];
    const missingRequired = requiredFieldsFromSettings.filter(field => {
      return !(field in req.body) && !(field in combinedMetadata);
    });

    if (missingRequired.length > 0) {
      context.log('❌ Saknade obligatoriska fält enligt settings:', missingRequired);
      context.res = {
        status: 400,
        body: { error: `Saknade obligatoriska fält: ${missingRequired.join(', ')}` }
      };
      db.release();
      return;
    }

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
      db.release();
      return;
    }
    const startTime = parsedStart;
    const endTime = new Date(startTime.getTime() + parsedLength * 60000);
    const created_at = new Date();
    const updated_at = created_at;


    combinedMetadata.meeting_length = meeting_length;
    combinedMetadata.ip_address = ipAddress;
    combinedMetadata.user_agent = userAgent;

    const bookingFields = {
      id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      meeting_type,
      metadata: combinedMetadata,
      created_at,
      updated_at,
      contact_id: contact_id || null,
      booking_email: email || null
    };

    let online_link = null;
    if (meeting_type.toLowerCase() === 'teams' && contact_id && email) {
      const subjectTemplates = settings.email_subject_templates || {};
      const subjectTemplate = subjectTemplates[meeting_type.toLowerCase()] || settings.default_meeting_subject || 'Möte';
      const emailSubject = subjectTemplate
        .replace('{{first_name}}', combinedMetadata.first_name || '')
        .replace('{{company}}', combinedMetadata.company || 'din organisation');
      const location = combinedMetadata.location || 'Online';
      try {
        const eventResult = await graphClient.createEvent({
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          subject: emailSubject,
          location,
          attendees: [email]
        });
        if (!eventResult) {
          context.log("⚠️ createEvent returnerade null");
        }
        if (eventResult?.onlineMeetingUrl) {
          online_link = eventResult.onlineMeetingUrl;
          combinedMetadata.online_link = online_link;
          combinedMetadata.subject = eventResult.subject || emailSubject || settings.default_meeting_subject || 'Möte';
          combinedMetadata.location = eventResult.location || location || 'Online';
        }

        // Extrahera mötesinfo från bodyPreview oavsett joinUrl
        const body = eventResult?.body?.content || '';
        const idMatch = body.match(/Mötes-ID:\s*(\d[\d\s]*)/);
        const pwMatch = body.match(/Lösenord:\s*([A-Za-z0-9]+)/);

        if (idMatch) combinedMetadata.meeting_id = idMatch[1].trim();
        if (pwMatch) combinedMetadata.passcode = pwMatch[1].trim();
        if (body && !eventResult?.onlineMeetingUrl) {
          combinedMetadata.body_preview = body;
        }

        bookingFields.synced_to_calendar = true;
      } catch (err) {
        // loggar för misslyckade createEvent tas bort enligt instruktion
      }
    } else if (meeting_type.toLowerCase() === 'zoom') {
      try {
        const result = await zoomClient.createMeeting({
          topic: combinedMetadata.subject || settings.default_meeting_subject,
          start: startTime.toISOString(),
          duration: parsedLength
        });
        online_link = result.join_url;
        combinedMetadata.online_link = online_link;
        combinedMetadata.meeting_id = result.id;
        combinedMetadata.subject = result.topic;
        combinedMetadata.location = 'Online';

        // Generate email subject and body using settings and injected online_link
        const subjectTemplates = settings.email_subject_templates || {};
        const subjectTemplate = subjectTemplates[meeting_type.toLowerCase()] || settings.default_meeting_subject || 'Möte';
        const emailSubject = subjectTemplate
          .replace('{{first_name}}', combinedMetadata.first_name || '')
          .replace('{{company}}', combinedMetadata.company || 'din organisation');
        const emailBodyTemplate = emailBodyTemplates[meeting_type.toLowerCase()] || '';
        const emailBody = emailBodyTemplate
          .replace('{{first_name}}', combinedMetadata.first_name || '')
          .replace('{{company}}', combinedMetadata.company || '')
          .replace('{{start_time}}', startTime.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }))
          .replace('{{end_time}}', endTime.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }))
          .replace('{{location}}', combinedMetadata.location || '')
          .replace('{{phone}}', combinedMetadata.phone || '')
          .replace('{{online_link}}', online_link || '');
        const emailSignature = settings.email_signature || '';
        const finalEmailBody = emailBody + '\n\n' + emailSignature;

        // Skicka e-post via Graph (placeholder – implementera din mailfunktion)
        try {
          await sendMail({
            to: email,
            subject: emailSubject,
            body: finalEmailBody,
          });
          debugLog('✅ Zoominbjudan skickad via e-post');
        } catch (emailErr) {
        }

        bookingFields.synced_to_calendar = true;
      } catch (err) {
      }
    } else if (meeting_type.toLowerCase() === 'facetime') {
      if (combinedMetadata.phone) {
        online_link = `facetime:${combinedMetadata.phone}`;
        combinedMetadata.online_link = online_link;
        const subjectTemplates = settings.email_subject_templates || {};
        const subjectTemplate = subjectTemplates[meeting_type.toLowerCase()] || settings.default_meeting_subject || 'Möte';
        const emailSubject = subjectTemplate
          .replace('{{first_name}}', combinedMetadata.first_name || '')
          .replace('{{company}}', combinedMetadata.company || 'din organisation');
        combinedMetadata.subject = combinedMetadata.subject || emailSubject || 'FaceTime';
        combinedMetadata.location = combinedMetadata.location || 'FaceTime';

        try {
          const emailBodyTemplate = emailBodyTemplates[meeting_type.toLowerCase()] || '';
          const emailBody = emailBodyTemplate
            .replace('{{first_name}}', combinedMetadata.first_name || '')
            .replace('{{company}}', combinedMetadata.company || '')
            .replace('{{start_time}}', startTime.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }))
            .replace('{{end_time}}', endTime.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }))
            .replace('{{location}}', combinedMetadata.location || '')
            .replace('{{phone}}', combinedMetadata.phone || '')
            .replace('{{online_link}}', online_link || '');
          const emailSignature = settings.email_signature || '';
          const finalEmailBody = emailBody + '\n\n' + emailSignature;

          await sendMail({ to: email, subject: emailSubject, body: finalEmailBody });
          debugLog('✅ FaceTime-inbjudan skickad via e-post');
        } catch (emailErr) {
        }
      } else {
      }
    } else if (meeting_type.toLowerCase() === 'atclient') {
      combinedMetadata.location = combinedMetadata.location || combinedMetadata.address || settings.default_home_address || 'Hos kund';
      const subjectTemplates = settings.email_subject_templates || {};
      const subjectTemplate = subjectTemplates[meeting_type.toLowerCase()] || settings.default_meeting_subject || 'Möte';
      const emailSubject = subjectTemplate
        .replace('{{first_name}}', combinedMetadata.first_name || '')
        .replace('{{company}}', combinedMetadata.company || 'din organisation');
      combinedMetadata.subject = combinedMetadata.subject || emailSubject || 'Möte hos kund';

      try {
        const emailBodyTemplate = emailBodyTemplates[meeting_type.toLowerCase()] || '';
        const emailBody = emailBodyTemplate
          .replace('{{first_name}}', combinedMetadata.first_name || '')
          .replace('{{company}}', combinedMetadata.company || '')
          .replace('{{start_time}}', startTime.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }))
          .replace('{{end_time}}', endTime.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }))
          .replace('{{location}}', combinedMetadata.location || '')
          .replace('{{phone}}', combinedMetadata.phone || '')
          .replace('{{online_link}}', online_link || '');
        const emailSignature = settings.email_signature || '';
        const finalEmailBody = emailBody + '\n\n' + emailSignature;

        await sendMail({ to: email, subject: emailSubject, body: finalEmailBody });
        debugLog('✅ atClient-inbjudan skickad via e-post');
      } catch (emailErr) {
      }
    } else if (meeting_type.toLowerCase() === 'atoffice') {
      combinedMetadata.location = combinedMetadata.location || settings.default_office_address || 'Kontoret';
      const subjectTemplates = settings.email_subject_templates || {};
      const subjectTemplate = subjectTemplates[meeting_type.toLowerCase()] || settings.default_meeting_subject || 'Möte';
      const emailSubject = subjectTemplate
        .replace('{{first_name}}', combinedMetadata.first_name || '')
        .replace('{{company}}', combinedMetadata.company || 'din organisation');
      combinedMetadata.subject = combinedMetadata.subject || emailSubject || 'Möte på kontoret';

      try {
        const emailBodyTemplate = emailBodyTemplates[meeting_type.toLowerCase()] || '';
        const emailBody = emailBodyTemplate
          .replace('{{first_name}}', combinedMetadata.first_name || '')
          .replace('{{company}}', combinedMetadata.company || '')
          .replace('{{start_time}}', startTime.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }))
          .replace('{{end_time}}', endTime.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }))
          .replace('{{location}}', combinedMetadata.location || '')
          .replace('{{phone}}', combinedMetadata.phone || '')
          .replace('{{online_link}}', online_link || '');
        const emailSignature = settings.email_signature || '';
        const finalEmailBody = emailBody + '\n\n' + emailSignature;

        await sendMail({ to: email, subject: emailSubject, body: finalEmailBody });
        debugLog('✅ atOffice-inbjudan skickad via e-post');
      } catch (emailErr) {
      }
    }

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
    /*
    const values = Object.values(bookingFields);
    */
    const values = [
      bookingFields.id,
      bookingFields.start_time,
      bookingFields.end_time,
      bookingFields.meeting_type,
      bookingFields.metadata,
      bookingFields.created_at,
      bookingFields.updated_at,
      bookingFields.contact_id,
      bookingFields.booking_email
    ];
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
    context.log.error("📦 Request body:", req.body);
    context.log.error("🌐 IP:", ipAddress);
    context.log.error("🧭 User-Agent:", userAgent);
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
    if (db) db.release();
  }
};