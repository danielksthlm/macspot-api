DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'meeting_type'
  ) THEN
    ALTER TABLE bookings ADD COLUMN meeting_type TEXT;
  END IF;
END $$;