CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE slot_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_email TEXT NOT NULL,
  meeting_type TEXT NOT NULL,
  meeting_length INT NOT NULL,
  slot_day DATE NOT NULL,
  slot_part TEXT NOT NULL,
  slots JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE available_slots_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_type TEXT NOT NULL,
  meeting_length INT NOT NULL,
  slot_day DATE NOT NULL,
  slot_part TEXT NOT NULL,
  slot_iso TEXT NOT NULL,
  slot_score INT NOT NULL,
  travel_time_min INT,
  generated_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP
);
