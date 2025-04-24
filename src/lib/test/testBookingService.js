import * as bookingService from '../bookingService.js';
import pool from '../db/db.js';

async function runTest() {
  try {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    const newBooking = {
      email: 'test@example.com',
      start_time: now.toISOString(),
      end_time: oneHourLater.toISOString(),
      meeting_type: 'Zoom',
      room_email: 'testroom@domain.com',
      language: 'sv',
      notes: 'Testbokning via script'
    };

    const result = await bookingService.createBookingInDB(pool, newBooking, null);
    console.log('✅ Bokning skapad:', result);
  } catch (error) {
    console.error('❌ Fel vid skapande av bokning:', error.message);
  } finally {
    await pool.end();
  }
}

runTest();