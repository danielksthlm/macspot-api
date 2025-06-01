const fetch = require("node-fetch");
require("dotenv").config();
const getMsToken = require("./shared/calendar/getMsToken");

(async () => {
  const token = await getMsToken({ log: console });
  if (!token) {
    console.log("❌ Kunde inte hämta token");
    return;
  }

  const calendarId = process.env.MS365_USER_EMAIL;
  const event = {
    subject: "Testmöte via Graph",
    start: {
      dateTime: "2025-06-04T12:00:00",
      timeZone: "Europe/Stockholm"
    },
    end: {
      dateTime: "2025-06-04T12:30:00",
      timeZone: "Europe/Stockholm"
    },
    location: {
      displayName: "Testlokal"
    },
    attendees: [
      {
        emailAddress: {
          address: "daniel.kallberg@mac.com"
        },
        type: "required"
      }
    ],
    isOnlineMeeting: false,
    allowNewTimeProposals: true
  };

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${calendarId}/events`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": 'outlook.timezone="Europe/Stockholm"'
    },
    body: JSON.stringify(event)
  });

  const result = await res.text();
  console.log("📬 Status:", res.status);
  console.log("📦 Svar från Graph:", result);
})();