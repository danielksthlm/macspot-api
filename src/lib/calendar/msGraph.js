// File: lib/msgraph/msGraph.js
const { getAccessToken } = require("../msgraph/msGraph");
const { debug } = require("../utils/debug");
const fetch = require("node-fetch");

/**
 * Hämtar första tillgängliga rum från Graph med getSchedule().
 */
async function getAvailableRoomFromGraph(settings, start, end) {
  const rooms = settings.available_meeting_room || [];
  if (rooms.length === 0) return null;

  const token = await getAccessToken();
  debug("graph", "Token hämtat för getSchedule");

  const res = await fetch("https://graph.microsoft.com/v1.0/users/daniel@klrab.se/calendar/getSchedule", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      schedules: rooms,
      startTime: {
        dateTime: start,
        timeZone: "Europe/Stockholm"
      },
      endTime: {
        dateTime: end,
        timeZone: "Europe/Stockholm"
      },
      availabilityViewInterval: 30
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("❌ getSchedule Graph error: " + err);
  }

  const data = await res.json();
  debug("graph", "Svar från getSchedule", { schedules: data.value.map(s => s.scheduleId) });

  for (const schedule of data.value) {
    if (!schedule.availabilityView?.includes("1")) {
      debug("graph", "Rum ledigt enligt Graph", { scheduleId: schedule.scheduleId });
      return schedule.scheduleId;
    }
  }

  debug("graph", "Inget rum ledigt enligt Graph");
  return null;
}

async function bookMeetingRoom(settings, data) {
  if (data.meetingType !== "Fysiskt hos kund") {
    return await getAvailableRoomFromGraph(settings, data.start_time, data.end_time);
  }
  // ... (övrig kod för bookMeetingRoom)
}

module.exports = {
  bookMeetingRoom,
  getAvailableRoomFromGraph
};