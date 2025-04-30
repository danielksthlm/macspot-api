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

function getPreferredRoom(meetingType, settings) {
  const preferred = settings.room_priority?.[meetingType] ?? [];
  const selectedRoom = preferred[0] ?? null;

  if (selectedRoom) {
    console.log(`🏢 Tilldelat mötesrum för ${meetingType}:`, selectedRoom);
  } else {
    const message = `⚠️ Inget rum hittades för mötestypen: ${meetingType}`;
    console.warn(message);
    logEvent("room_selection", "no_room_found", { meetingType, timestamp: new Date().toISOString() });
  }

  return selectedRoom;
}

async function bookMeetingRoom(meetingType, settings, startTime, endTime) {
  if (meetingType !== "Fysiskt hos kund") {
    const { getAvailableRoomFromGraph } = await import('./msGraph.js');
    return await getAvailableRoomFromGraph(settings, startTime, endTime);
  }
  // Annars returnera null eller annan logik för fysiska möten
  return null;
}

export { resolveLocationType, bookMeetingRoom };
export default getPreferredRoom;