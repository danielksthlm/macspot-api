import fetch from 'node-fetch';

console.log('🟢 getavailableslots index.js startar...');

const tenantId = process.env.GRAPH_TENANT_ID;
const clientId = process.env.GRAPH_CLIENT_ID;
const clientSecret = process.env.GRAPH_CLIENT_SECRET;

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

async function fetchGraph(endpoint, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  return data;
}

export default async function (context, req) {
  context.log('✅ Funktion getavailableslots anropad');

  try {
    console.log('🔍 Hämtar alla rum...');
    const rooms = await fetchGraph('/places/microsoft.graph.room');
    console.log('📦 Alla rum:', JSON.stringify(rooms, null, 2));

    console.log('\n🔍 Hämtar alla rumslistor...');
    const roomLists = await fetchGraph('/places/microsoft.graph.roomlist');
    console.log('🏢 Rumslistor:', JSON.stringify(roomLists, null, 2));

    const testRoomEmail = 'konferensen@ettelva.se';
    console.log(`\n🔍 Hämtar platsinfo för ${testRoomEmail}...`);
    const roomDetails = await fetchGraph(`/places/${encodeURIComponent(testRoomEmail)}`);
    console.log('📍 Platsinfo:', JSON.stringify(roomDetails, null, 2));

    console.log(`\n📅 Testar getSchedule för ${testRoomEmail}...`);
    const scheduleResponse = await fetchGraph('/users/' + encodeURIComponent(testRoomEmail) + '/calendar/getSchedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        schedules: [testRoomEmail],
        startTime: {
          dateTime: new Date().toISOString(),
          timeZone: 'Europe/Stockholm'
        },
        endTime: {
          dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          timeZone: 'Europe/Stockholm'
        },
        availabilityViewInterval: 30
      })
    });
    const scheduleData = await scheduleResponse.json();
    console.log('📆 getSchedule-svar:', JSON.stringify(scheduleData, null, 2));

  } catch (err) {
    console.error('❌ Fel vid Graph-anrop:', err.message);
  }
}