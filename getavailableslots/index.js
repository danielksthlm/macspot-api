import fetch from 'node-fetch';
import pkg from 'pg';
const { Pool } = pkg;

export const run = async function (context, req) {
  context.log('🟢 getavailableslots index.js startar...');
  context.log('✅ Funktion getavailableslots anropad');

  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  const pgConfig = {
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '5432', 10),
    ssl: { rejectUnauthorized: false }
  };

  async function getAccessToken() {
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      })
    });

    const data = await res.json();
    if (!data.access_token) throw new Error('❌ Kunde inte hämta access token');
    return data.access_token;
  }

  async function fetchGraph(endpoint, method = 'GET', body = null) {
    const token = await getAccessToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return await res.json();
  }

  try {
    // Extrahera meeting_type från req.body
    const { meeting_type } = req.body;
    if (!meeting_type) {
      context.res = {
        status: 400,
        body: { error: 'meeting_type saknas i request body.' }
      };
      return;
    }

    const pool = new Pool(pgConfig);
    // Hämta room_priority från booking_settings
    const priorityResult = await pool.query("SELECT value FROM booking_settings WHERE key = 'room_priority'");
    const roomPriority = priorityResult.rows[0]?.value || {};
    const selectedRooms = roomPriority[meeting_type] || [];
    context.log(`🏢 Valda rum för meeting_type ${meeting_type}:`, selectedRooms);

    // Använd valda rum istället för tidigare roomList
    const roomList = selectedRooms;

    if (roomList.length === 0) {
      context.res = {
        status: 404,
        body: { error: `Inga rum hittades för meeting_type '${meeting_type}' i booking_settings.` }
      };
      return;
    }

    const testRoom = roomList[0];
    const today = new Date().toISOString().split('T')[0];
    const body = {
      schedules: [testRoom],
      startTime: { dateTime: `${today}T08:00:00`, timeZone: 'Europe/Stockholm' },
      endTime: { dateTime: `${today}T17:00:00`, timeZone: 'Europe/Stockholm' },
      availabilityViewInterval: 30
    };

    const scheduleResponse = await fetchGraph('/me/calendar/getSchedule', 'POST', body);
    context.log(`📅 getSchedule-test för ${testRoom}:`, JSON.stringify(scheduleResponse, null, 2));

    // Tolka availabilityView och hitta första luckan med minst 60 minuter ledigt (2 block)
    const availability = scheduleResponse.value?.[0]?.availabilityView;
    const blocksNeeded = 60 / 30;

    let foundSlot = null;
    if (availability) {
      for (let i = 0; i <= availability.length - blocksNeeded; i++) {
        const block = availability.slice(i, i + blocksNeeded);
        if (block === '0'.repeat(blocksNeeded)) {
          const startHour = 8 + Math.floor(i / 2);
          const startMin = (i % 2) * 30;
          const startTime = `${today}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`;
          foundSlot = startTime;
          break;
        }
      }
    }

    context.log('⏰ Första lediga slot (60 min):', foundSlot || 'Ingen ledig tid hittades');

    context.res = {
      status: 200,
      body: {
        message: 'Testad getSchedule',
        room: testRoom,
        firstAvailableSlot: foundSlot,
        availabilityView: availability,
        raw: scheduleResponse
      }
    };
  } catch (err) {
    context.log.error('❌ Fel:', err.message);
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  }
};

export default run;