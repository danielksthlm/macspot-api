let delegatedAccessToken = null;

import fetch from 'node-fetch';
import pkg from 'pg';
import readline from 'readline';
const { Pool } = pkg;

export const run = async function (context, req) {
  context.log('🟢 getavailableslots index.js startar...');
  context.log('✅ Funktion getavailableslots anropad');
  if (!req.body) {
    context.log('⚠️ req.body är undefined – kontrollera att Content-Type är application/json');
    context.res = {
      status: 400,
      body: { error: 'Ingen request body hittades. Kontrollera att Content-Type är application/json.' }
    };
    return;
  }
  context.log('🧪 typeof req.body:', typeof req.body);
  context.log('🧪 req.body keys:', Object.keys(req.body));
  context.log('📥 Full request body:', JSON.stringify(req.body, null, 2));

  const findRooms = await fetchGraph('/me/findRooms');
  context.log('📦 /me/findRooms-resultat:', JSON.stringify(findRooms, null, 2));

  const allPlaces = await fetchGraph('/places/microsoft.graph.room');
  context.log('📦 /places/microsoft.graph.room-resultat:', JSON.stringify(allPlaces, null, 2));

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

  async function getAccessTokenDelegated() {
    const res = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/devicecode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        scope: 'https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/User.Read'
      })
    });

    const data = await res.json();
    context.log(`📲 Besök ${data.verification_uri} och ange koden: ${data.user_code}`);

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const tokenRes = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            client_id: clientId,
            device_code: data.device_code
          })
        });

        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
          clearInterval(interval);
          resolve(tokenData.access_token);
        } else if (tokenData.error !== 'authorization_pending') {
          clearInterval(interval);
          reject(new Error(`❌ Fel vid tokenhämtning: ${tokenData.error}`));
        }
      }, data.interval * 1000);
    });
  }

  async function fetchGraph(endpoint, method = 'GET', body = null) {
    if (!delegatedAccessToken) {
      delegatedAccessToken = await getAccessTokenDelegated();
    }
    const res = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${delegatedAccessToken}`,
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
    // const allUsers = await fetchGraph('/users');
    // context.log(`🧪 Antal användare hämtade: ${allUsers.value?.length || 0}`);
    // context.log('📋 Alla användare:', JSON.stringify(allUsers, null, 2));
    // Hämta room_priority från booking_settings
    const priorityResult = await pool.query("SELECT value FROM booking_settings WHERE key = 'room_priority'");
    const roomPriority = priorityResult.rows[0]?.value || {};
    const selectedRoomsRaw = [
      'lillarummet@ettelva.se',
      'motesrummet@ettelva.se',
      'audiensen@ettelva.se',
      'mellanrummet@ettelva.se',
      'konferensen@ettelva.se'
    ];
    // const usersResponse = await fetchGraph('/users');
    // const userEmails = (usersResponse.value || []).map(user => {
    //   context.log(`👤 Användare: ${user.displayName} | ${user.mail} | ${user.userPrincipalName}`);
    //   return user.mail || user.userPrincipalName;
    // });
    const selectedRooms = selectedRoomsRaw;
    context.log(`🏢 Valda rum för meeting_type ${meeting_type}:`, selectedRooms);
    context.log('🔎 Filtrerade rum (åtkomliga via Graph):', selectedRooms);

    // Använd valda rum istället för tidigare roomList
    // const roomList = selectedRooms;

    if (selectedRooms.length === 0) {
      context.res = {
        status: 404,
        body: { error: `Inga rum hittades för meeting_type '${meeting_type}' i booking_settings.` }
      };
      return;
    }

    const testRooms = [
      'lillarummet@ettelva.se',
      'motesrummet@ettelva.se',
      'audiensen@ettelva.se',
      'mellanrummet@ettelva.se',
      'konferensen@ettelva.se'
    ];
    const today = new Date().toISOString().split('T')[0];
    const blocksNeeded = 60 / 30;

    const testResults = [];

    for (const testRoom of testRooms) {
      context.log(`📌 Testar tillgång mot rum: ${testRoom}`);
      const roomBody = {
        schedules: [testRoom],
        startTime: { dateTime: `${today}T08:00:00`, timeZone: 'Europe/Stockholm' },
        endTime: { dateTime: `${today}T17:00:00`, timeZone: 'Europe/Stockholm' },
        availabilityViewInterval: 30
      };
      context.log(`📅 getSchedule-test via /me/calendar/getSchedule för ${testRoom}:`, JSON.stringify(roomBody, null, 2));
      const roomResponse = await fetchGraph(`/me/calendar/getSchedule`, 'POST', roomBody);
      context.log('🧾 Fullt svar från Graph getSchedule:', JSON.stringify(roomResponse, null, 2));

      const availability = roomResponse.value?.[0]?.availabilityView;
      let firstSlot = null;
      if (availability && availability.includes('0'.repeat(blocksNeeded))) {
        for (let i = 0; i <= availability.length - blocksNeeded; i++) {
          const block = availability.slice(i, i + blocksNeeded);
          if (block === '0'.repeat(blocksNeeded)) {
            const startHour = 8 + Math.floor(i / 2);
            const startMin = (i % 2) * 30;
            firstSlot = `${today}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`;
            break;
          }
        }
      }
      testResults.push({
        room: testRoom,
        valid: !!availability,
        firstAvailableSlot: firstSlot,
        availabilityView: availability || null
      });
    }

    context.res = {
      status: 200,
      body: {
        message: 'Testresultat för rum',
        roomsFromFindRooms: findRooms,
        roomsFromPlaces: allPlaces,
        results: testResults
      }
    };
    return;

  } catch (err) {
    context.log.error('❌ Fel:', err.message);
    context.res = {
      status: 500,
      body: { error: err.message }
    };
  }
};

export default run;