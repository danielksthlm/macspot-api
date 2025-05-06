const { getAvailableSlots } = require('../availableSlots/logic');
const { logInfo } = require('../shared/log');
const { connectToDb, closeDb } = require('../shared/db');
const { getContactByEmail } = require('../shared/contact');
const { getBookingSettings } = require('../shared/bookingSettings');
const { cacheSlots } = require('../shared/slotCache');
const dayjs = require('dayjs');

module.exports = async function (context, req) {
  const startTime = Date.now();
  logInfo('📥 Funktion refreshRemainingSlots anropad');

  const email = req.body?.email;
  const meetingType = req.body?.meeting_type;
  const meetingLength = req.body?.meeting_length || 60;

  if (!email || !meetingType) {
    context.res = {
      status: 400,
      body: 'Missing email or meeting_type',
    };
    return;
  }

  try {
    await connectToDb();

    const contact = await getContactByEmail(email);
    if (!contact) {
      context.res = {
        status: 404,
        body: 'Contact not found',
      };
      return;
    }

    const settings = await getBookingSettings();
    const now = dayjs();
    const endOfMonth = now.endOf('month');

    logInfo('📅 Förladdar slots för innevarande månad...');
    const currentMonthSlots = await getAvailableSlots({
      email,
      meetingType,
      meetingLength,
      contact,
      settings,
      onlyAfter: now.startOf('month'),
      onlyBefore: now.endOf('month'),
    });
    for (const slot of currentMonthSlots) {
      await cacheSlots(slot);
    }

    logInfo('🚧 Startar förladdning av slots utanför innevarande månad...');

    const slots = await getAvailableSlots({
      email,
      meetingType,
      meetingLength,
      contact,
      settings,
      onlyAfter: endOfMonth.add(1, 'minute'),
    });

    for (const slot of slots) {
      await cacheSlots(slot); // cache-funktionen hanterar duplicat internt
    }

    const duration = Date.now() - startTime;
    logInfo(`✅ refreshRemainingSlots klar på ${duration} ms`);
    // Trigger background refresh of remaining slots
    try {
      fetch('https://macspotbackend.azurewebsites.net/api/refreshremainingslots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          meeting_type: meetingType,
          meeting_length: meetingLength,
        }),
      });
      logInfo('🔁 Bakgrundsanrop till refreshRemainingSlots initierat');
    } catch (e) {
      logInfo(`⚠️ Fel vid bakgrundsanrop: ${e.message}`);
    }
    context.res = {
      status: 200,
      body: `Refreshed remaining slots after ${endOfMonth.format('YYYY-MM-DD')}`,
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: `Fel: ${err.message}`,
    };
  } finally {
    await closeDb();
  }
};