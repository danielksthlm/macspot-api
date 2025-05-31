module.exports = async function (context, req) {
    const bookingId = req.query.booking_id || 'unknown';
    const ip = req.headers['x-forwarded-for'] || req.headers['x-client-ip'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';
    const now = new Date().toISOString();
  
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