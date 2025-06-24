const { getSettings } = require('../shared/config/settingsLoader');
const pool = require('../shared/db/pgPool');
const { v4: uuidv4 } = require('uuid');

module.exports = async function (context, req) {
  try {
    const email = req.body?.email || req.query?.email;
    const meeting_type = req.body?.meeting_type || req.query?.meeting_type;

    if (process.env.DEBUG === 'true') {
      context.log.info('🛠 DEBUG MODE ENABLED');
    }

    if (process.env.DEBUG === 'true') {
      context.log.info('📥 validate_contact triggered with:', { email, meeting_type });
    }

    if (!email || !meeting_type) {
      context.res = { status: 400, body: { error: "email and meeting_type are required" } };
      return;
    }

    const requiredEnv = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
    for (const key of requiredEnv) {
      if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
    }

    const contactRes = await pool.query(`
      SELECT c.*, ccr.id AS ccrelation_id, ccr.metadata AS ccrelation_metadata
      FROM contact c
      JOIN ccrelation ccr ON c.id = ccr.contact_id
      WHERE ccr.metadata->>'email' = $1
      LIMIT 1
    `, [email]);
    const contact = contactRes.rows[0];

    if ((req.body?.write_if_valid || req.query?.write_if_valid) && contact) {
      // Update existing contact if needed, merging metadata
      let metadataFromClient = req.body?.metadata;
      if (typeof metadataFromClient === 'string') {
        try {
          metadataFromClient = JSON.parse(metadataFromClient);
        } catch {
          metadataFromClient = {};
        }
      }
      if (typeof metadataFromClient === 'object' && metadataFromClient !== null) {
        // Fetch existing metadata
        const existing = await pool.query(`
          SELECT ccr.metadata FROM ccrelation ccr WHERE ccr.metadata->>'email' = $1
        `, [email]);
        const old = existing.rows[0]?.metadata || {};
        const merged = { ...old, ...metadataFromClient };

        // Update each key in metadata individually
        for (const [key, value] of Object.entries(merged)) {
          await pool.query(
            `UPDATE ccrelation
             SET metadata = jsonb_set(ccr.metadata, '{${key}}', to_jsonb($1), true),
                 updated_at = NOW()
             FROM ccrelation ccr
             WHERE ccr.metadata->>'email' = $2`,
            [value, email]
          );
        }
        context.log.info('✏️ Befintlig kontakt uppdaterad via validate_contact');
      }
    }

    if ((req.body?.write_if_valid || req.query?.write_if_valid) && !contact) {
      let metadataFromClient = req.body?.metadata;
      if (typeof metadataFromClient === 'string') {
        try {
          metadataFromClient = JSON.parse(metadataFromClient);
        } catch {
          metadataFromClient = {};
        }
      }
      if (typeof metadataFromClient === 'object' && metadataFromClient !== null) {
        metadataFromClient.origin = 'klrab.se';
        const newId = uuidv4();
        await pool.query(`
          INSERT INTO contact (id, metadata, created_at) VALUES ($1, $2, NOW())
        `, [newId, metadataFromClient]);

        const ccrelId = uuidv4();
        await pool.query(`
          INSERT INTO ccrelation (id, contact_id, company_id, role, metadata, created_at)
          VALUES ($1, $2, NULL, 'unknown', jsonb_build_object('email', $3), NOW())
        `, [ccrelId, newId, email]);

        context.log.info('✅ Ny kontakt skapad via validate_contact');

        if (process.env.DEBUG === 'true') {
          context.log.info('📤 Svarar med status: created');
        }

        context.res = {
          status: 200,
          body: {
            status: "created",
            contact_id: newId,
            ccrelation_id: ccrelId
          }
        };
        return;
      }
    }

    let metadata = {};
    if (contact) {
      const refreshed = await pool.query(`
        SELECT ccr.metadata FROM ccrelation ccr WHERE ccr.metadata->>'email' = $1
      `, [email]);
      metadata = refreshed.rows[0]?.metadata || {};
    }

    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }

    if (typeof metadata !== 'object' || metadata === null) metadata = {};

    if (process.env.DEBUG === 'true') {
      context.log.info('🧾 Metadata:', metadata);
    }

    const METADATA_KEYS = ['first_name', 'last_name', 'phone', 'company', 'address', 'postal_code', 'city', 'country'];
    const fullMetadata = Object.fromEntries(
      METADATA_KEYS.map(key => [key, metadata[key] ?? ''])
    );
    metadata = fullMetadata;

    const settings = await getSettings(context);
    const digitalTypes = Array.isArray(settings.meeting_digital) ? settings.meeting_digital : [];
    const isDigital = digitalTypes.map(t => t.toLowerCase()).includes(meeting_type.toLowerCase()) || meeting_type === 'atoffice';

    // Dynamically get required fields from booking_settings
    const allRequired = settings.required_fields || {};
    const requiredFields = Array.isArray(allRequired[meeting_type]) ? allRequired[meeting_type] : [];
    // Beräkna alltid missingFields från metadata som just lästs från databasen
    const missingFields = requiredFields.filter(
      field => !metadata[field] || typeof metadata[field] !== 'string' || metadata[field].trim() === ''
    );

    if (process.env.DEBUG === 'true') {
      context.log.info('📌 Saknade fält:', missingFields);
    }

    if (!contact) {
      if (process.env.DEBUG === 'true') {
        context.log.info('📤 Svarar med status: new_customer');
      }
      context.res = {
        status: 200,
        body: {
          status: "new_customer",
          missing_fields: missingFields
        }
      };
    } else if (missingFields.length > 0) {
      if (process.env.DEBUG === 'true') {
        context.log.info('📤 Svarar med status: incomplete');
      }
      context.res = {
        status: 200,
        body: {
          status: "incomplete",
          contact_id: contact.id,
          ccrelation_id: contact.ccrelation_id,
          missing_fields: missingFields,
          metadata
        }
      };
    } else {
      if (process.env.DEBUG === 'true') {
        context.log.info('📤 Svarar med status: existing_customer');
      }
      context.res = {
        status: 200,
        body: {
          status: "existing_customer",
          contact_id: contact.id,
          ccrelation_id: contact.ccrelation_id,
          metadata
        }
      };
    }

  } catch (error) {
    if (process.env.DEBUG === 'true') {
      context.log.error('❌ Error during validate_contact:', {
        message: error.message,
        stack: error.stack
      });
    }
    context.res = {
      status: 500,
      body: { error: error.message, stack: error.stack }
    };
  } finally {
    // Poolen är delad och återanvänds – vi stänger den inte här
  }
};