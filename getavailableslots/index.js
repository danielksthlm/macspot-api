const { getSession } = require('@auth0/nextjs-auth0');
const { connectToDatabase } = require('../../lib/mongodb');
const { getSettings } = require('../../lib/settings');

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  try {
    const session = getSession(req, res);
    if (!session) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { db } = await connectToDatabase();
    const settings = await getSettings(db);
    if (!settings) {
      res.status(500).json({ message: 'Settings not found' });
      return;
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ message: 'Missing startDate or endDate' });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ message: 'Invalid date format' });
      return;
    }

    if (start > end) {
      res.status(400).json({ message: 'startDate must be before endDate' });
      return;
    }

    const slots = [];
    const slotDuration = settings.slotDurationMinutes || 30;
    const openingHour = settings.openingHour || 8;
    const closingHour = settings.closingHour || 18;

    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      if (day.getDay() === 0 || day.getDay() === 6) {
        continue; // Skip weekends
      }

      for (let hour = openingHour; hour < closingHour; hour += slotDuration / 60) {
        const slotStart = new Date(day);
        slotStart.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);

        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ slots });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

module.exports = handler;
