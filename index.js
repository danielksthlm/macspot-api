console.log("🚀 index.js är igång!");

import './src/routes/bookings.js';
import './src/routes/getAvailableSlots.js';
import './src/routes/status.js';
import './src/routes/health.js';
import cors from 'cors';

app.use(cors({
  origin: [
    'https://klrab.webflow.io',  // Tillåt Webflow
    'https://klrab.se'     // (sen när du har egen domän)
  ]
}));