require('dotenv').config();
const createZoomClient = require('./shared/calendar/zoomClient');
const createGraphClient = require('./shared/calendar/msGraph');

async function runTest() {
  const zoom = createZoomClient();
  const graph = createGraphClient();

  try {
    const now = new Date();
    const start = new Date(now.getTime() + 10 * 60000).toISOString();
    const end = new Date(now.getTime() + 40 * 60000).toISOString();

    const zoomMeeting = await zoom.createMeeting({
      topic: "Testmöte via Zoom",
      start,
      duration: 30
    });

    console.log("✅ Zoom-möte skapat:");
    console.log(JSON.stringify(zoomMeeting, null, 2));

    const result = await graph.createEvent({
      start,
      end,
      subject: zoomMeeting.topic,
      location: zoomMeeting.join_url,
      attendees: [process.env.TEST_EMAIL || "daniel.kallberg@mac.com"]
    });

    console.log("✅ Inbjudan via Graph skickad:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("❌ Fel:", err.message);
  }
}

runTest();