import jwt from "jsonwebtoken";
import fetch from "node-fetch";

function getAccessToken() {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  const token = jwt.sign({}, privateKey, {
    algorithm: "ES256",
    issuer: teamId,
    header: {
      alg: "ES256",
      kid: keyId
    },
    expiresIn: "5m",
    audience: "https://graph.microsoft.com/"
  });

  return Promise.resolve(token);
}

import { debug } from "../utils/debug.js";
import { logEvent } from "../log/eventLogger.js";

/**
 * Hämtar första tillgängliga rum från Graph med getSchedule().
 */
async function getAvailableRoomFromGraph(settings, start, end) {
  try {
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
      logEvent("error", "msGraph: getSchedule", err);
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
  } catch (error) {
    logEvent("error", "msGraph: getAvailableRoomFromGraph", error.message);
    throw error;
  }
}

async function bookMeetingRoom(settings, data) {
  try {
    if (data.meetingType !== "Fysiskt hos kund") {
      return await getAvailableRoomFromGraph(settings, data.start_time, data.end_time);
    }
    // ... (övrig kod för bookMeetingRoom)
  } catch (error) {
    logEvent("error", "msGraph: bookMeetingRoom", error.message);
    throw error;
  }
}


export default {
  bookMeetingRoom,
  getAvailableRoomFromGraph
};