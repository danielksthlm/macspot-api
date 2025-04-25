import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors({
  origin: [
    'https://klrab.webflow.io',
    'https://klrab.se'
  ]
}));

// Därefter importerar du routes
import './src/routes/bookings.js';
import './src/routes/getAvailableSlots.js';
import './src/routes/status.js';
import './src/routes/health.js';
import './src/routes/meetingTypes.js';