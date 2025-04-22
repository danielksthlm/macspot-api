import { insertBooking } from "../bookingService.js";
import { sendConfirmationEmail } from "../notification/emailSender.js";
import { logEvent } from "../log/eventLogger.js";
import { v4 as uuidv4 } from "uuid";

function resolveLocationType(type) {
  const map = {
    Zoom: "online",
    Teams: "online",
    FaceTime: "facetime",
    atClient: "onsite",
    atOffice: "onsite"
  };
  return map[type] || "online";
}
function bookMeetingRoom(meetingType, settings, startTime, endTime) {
  const preferred = settings.room_priority?.[meetingType] ?? [];
  const selectedRoom = preferred.length > 0 ? preferred[0] : null;
  console.log(`🏢 Vald mötesrum (${meetingType}):`, selectedRoom);
  return selectedRoom;
}
export { resolveLocationType, bookMeetingRoom };

// Temporary fallback to avoid crash if another file expects this export
export function getAvailableRoomFromGraph(meetingType, settings) {
  const fallback = settings.room_priority?.[meetingType]?.[0] ?? null;
  if (fallback) {
    console.log(`🏢 Tilldelat mötesrum för ${meetingType}:`, fallback);
  } else {
    console.warn("⚠️ Inget fallback-rum hittades i room_priority för:", meetingType);
  }
  return fallback;
}