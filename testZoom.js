const createZoomClient = require('./shared/calendar/zoomClient');
require('dotenv').config();

async function runTest() {
  const zoomClient = createZoomClient();
  try {
    const result = await zoomClient.createMeeting({
      topic: 'Testmöte via Zoom',
      start: new Date(Date.now() + 5 * 60000).toISOString(), // 5 min från nu
      duration: 20
    });
    console.log('✅ Zoom-möte skapat:');
    console.log(result);
  } catch (err) {
    console.error('❌ Zoom createMeeting misslyckades:', err.message);
  }
}

runTest();