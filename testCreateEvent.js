const graphClient = require('./shared/calendar/msGraph')();

(async () => {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 60000); // 30 min

  console.log("📤 Skickar createEvent med följande värden:");
  console.log({ subject: "Testmöte via Teams", start: start.toISOString(), end: end.toISOString(), location: "Online", attendees: ["daniel.kallberg@mac.com"] });

  const response = await graphClient.createEvent({
    subject: "Testmöte via Teams",
    start: start.toISOString(),
    end: end.toISOString(),
    location: "Online",
    attendees: ["daniel.kallberg@mac.com"]
  });

  console.log("✅ Resultat från createEvent:", response);
})();