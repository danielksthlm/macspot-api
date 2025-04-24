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