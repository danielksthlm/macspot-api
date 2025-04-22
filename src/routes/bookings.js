// File: routes/bookings.js
import { app } from '@azure/functions';
import db from '../lib/utils/db.js';
import { insertBooking, getBookingSettings, getBookingById } from '../lib/bookingService.js';
import { resolveLocationType, bookMeetingRoom } from '../lib/calendar/roomBooking.js';
import { sendConfirmationEmail } from '../lib/notification/emailSender.js';
import { logEvent } from '../lib/log/eventLogger.js';
import { createMicrosoft365Booking } from '../lib/calendar/ms365Calendar.js';
import { hasAppleCalendarConflict } from '../lib/calendar/appleCalendar.js';
import { v4 as uuidv4 } from 'uuid';

app.http('bookings', {
  methods: ['POST'],
  route: 'bookings',
  authLevel: 'anonymous',
  handler: async (req, context) => {
    const data = await req.json();

    if (!data.name || !data.email || !data.start_time || !data.end_time || !data.meeting_type) {
      return new Response(JSON.stringify({
        success: false,
        message: "Missing required fields"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    try {
      const settings = await getBookingSettings(db);
      
      const hasConflict = await hasAppleCalendarConflict(
        data.start_time,
        data.end_time,
        data.email,
        settings
      );
      
      if (hasConflict) {
        return new Response(JSON.stringify({
          success: false,
          message: "Krock med kalender – välj annan tid"
        }), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        });
      }

      const room_email = await bookMeetingRoom(data.meeting_type, settings, data.start_time, data.end_time);
      const location_type = resolveLocationType(data.meeting_type);

      const booking = {
        id: uuidv4(),
        contact_id: null,
        start_time: data.start_time,
        end_time: data.end_time,
        meeting_type: data.meeting_type,
        location_type,
        room_email,
        language: "sv",
        meeting_link: null,
        event_id: null
      };

      // 4. Skapa möte i Microsoft 365 om relevant
      if (data.meeting_type === "Teams") {
        const result = await createMicrosoft365Booking(booking, { ...data, email: data.email || process.env.MS_SENDER_EMAIL });
        if (result.success) {
          booking.meeting_link = result.meetingLink;
          booking.event_id = result.eventId;
        }
      }

      const savedBooking = await insertBooking(db, booking, booking.contact_id);
      await logEvent(db, booking.id, "booking_created", { meeting_type: data.meeting_type });
 
      await sendConfirmationEmail(data, savedBooking);

      return new Response(JSON.stringify({
        success: true,
        booking_id: booking.id,
        room_email
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      context.error("❌ Booking error", err);
      return new Response(JSON.stringify({
        success: false,
        message: "Internal server error"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
});

app.http('getBookingById', {
  methods: ['GET'],
  route: 'bookings/{id}',
  authLevel: 'anonymous',
  handler: async (req, context) => {
    const id = req.params.id;

    if (!id) {
      return new Response(JSON.stringify({
        success: false,
        message: "Missing booking ID"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    try {
      const booking = await getBookingById(db, id);
      if (!booking) {
        return new Response(JSON.stringify({
          success: false,
          message: "Booking not found"
        }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        booking
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      context.error("❌ Get booking by ID error", err);
      return new Response(JSON.stringify({
        success: false,
        message: "Internal server error"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
});
// GET /bookings - fetch all bookings
app.http('getAllBookings', {
  methods: ['GET'],
  route: 'bookings',
  authLevel: 'anonymous',
  handler: async (req, context) => {
    try {
      const result = await db.query('SELECT * FROM bookings ORDER BY start_time DESC');
      return new Response(JSON.stringify({
        success: true,
        bookings: result.rows
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      context.error("❌ Error fetching all bookings", err);
      return new Response(JSON.stringify({
        success: false,
        message: "Internal server error"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
});