import dotenv from 'dotenv';
dotenv.config();

console.log("🚀 index.js är igång!");
console.log("🌱 Miljövariabler laddade från .env");
console.log(`🛠️  NODE_ENV: ${process.env.NODE_ENV || 'inte definierad'}`);
console.log(`📦  API körs i: ${process.env.LOCAL ? 'lokalt läge' : 'Azure-läge'}`);

import './src/routes/bookings.js';
import './src/routes/getAvailableSlots.js';
import './src/routes/status.js';
import './src/routes/health.js';


export default async function (context, req) {
  const { url, method } = req;
  console.log(`🌐 Inkommande request: ${method} ${url}`);

  if (url === '/api/health') {
    const health = await import('./src/routes/health.js');
    return await health.default(context, req);
  }

  if (url === '/api/bookings') {
    const bookings = await import('./src/routes/bookings.js');
    return await bookings.default(context, req);
  }

  if (url === '/api/getAvailableSlots') {
    const slots = await import('./src/routes/getAvailableSlots.js');
    return await slots.default(context, req);
  }

  if (url === '/api/status') {
    const status = await import('./src/routes/status.js');
    return await status.default(context, req);
  }

  context.res = {
    status: 404,
    body: { error: 'Not found' },
  };
}