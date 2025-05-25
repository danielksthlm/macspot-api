const graphClient = require('./shared/calendar/msGraph')();

(async () => {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 60000); // 30 min

  const response = await graphClient.createEvent({
    subject: "Testmöte via Teams",
    start: start.toISOString(),
    end: end.toISOString(),
    location: "Online",
    attendees: ["daniel@anynode.se"] // ← byt till testmail om du vill
  });

  console.log("✅ Resultat från createEvent:", response);
})();