import fetch from 'node-fetch';

export const run = async function (context, req) {
  context.log('🟢 getavailableslots index.js startar...');
  context.log('✅ Funktion getavailableslots anropad');

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
    return await res.json();
  }

  try {
    // 🏢 Steg 1 – Prova places med typ room
    context.log('🔍 Hämtar /places/microsoft.graph.room...');
    const roomsTyped = await fetchGraph('/places/microsoft.graph.room?$top=999');
    context.log('📦 Resultat /places/microsoft.graph.room:', JSON.stringify(roomsTyped, null, 2));

    // 🌍 Steg 2 – Prova places generellt
    context.log('\n🌍 Hämtar /places...');
    const places = await fetchGraph('/places?$top=999');
    context.log('🌍 Resultat /places:', JSON.stringify(places, null, 2));

    // 👥 Steg 3 – Prova vanliga användare
    context.log('\n👥 Hämtar /users...');
    const users = await fetchGraph('/users?$top=50');
    context.log('👥 Användare:', JSON.stringify(users, null, 2));

    // 🧪 Steg 4 – Testa hårdkodade rumsadresser
    const potentialRooms = [
      'konferensen@ettelva.se',
      'lillarummet@ettelva.se',
      'motesrummet@ettelva.se',
      'audiensen@ettelva.se',
      'mellanrummet@ettelva.se'
    ];
    for (const room of potentialRooms) {
      context.log(`\n📡 Testar platsinfo: ${room}`);
      const info = await fetchGraph(`/places/${encodeURIComponent(room)}`);
      context.log(`📍 Platsinfo för ${room}:`, JSON.stringify(info, null, 2));
    }

  } catch (err) {
    context.log.error('❌ Fel vid Graph-anrop:', err.message);
  }
};

export default run;