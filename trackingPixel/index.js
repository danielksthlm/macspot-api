const { v4: uuidv4 } = require('uuid');
const pool = require('../shared/db/pgPool');

module.exports = async function (context, req) {
    const bookingId = req.query.booking_id || 'unknown';
    const ip = req.headers['x-forwarded-for'] || req.headers['x-client-ip'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';
    const now = new Date().toISOString();
  
    try {
      await pool.query(
        `INSERT INTO event_log (id, booking_id, event_type, source, timestamp)
         VALUES ($1, $2, 'email_open', 'tracking_pixel', $3)`,
        [uuidv4(), bookingId, new Date()]
      );
    } catch (err) {
      context.log('⚠️ Kunde inte logga email_open:', err.message);
    }
  
    // Logga till databasen eller event_log (kan du välja själv senare)
    context.log(`📩 TrackingPixel öppnad | booking_id=${bookingId} | ip=${ip} | ua=${userAgent} | tid=${now}`);
  
    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64') // 1x1 transparent GIF
    };
  };