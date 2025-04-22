import { v4 as uuidv4 } from 'uuid';
import { resolveLocationType } from './calendar/roomBooking.js';

function mapMeetingTypeToLocationType(type) {
  const map = {
    Zoom: "online",
    Teams: "online",
    FaceTime: "facetime",
    atClient: "onsite",
    atOffice: "onsite"
  };
  return map[type] || "online";
}

/**
 * Validerar att obligatoriska bokningsfält finns.
 * Returnerar en lista med felmeddelanden (tom om inga fel).
 */
function validateBookingInput(data) {
  const errors = [];
  if (!data.email) errors.push('Missing email');
  if (!data.start_time) errors.push('Missing start_time');
  if (!data.end_time) errors.push('Missing end_time');
  return errors;
}

/**
 * Kontrollerar om bokningen uppfyller alla affärsvillkor.
 * Returnerar en lista med felmeddelanden.
 */
async function checkBookingConditions(data, settings = {}) {
  // 1. Helg/blockerade dagar
  if (settings.block_weekends === true && isWeekend(data.start_time)) {
    return ["Bokning blockerad på helg"];
  }

  // 2. Tidfönster
  const { travel_time_window } = settings;
  if (travel_time_window) {
    const startHour = new Date(data.start_time).getHours();
    const endHour = new Date(data.end_time).getHours();
    const windowStart = parseInt(travel_time_window.start.split(":")[0], 10);
    const windowEnd = parseInt(travel_time_window.end.split(":")[0], 10);

    if (startHour < windowStart || endHour > windowEnd) {
      return [`Mötet ligger utanför tillåtet restidsfönster (${travel_time_window.start}–${travel_time_window.end})`];
    }
  }

  // 3. Mötesrum (mock)
  if (settings.room_available === false) {
    return ["Inget ledigt mötesrum tillgängligt"];
  }

  // 4. Restid
  if (settings.travel_time_ok === false) {
    return ["Otillräcklig restid till/från möte"];
  }

  // 5. Minimilängd
  const duration = (new Date(data.end_time) - new Date(data.start_time)) / 60000;
  const minLength = settings.min_length || 20;
  if (duration < minLength) {
    return [`Mötet är kortare än tillåtet minimum (${minLength} min)`];
  }

  // 6. Veckokvot
  const remainingMinutes = settings.remaining_weekly_minutes ?? Infinity;
  if (duration > remainingMinutes) {
    return ["Överskrider veckogräns för bokningar"];
  }

  // 7. Krockkontroll
  if (settings.require_calendar_check && settings.calendar_conflict) {
    return ["Krock med annan kalenderhändelse"];
  }

  return []; // Allt godkänt
}

// Hjälpfunktion för att avgöra om datumet är en helg
function isWeekend(dateString) {
  const day = new Date(dateString).getDay();
  return day === 0 || day === 6; // Söndag = 0, Lördag = 6
}

/**
 * Sparar bokningen till PostgreSQL.
 */
async function createBookingInDB(db, data, contactId) {
  if (!data || !data.meeting_type) {
    throw new Error("Ogiltig data – meeting_type saknas");
  }
  const locationType = resolveLocationType(data.meeting_type);
  // Generera möteslänk beroende på typ
  if (!data.meeting_link) {
    if (data.meeting_type === "Zoom") {
      data.meeting_link = `https://zoom.us/j/${uuidv4()}`;
    } else if (data.meeting_type === "Teams") {
      data.meeting_link = `https://teams.microsoft.com/l/meetup-join/${uuidv4()}`;
    } else if (data.meeting_type === "FaceTime") {
      data.meeting_link = `facetime://${data.email}`;
    }
  }
  const result = await db.query(
    `INSERT INTO bookings (
      id, contact_id, start_time, end_time, meeting_type, location_type,
      room_email, language, created_at,
      event_id, meeting_link
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, now(),
      $9, $10
    ) RETURNING *`,
    [
      uuidv4(),
      contactId,
      data.start_time,
      data.end_time,
      data.meeting_type || "unspecified",
      locationType,
      data.room_email || null,
      data.language || "sv",
      data.event_id || null,
      data.meeting_link || null
    ]
  );

  return result.rows[0];
}

/**
 * Hämtar booking settings från databasen och transformerar till objekt.
 */
async function getBookingSettings(db) {
  const result = await db.query(
    `SELECT key, value, value_type FROM booking_settings`
  );

  const rows = result.rows;
  const settings = {};

  for (const row of rows) {
    try {
      if (["json", "array"].includes(row.value_type)) {
        try {
          const val = typeof row.value === 'string' ? row.value.trim() : row.value;
          const normalized = typeof val === 'string' && val.startsWith('"') ? JSON.parse(val) : val;
          settings[row.key] = typeof normalized === 'string' ? JSON.parse(normalized) : normalized;
        } catch (e) {
          console.warn("❌ Dubbel JSON.parse misslyckades:", row.key, e);
        }
      } else if (row.value_type === "bool") {
        settings[row.key] = row.value === "true";
      } else if (row.value_type === "int") {
        settings[row.key] = parseInt(row.value, 10);
      } else {
        settings[row.key] = row.value;
      }
    } catch (e) {
      console.warn("❌ Misslyckades att parsa inställning:", row.key, e);
    }
  }

  return settings;
}

async function getWeeklyBookingMinutes(db, meetingType, date) {
  const res = await db.query(
    `SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS minutes
     FROM bookings
     WHERE meeting_type = $1
       AND start_time >= $2::date
       AND start_time < ($2::date + interval '7 days')`,
    [meetingType, date]
  );
  return parseInt(res.rows[0].minutes) || 0;
}

export {
  validateBookingInput,
  checkBookingConditions,
  getBookingSettings,
  isWeekend,
  createBookingInDB,
  createBookingInDB as insertBooking,
  getWeeklyBookingMinutes
};
